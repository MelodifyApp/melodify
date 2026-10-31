/**
 * Negotiated Kick guest chat transport (hotfix for the legacy Pusher reader).
 *
 * Implements the anonymous flow verified in docs/KICK-CONNECTION-FINDINGS.md:
 *   POST /realtime/connection       -> selects the Centrifugo WebSocket descriptor
 *   POST /realtime/auth/connection  -> guest transport token (memory only, never logged)
 *   POST /realtime/auth/channel     -> empty token for public channels
 *   WSS Centrifugo: connect, subscribe to `chatrooms.<id>.v2` and `chatroom_<id>`,
 *   answer empty JSON pings, decode one-or-many newline-batched publications.
 *
 * Deliberately dependency-free (node:crypto only) so scripts/ can exercise the
 * production transport under plain Node without Electron, Config, or Spotify.
 * Never logs tokens or raw event contents.
 */

import { randomUUID } from "node:crypto";

export type KickGuestState =
    | "connecting"
    | "connected"
    | "reconnecting"
    | "stopped"
    | "failed";

export interface KickGuestMessageEvent {
    kind: "message";
    username: string;
    message: string;
    badges: string[];
    raw: Record<string, unknown>;
}

export interface KickGuestRewardEvent {
    kind: "reward";
    username: string;
    rewardTitle: string;
    userInput: string;
    raw: Record<string, unknown>;
}

export type KickGuestEvent = KickGuestMessageEvent | KickGuestRewardEvent;

export interface KickGuestSocket {
    send(data: string): void;
    close(): void;
    addEventListener(
        type: string,
        listener: (event: { data?: unknown }) => void
    ): void;
}

export type KickGuestSocketFactory = (url: string) => KickGuestSocket;

export interface KickGuestResponse {
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
}

export interface KickGuestFetchInit {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
}

export type KickGuestFetch = (
    url: string,
    init: KickGuestFetchInit
) => Promise<KickGuestResponse>;

export interface KickGuestTimers {
    setTimeout(handler: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
}

export interface KickGuestOptions {
    chatroomId: string;
    onEvent: (event: KickGuestEvent) => void;
    onState?: (state: KickGuestState) => void;
    /** Injectable for tests; defaults to the runtime global fetch. */
    fetchImpl?: KickGuestFetch;
    /** Injectable for tests; defaults to the runtime global WebSocket. */
    createSocket?: KickGuestSocketFactory;
    /** Injectable for tests; defaults to the runtime globals. */
    timers?: KickGuestTimers;
}

export interface KickGuestClient {
    start(): Promise<void>;
    stop(): void;
}

const BASE_URL = "https://web.kick.com/api/v1/realtime";
const CONNECT_FRAME_ID = 1;
const CLIENT_NAME = "melodify";
const MAX_RECONNECT_ATTEMPTS = 5;
const MAX_RECONNECT_DELAY_MS = 30_000;
const CONNECT_TIMEOUT_MS = 15_000;
/** Bounds the whole negotiate/auth phase, not just the socket handshake. */
const NEGOTIATION_TIMEOUT_MS = 15_000;
/** Fallback session lifetime; the server advertised 2700s for a guest token. */
const DEFAULT_SESSION_TTL_SECONDS = 2700;
/** Refresh this long before the advertised guest session expiry. */
const REFRESH_MARGIN_SECONDS = 300;
/** Centrifugo's default ping interval when the connect reply omits one. */
const DEFAULT_PING_SECONDS = 25;
/** Allow two missed server pings plus a small scheduling margin. */
const LIVENESS_MARGIN_MS = 5_000;
/** Retry a failed renewal while the authoritative old reader stays up. */
const HANDOVER_RETRY_MS = 30_000;
/** Bound duplicate bookkeeping to one small overlapping handover window. */
const DEDUPE_LIMIT = 128;

/**
 * The server's connect reply advertises its ping cadence. A reader that misses
 * two advertised pings is no longer treated as live.
 */
export function kickLivenessDeadlineMs(pingSeconds?: number): number {
    const ping =
        typeof pingSeconds === "number" &&
        Number.isFinite(pingSeconds) &&
        pingSeconds > 0
            ? pingSeconds
            : DEFAULT_PING_SECONDS;
    return Math.max(2_000, Math.round(ping * 2_000 + LIVENESS_MARGIN_MS));
}

const REQUEST_HEADERS: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Origin: "https://kick.com",
    Referer: "https://kick.com/",
    "x-app-platform": "web",
    "User-Agent": "Mozilla/5.0",
};

const defaultFetch: KickGuestFetch = (url, init) => {
    const runtimeFetch = (globalThis as { fetch?: unknown }).fetch;
    if (typeof runtimeFetch !== "function") {
        throw new Error("This runtime does not expose a global fetch");
    }
    return (runtimeFetch as (u: string, i: KickGuestFetchInit) => Promise<KickGuestResponse>)(
        url,
        init
    );
};

const defaultCreateSocket: KickGuestSocketFactory = (url) => {
    const runtimeSocket = (globalThis as { WebSocket?: unknown }).WebSocket;
    if (typeof runtimeSocket !== "function") {
        throw new Error("This runtime does not expose a global WebSocket");
    }
    return new (runtimeSocket as new (url: string) => KickGuestSocket)(url);
};

const defaultTimers: KickGuestTimers = {
    setTimeout: (handler, ms) => setTimeout(handler, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/* --------------------------------------------------------------- decoding */

/**
 * Splits a WebSocket payload into JSON frames. Centrifugo may batch several
 * frames into one message separated by newlines. Malformed lines and
 * non-object values are dropped instead of throwing.
 */
export function parseKickFrames(raw: string): Record<string, unknown>[] {
    const frames: Record<string, unknown>[] = [];
    for (const part of String(raw).split(/\r?\n/)) {
        if (!part.trim()) continue;
        let parsed: unknown;
        try {
            parsed = JSON.parse(part);
        } catch {
            continue;
        }
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            frames.push(parsed as Record<string, unknown>);
        }
    }
    return frames;
}

function eventNameOf(payload: Record<string, unknown>): string | null {
    const candidate = payload.event ?? payload.type;
    if (typeof candidate !== "string" || !candidate) return null;
    // Publications use names like "App\\Events\\ChatMessageEvent".
    const separator = candidate.lastIndexOf("\\");
    return separator === -1 ? candidate : candidate.slice(separator + 1);
}

function decodeJsonBody(value: unknown): Record<string, unknown> | null {
    let candidate = value;
    if (typeof candidate === "string") {
        try {
            candidate = JSON.parse(candidate);
        } catch {
            return null;
        }
    }
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        return null;
    }
    return candidate as Record<string, unknown>;
}

function readString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Decodes a Centrifugo publication payload into a validated event.
 * Handles double-encoded `data` fields and returns null for unknown or
 * malformed publications so they never reach command handling.
 */
export function decodeKickEvent(payload: unknown): KickGuestEvent | null {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return null;
    }
    const envelope = payload as Record<string, unknown>;
    const name = eventNameOf(envelope);
    if (!name) return null;
    const body = decodeJsonBody(envelope.data);
    if (!body) return null;

    if (name === "ChatMessageEvent") {
        const sender =
            body.sender && typeof body.sender === "object" && !Array.isArray(body.sender)
                ? (body.sender as Record<string, unknown>)
                : {};
        const identity =
            sender.identity &&
            typeof sender.identity === "object" &&
            !Array.isArray(sender.identity)
                ? (sender.identity as Record<string, unknown>)
                : {};
        const username = readString(sender.username);
        const message = readString(body.content);
        if (!username || !message) return null;
        const badges = Array.isArray(identity.badges)
            ? identity.badges
                  .map((badge) =>
                      badge && typeof badge === "object"
                          ? (badge as Record<string, unknown>).type
                          : null
                  )
                  .filter(
                      (type): type is string =>
                          typeof type === "string" && type.length > 0
                  )
            : [];
        return { kind: "message", username, message, badges, raw: body };
    }

    if (name === "RewardRedeemedEvent") {
        const username = readString(body.username);
        const rewardTitle = readString(body.reward_title);
        if (!username || !rewardTitle) return null;
        const userInput =
            typeof body.user_input === "string" ? body.user_input.trim() : "";
        return {
            kind: "reward",
            username,
            rewardTitle,
            userInput,
            raw: body,
        };
    }

    return null;
}

/* -------------------------------------------------------------- transport */

interface GuestSession {
    url: string;
    token: string;
    channelTokens: Map<string, string>;
}

interface GuestReader {
    gen: number;
    role: "active" | "candidate";
    socket: KickGuestSocket;
    alive: boolean;
    completed: boolean;
    subscriptionsRequested: boolean;
    ttlSeconds: number;
    pingSeconds: number;
    subscriptionIds: Map<number, string>;
    channelTokens: Map<string, string>;
    handshakeTimer: unknown | null;
    livenessTimer: unknown | null;
    pendingEvents: Array<{ key: string; event: KickGuestEvent }>;
}

async function postJson(
    fetchImpl: KickGuestFetch,
    path: string,
    body: Record<string, unknown>,
    signal: AbortSignal
): Promise<unknown> {
    const response = await fetchImpl(`${BASE_URL}${path}`, {
        method: "POST",
        headers: REQUEST_HEADERS,
        body: JSON.stringify(body),
        signal,
    });
    if (!response.ok) {
        throw new Error(`Kick guest endpoint ${path} returned HTTP ${response.status}`);
    }
    try {
        return await response.json();
    } catch {
        throw new Error(`Kick guest endpoint ${path} returned non-JSON data`);
    }
}

function unwrapData(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const inner = record.data;
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        return inner as Record<string, unknown>;
    }
    return record;
}

async function prepareGuestSession(
    fetchImpl: KickGuestFetch,
    signal: AbortSignal,
    channels: string[],
    isStale: () => boolean
): Promise<GuestSession | null> {
    const clientId = randomUUID();
    const negotiated = unwrapData(
        await postJson(
            fetchImpl,
            "/connection",
            {
                client: { id: clientId, type: "web" },
                capabilities: {
                    accepted_providers: [
                        { provider: "pusher" },
                        { provider: "centrifugo" },
                    ],
                },
            },
            signal
        )
    );
    // A timed-out or superseded cycle must not issue further requests.
    if (isStale()) return null;
    if (!negotiated || negotiated.mode !== "websocket") {
        throw new Error("Kick guest negotiation did not return a WebSocket transport");
    }
    const connections = Array.isArray(negotiated.connections)
        ? negotiated.connections
        : [];
    const centrifugo = connections.find(
        (entry) =>
            entry &&
            typeof entry === "object" &&
            (entry as Record<string, unknown>).provider === "centrifugo"
    ) as Record<string, unknown> | undefined;
    const credentials = centrifugo?.credentials;
    const url =
        credentials && typeof credentials === "object"
            ? (credentials as Record<string, unknown>).url
            : null;
    if (typeof url !== "string" || !url) {
        throw new Error("Kick guest negotiation returned no Centrifugo descriptor");
    }
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "wss:" || !parsedUrl.hostname.endsWith(".kick.com")) {
        throw new Error("Kick guest negotiation returned an unexpected socket destination");
    }

    const authorization = unwrapData(
        await postJson(fetchImpl, "/auth/connection", { client_id: clientId }, signal)
    );
    if (isStale()) return null;
    const token = authorization?.token;
    if (typeof token !== "string" || !token) {
        throw new Error("Kick guest authorization returned no token");
    }

    const channelTokens = new Map<string, string>();
    for (const channel of channels) {
        if (isStale()) return null;
        const channelAuthorization = unwrapData(
            await postJson(fetchImpl, "/auth/channel", { channel }, signal)
        );
        const channelToken = channelAuthorization?.token;
        if (typeof channelToken !== "string") {
            throw new Error("Kick guest channel authorization returned no token");
        }
        if (channelToken) channelTokens.set(channel, channelToken);
    }

    return { url, token, channelTokens };
}

export function createGuestChatClient(options: KickGuestOptions): KickGuestClient {
    const chatroomId = String(options.chatroomId ?? "").trim();
    if (!/^\d+$/.test(chatroomId)) {
        throw new Error("A numeric Kick chatroom id is required");
    }
    const fetchImpl = options.fetchImpl ?? defaultFetch;
    const createSocket = options.createSocket ?? defaultCreateSocket;
    const timers = options.timers ?? defaultTimers;
    const channels = [`chatrooms.${chatroomId}.v2`, `chatroom_${chatroomId}`];

    let running = false;
    let generation = 0;
    let cycle = 0;
    let activeReader: GuestReader | null = null;
    let candidateReader: GuestReader | null = null;
    let negotiationAbort: AbortController | null = null;
    let negotiationTimer: unknown | null = null;
    let refreshTimer: unknown | null = null;
    let reconnectTimer: unknown | null = null;
    let reconnectAttempt = 0;
    let connected = false;
    let renewalInFlight = false;
    const handoverSeen = new Map<string, true>();

    const isCurrent = (gen: number): boolean => running && gen === generation;
    const isCurrentCycle = (gen: number, cycleId: number): boolean =>
        running && cycleId === cycle && gen === generation;
    const isActiveReader = (reader: GuestReader): boolean =>
        running &&
        reader.alive &&
        reader.role === "active" &&
        activeReader === reader &&
        reader.gen === generation;
    const isCandidateReader = (reader: GuestReader): boolean =>
        running &&
        reader.alive &&
        reader.role === "candidate" &&
        candidateReader === reader &&
        reader.gen === generation + 1;

    const emitState = (state: KickGuestState): void => {
        try {
            options.onState?.(state);
        } catch {
            /* subscriber errors must not break the reader */
        }
    };

    const emitEvent = (event: KickGuestEvent): void => {
        try {
            options.onEvent(event);
        } catch {
            /* subscriber errors must not break the reader */
        }
    };

    function clearTimer(handle: unknown | null): void {
        if (handle === null) return;
        try {
            timers.clearTimeout(handle);
        } catch {
            /* ignore */
        }
    }

    function clearOwnedTimers(): void {
        clearTimer(refreshTimer);
        refreshTimer = null;
        clearTimer(reconnectTimer);
        reconnectTimer = null;
        clearTimer(negotiationTimer);
        negotiationTimer = null;
    }

    function stopReader(reader: GuestReader | null): void {
        if (!reader) return;
        reader.alive = false;
        clearTimer(reader.handshakeTimer);
        reader.handshakeTimer = null;
        clearTimer(reader.livenessTimer);
        reader.livenessTimer = null;
        reader.pendingEvents.length = 0;
        try {
            reader.socket.close();
        } catch {
            /* ignore */
        }
    }

    function clearHandoverState(): void {
        handoverSeen.clear();
    }

    function cancelCandidate(): void {
        const candidate = candidateReader;
        candidateReader = null;
        renewalInFlight = false;
        if (candidate) stopReader(candidate);
        clearHandoverState();
    }

    function closeActiveReader(): void {
        const current = activeReader;
        activeReader = null;
        if (current) stopReader(current);
    }

    function rememberHandoverKey(key: string): void {
        if (handoverSeen.size >= DEDUPE_LIMIT) {
            const oldest = handoverSeen.keys().next().value;
            if (oldest !== undefined) handoverSeen.delete(oldest);
        }
        handoverSeen.set(key, true);
    }

    function publicationKey(
        channel: string,
        pub: Record<string, unknown>,
        event: KickGuestEvent
    ): string {
        const offset = pub.offset;
        if (typeof offset === "string" || typeof offset === "number") {
            return `${channel}|offset:${String(offset)}`;
        }
        if (event.kind === "message") {
            return `${channel}|message|${event.username}|${event.message}`;
        }
        return `${channel}|reward|${event.username}|${event.rewardTitle}|${event.userInput}`;
    }

    function scheduleRefresh(gen: number, ttlSeconds: number): void {
        clearTimer(refreshTimer);
        refreshTimer = null;
        if (!isCurrent(gen) || candidateReader) return;
        const ttl =
            Number.isFinite(ttlSeconds) && ttlSeconds > 60
                ? ttlSeconds
                : DEFAULT_SESSION_TTL_SECONDS;
        const delaySeconds = Math.max(30, ttl - REFRESH_MARGIN_SECONDS);
        refreshTimer = timers.setTimeout(() => {
            refreshTimer = null;
            startRenewal(gen);
        }, delaySeconds * 1000);
    }

    function scheduleHandoverRetry(gen: number): void {
        renewalInFlight = false;
        if (!isCurrent(gen) || !activeReader || candidateReader) return;
        clearTimer(refreshTimer);
        refreshTimer = timers.setTimeout(() => {
            refreshTimer = null;
            startRenewal(gen);
        }, HANDOVER_RETRY_MS);
    }

    function startRenewal(gen: number): void {
        if (
            !isCurrent(gen) ||
            !activeReader ||
            candidateReader ||
            renewalInFlight
        ) {
            return;
        }
        renewalInFlight = true;
        clearTimer(refreshTimer);
        refreshTimer = null;
        clearHandoverState();
        void runCycle(gen, "renewal");
    }

    function scheduleReconnect(gen: number): void {
        if (!isCurrent(gen)) return;
        // Invalidate any in-flight negotiation before replacing the reader.
        cycle += 1;
        const abort = negotiationAbort;
        negotiationAbort = null;
        if (abort) {
            try {
                abort.abort();
            } catch {
                /* ignore */
            }
        }
        cancelCandidate();
        closeActiveReader();
        connected = false;
        clearOwnedTimers();
        reconnectAttempt += 1;
        if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
            running = false;
            generation += 1;
            emitState("failed");
            return;
        }
        emitState("reconnecting");
        if (!isCurrent(gen)) return;
        const delay = Math.min(
            MAX_RECONNECT_DELAY_MS,
            1000 * 2 ** (reconnectAttempt - 1)
        );
        reconnectTimer = timers.setTimeout(() => {
            reconnectTimer = null;
            if (!isCurrent(gen)) return;
            void runCycle(gen, "normal");
        }, delay);
    }

    function armLiveness(reader: GuestReader): void {
        clearTimer(reader.livenessTimer);
        reader.livenessTimer = null;
        if (
            !reader.alive ||
            reader.role !== "active" ||
            activeReader !== reader
        ) {
            return;
        }
        reader.livenessTimer = timers.setTimeout(() => {
            reader.livenessTimer = null;
            if (!isActiveReader(reader)) return;
            scheduleReconnect(reader.gen);
        }, kickLivenessDeadlineMs(reader.pingSeconds));
    }

    function completeReader(reader: GuestReader): void {
        if (!reader.alive || reader.completed) return;
        clearTimer(reader.handshakeTimer);
        reader.handshakeTimer = null;
        if (reader.role === "candidate") {
            promoteCandidate(reader);
            return;
        }
        if (!isActiveReader(reader)) return;
        reader.completed = true;
        if (!connected) {
            connected = true;
            reconnectAttempt = 0;
            emitState("connected");
        }
        armLiveness(reader);
        scheduleRefresh(reader.gen, reader.ttlSeconds);
    }

    /**
     * The candidate becomes authoritative and the old reader is closed in one
     * synchronous swap. No publication is rejected while the candidate is
     * negotiating; candidate events are buffered and de-duplicated on swap.
     */
    function promoteCandidate(reader: GuestReader): void {
        if (!isCandidateReader(reader)) {
            stopReader(reader);
            return;
        }
        const old = activeReader;
        candidateReader = null;
        renewalInFlight = false;
        generation = reader.gen;
        reader.role = "active";
        reader.completed = true;
        activeReader = reader;
        if (old) stopReader(old);
        connected = true;
        reconnectAttempt = 0;

        for (const pending of reader.pendingEvents) {
            if (
                !running ||
                !reader.alive ||
                activeReader !== reader
            ) {
                break;
            }
            if (handoverSeen.has(pending.key)) continue;
            rememberHandoverKey(pending.key);
            emitEvent(pending.event);
        }
        reader.pendingEvents.length = 0;
        clearHandoverState();
        armLiveness(reader);
        scheduleRefresh(reader.gen, reader.ttlSeconds);
    }

    function failReader(reader: GuestReader): void {
        if (!reader.alive) return;
        const wasCandidate = candidateReader === reader;
        const wasActive =
            activeReader === reader &&
            reader.gen === generation &&
            running;
        reader.alive = false;
        if (wasCandidate) {
            candidateReader = null;
            renewalInFlight = false;
            stopReader(reader);
            clearHandoverState();
            scheduleHandoverRetry(generation);
            return;
        }
        if (wasActive) {
            activeReader = null;
            stopReader(reader);
            scheduleReconnect(reader.gen);
            return;
        }
        stopReader(reader);
    }

    function handleFrame(
        reader: GuestReader,
        event: { data?: unknown }
    ): void {
        if (!reader.alive) return;
        const readerLive = (): boolean =>
            isActiveReader(reader) || isCandidateReader(reader);
        if (!readerLive()) return;
        if (reader.role === "active" && reader.completed) {
            armLiveness(reader);
        }

        for (const frame of parseKickFrames(String(event?.data ?? ""))) {
            if (!reader.alive || !readerLive()) return;

            // Centrifugo application-level ping: answer with an empty pong.
            if (Object.keys(frame).length === 0) {
                try {
                    reader.socket.send("{}");
                } catch {
                    /* ignore; a broken socket will error/close next */
                }
                continue;
            }

            if (frame.error || frame.disconnect) {
                failReader(reader);
                return;
            }

            if (frame.id === CONNECT_FRAME_ID && frame.connect) {
                if (reader.completed || reader.subscriptionsRequested) {
                    continue;
                }
                reader.subscriptionsRequested = true;
                const ack = frame.connect as Record<string, unknown>;
                if (typeof ack.ttl === "number" && Number.isFinite(ack.ttl)) {
                    reader.ttlSeconds = ack.ttl;
                }
                if (
                    typeof ack.ping === "number" &&
                    Number.isFinite(ack.ping) &&
                    ack.ping > 0
                ) {
                    reader.pingSeconds = ack.ping;
                }
                for (const [id, channel] of reader.subscriptionIds) {
                    const request: Record<string, unknown> = { channel };
                    const channelToken = reader.channelTokens.get(channel);
                    if (channelToken) request.token = channelToken;
                    try {
                        reader.socket.send(
                            JSON.stringify({ id, subscribe: request })
                        );
                    } catch {
                        failReader(reader);
                        return;
                    }
                }
                continue;
            }

            if (
                typeof frame.id === "number" &&
                frame.subscribe &&
                reader.subscriptionIds.delete(frame.id) &&
                reader.subscriptionIds.size === 0
            ) {
                completeReader(reader);
                continue;
            }

            const push = frame.push;
            if (push && typeof push === "object" && !Array.isArray(push)) {
                const pushRecord = push as Record<string, unknown>;
                const pub = pushRecord.pub;
                if (pub && typeof pub === "object" && !Array.isArray(pub)) {
                    const pubRecord = pub as Record<string, unknown>;
                    const body = decodeJsonBody(pubRecord.data);
                    if (!body) continue;
                    const decoded = decodeKickEvent(body);
                    if (!decoded) continue;
                    const channel =
                        typeof pushRecord.channel === "string"
                            ? pushRecord.channel
                            : "";
                    const key = publicationKey(channel, pubRecord, decoded);
                    if (isActiveReader(reader)) {
                        if (candidateReader) rememberHandoverKey(key);
                        emitEvent(decoded);
                    } else if (
                        isCandidateReader(reader) &&
                        reader.pendingEvents.length < DEDUPE_LIMIT
                    ) {
                        reader.pendingEvents.push({ key, event: decoded });
                    }
                }
            }
        }
    }

    function openReader(
        gen: number,
        session: GuestSession,
        role: "active" | "candidate"
    ): void {
        const created = createSocket(session.url);
        const reader: GuestReader = {
            gen,
            role,
            socket: created,
            alive: true,
            completed: false,
            subscriptionsRequested: false,
            ttlSeconds: DEFAULT_SESSION_TTL_SECONDS,
            pingSeconds: DEFAULT_PING_SECONDS,
            subscriptionIds: new Map(),
            channelTokens: session.channelTokens,
            handshakeTimer: null,
            livenessTimer: null,
            pendingEvents: [],
        };
        channels.forEach((channel, index) =>
            reader.subscriptionIds.set(index + 2, channel)
        );

        if (role === "candidate") {
            if (candidateReader) stopReader(candidateReader);
            candidateReader = reader;
        } else {
            if (activeReader) stopReader(activeReader);
            activeReader = reader;
        }

        reader.handshakeTimer = timers.setTimeout(
            () => failReader(reader),
            CONNECT_TIMEOUT_MS
        );

        created.addEventListener("open", () => {
            if (!reader.alive) return;
            if (!isActiveReader(reader) && !isCandidateReader(reader)) return;
            try {
                created.send(
                    JSON.stringify({
                        id: CONNECT_FRAME_ID,
                        connect: { token: session.token, name: CLIENT_NAME },
                    })
                );
            } catch {
                failReader(reader);
            }
        });
        created.addEventListener("message", (event) =>
            handleFrame(reader, event)
        );
        created.addEventListener("error", () => failReader(reader));
        created.addEventListener("close", () => failReader(reader));
    }

    async function runCycle(
        gen: number,
        mode: "normal" | "renewal" = "normal"
    ): Promise<void> {
        if (!isCurrent(gen)) return;
        if (mode === "renewal" && (!activeReader || candidateReader)) {
            renewalInFlight = false;
            return;
        }
        cycle += 1;
        const cycleId = cycle;
        const abort = new AbortController();
        negotiationAbort = abort;
        let settled = false;
        const isStale = (): boolean => settled || !isCurrentCycle(gen, cycleId);
        const myNegotiationTimer = timers.setTimeout(() => {
            if (settled) return;
            settled = true;
            try {
                abort.abort();
            } catch {
                /* ignore */
            }
            if (cycleId !== cycle || !running || gen !== generation) return;
            if (mode === "renewal") {
                renewalInFlight = false;
                scheduleHandoverRetry(gen);
            } else {
                scheduleReconnect(gen);
            }
        }, NEGOTIATION_TIMEOUT_MS);
        negotiationTimer = myNegotiationTimer;
        try {
            const session = await prepareGuestSession(
                fetchImpl,
                abort.signal,
                channels,
                isStale
            );
            if (!session || isStale()) return;
            if (mode === "renewal") {
                openReader(gen + 1, session, "candidate");
            } else {
                openReader(gen, session, "active");
            }
        } catch {
            if (isStale()) return;
            settled = true;
            if (mode === "renewal") {
                renewalInFlight = false;
                scheduleHandoverRetry(gen);
            } else {
                scheduleReconnect(gen);
            }
        } finally {
            if (negotiationTimer === myNegotiationTimer) {
                clearTimer(myNegotiationTimer);
                negotiationTimer = null;
            }
            if (negotiationAbort === abort) negotiationAbort = null;
        }
    }

    return {
        async start(): Promise<void> {
            if (running) return;
            running = true;
            reconnectAttempt = 0;
            connected = false;
            renewalInFlight = false;
            generation += 1;
            const gen = generation;
            emitState("connecting");
            await runCycle(gen, "normal");
        },
        stop(): void {
            const hadActivity =
                running ||
                activeReader !== null ||
                candidateReader !== null ||
                negotiationAbort !== null ||
                negotiationTimer !== null ||
                refreshTimer !== null ||
                reconnectTimer !== null;
            running = false;
            if (!hadActivity) return;
            generation += 1;
            renewalInFlight = false;
            clearOwnedTimers();
            const abort = negotiationAbort;
            negotiationAbort = null;
            if (abort) {
                try {
                    abort.abort();
                } catch {
                    /* ignore */
                }
            }
            cancelCandidate();
            closeActiveReader();
            clearHandoverState();
            connected = false;
            reconnectAttempt = 0;
            emitState("stopped");
        },
    };
}
