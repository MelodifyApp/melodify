import type { HomePlatform, HomeQueueEntry } from "./homeSessionTypes";

export type QueueSessionEndReason = "offline" | "interrupted" | "app-quit";
export type QueueSessionEntryOutcome = "played" | "unplayed";

export interface QueueSessionEntry extends HomeQueueEntry {
    outcome: QueueSessionEntryOutcome;
    playedAt: number | null;
}

export interface QueueStreamSession {
    id: string;
    startedAt: number;
    endedAt: number | null;
    endReason: QueueSessionEndReason | null;
    providers: { kick: boolean; twitch: boolean };
    entries: QueueSessionEntry[];
}

export interface QueueHistoryPersistence {
    load(): QueueStreamSession[];
    save(sessions: QueueStreamSession[]): void;
}

export interface StreamSessionQueue {
    snapshot(): HomeQueueEntry[];
    reset(): void;
    subscribe(listener: (entries: HomeQueueEntry[]) => void): () => void;
    subscribePlayed(listener: (entry: HomeQueueEntry) => void): () => void;
}

export interface StreamSessionLogger {
    info?(message: string, meta?: unknown): void;
    warn?(message: string, meta?: unknown): void;
}

export interface StreamSessionManagerOptions {
    queue: StreamSessionQueue;
    persistence: QueueHistoryPersistence;
    now?: () => number;
    /** How long every configured provider may stay confirmed offline. */
    graceMs?: number;
    maxSessions?: number;
    maxEntries?: number;
    makeId?: (startedAt: number) => string;
    logger?: StreamSessionLogger;
}

export interface StreamSessionManager {
    initialize(): void;
    /**
     * `live` is the provider's confirmed state, or null when the check failed.
     * `configured` is false when that provider has no usable account, in which
     * case it is ignored for session boundaries.
     */
    noteLiveStatus(
        platform: HomePlatform,
        live: boolean | null,
        configured: boolean
    ): void;
    shutdown(reason?: "app-quit" | "interrupted"): void;
    getHistory(): QueueStreamSession[];
    getActive(): QueueStreamSession | null;
    clearHistory(): number;
    reset(): void;
}

const DEFAULT_GRACE_MS = 2 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 50;
const DEFAULT_MAX_ENTRIES = 500;

function cloneEntry(entry: QueueSessionEntry): QueueSessionEntry {
    return { ...entry };
}

function cloneSession(session: QueueStreamSession): QueueStreamSession {
    return {
        ...session,
        providers: { ...session.providers },
        entries: session.entries.map(cloneEntry),
    };
}

/**
 * A stream session starts when a provider confirms live and ends only after
 * every configured provider has been confirmed offline for the grace window.
 * A failed live check (null) keeps the last confirmed state, so an API outage
 * never ends or splits an active stream.
 */
export function createStreamSessionManager(
    options: StreamSessionManagerOptions
): StreamSessionManager {
    const queue = options.queue;
    const persistence = options.persistence;
    const now = options.now ?? Date.now;
    const graceMs =
        typeof options.graceMs === "number" && options.graceMs >= 0
            ? options.graceMs
            : DEFAULT_GRACE_MS;
    const maxSessions = Math.max(1, options.maxSessions ?? DEFAULT_MAX_SESSIONS);
    const maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
    const makeId =
        options.makeId ??
        ((startedAt: number) =>
            `stream_${startedAt}_${Math.random().toString(36).slice(2, 8)}`);
    const logger = options.logger;

    let initialized = false;
    let sessions: QueueStreamSession[] = [];
    let active: QueueStreamSession | null = null;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribeQueue: (() => void) | null = null;
    let unsubscribePlayed: (() => void) | null = null;
    const configured = { kick: false, twitch: false };
    const liveState = {
        kick: null as boolean | null,
        twitch: null as boolean | null,
    };
    const played = new Map<string, QueueSessionEntry>();

    function persist(): void {
        try {
            persistence.save(sessions.map(cloneSession));
        } catch (error) {
            logger?.warn?.("Failed to save queue history", {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    function trimSessions(): void {
        const ended = sessions.filter((session) => session !== active);
        const budget = maxSessions - (active ? 1 : 0);
        const kept = budget > 0 ? ended.slice(-budget) : [];
        sessions = active ? [...kept, active] : kept;
    }

    function uniqueId(startedAt: number): string {
        const base = makeId(startedAt);
        let id = base;
        let suffix = 1;
        while (sessions.some((session) => session.id === id)) {
            suffix += 1;
            id = `${base}_${suffix}`;
        }
        return id;
    }

    function syncActive(): void {
        if (!active) return;
        const byId = new Map<string, QueueSessionEntry>();
        for (const entry of played.values()) {
            byId.set(entry.id, {
                ...cloneEntry(entry),
                artworkUrl: null,
            });
        }
        for (const entry of queue.snapshot()) {
            if (byId.has(entry.id)) continue;
            byId.set(entry.id, {
                ...entry,
                artworkUrl: null,
                outcome: "unplayed",
                playedAt: null,
            });
        }
        active.entries = [...byId.values()]
            .sort((a, b) => a.acceptedAt - b.acceptedAt)
            .slice(-maxEntries);
        persist();
    }

    function clearGrace(): void {
        if (!graceTimer) return;
        clearTimeout(graceTimer);
        graceTimer = null;
    }

    function endActive(reason: QueueSessionEndReason): void {
        if (!active) return;
        clearGrace();
        syncActive();
        const id = active.id;
        active.endedAt = now();
        active.endReason = reason;
        persist();
        active = null;
        liveState.kick = null;
        liveState.twitch = null;
        played.clear();
        queue.reset();
        trimSessions();
        persist();
        logger?.info?.("Stream session ended", { id, reason });
    }

    function scheduleEnd(): void {
        if (graceTimer || !active) return;
        graceTimer = setTimeout(() => {
            graceTimer = null;
            if (!active) return;
            const anyLive =
                (configured.kick && liveState.kick === true) ||
                (configured.twitch && liveState.twitch === true);
            if (anyLive) return;
            const allConfirmedOffline =
                (!configured.kick || liveState.kick === false) &&
                (!configured.twitch || liveState.twitch === false);
            if (allConfirmedOffline) endActive("offline");
        }, graceMs);
        // Do not keep a closing Electron process alive just for this timer.
        (graceTimer as { unref?: () => void }).unref?.();
    }

    function reevaluate(): void {
        if (!active) return;
        if (!configured.kick && !configured.twitch) {
            endActive("offline");
            return;
        }
        const anyLive =
            (configured.kick && liveState.kick === true) ||
            (configured.twitch && liveState.twitch === true);
        if (anyLive) {
            clearGrace();
            return;
        }
        const allConfirmedOffline =
            (!configured.kick || liveState.kick === false) &&
            (!configured.twitch || liveState.twitch === false);
        if (allConfirmedOffline) {
            scheduleEnd();
        } else {
            clearGrace();
        }
    }

    function startSession(platform: HomePlatform): void {
        const startedAt = now();
        active = {
            id: uniqueId(startedAt),
            startedAt,
            endedAt: null,
            endReason: null,
            providers: { kick: false, twitch: false },
            entries: [],
        };
        active.providers[platform] = true;
        played.clear();
        sessions.push(active);
        trimSessions();
        syncActive();
        logger?.info?.("Stream session started", {
            id: active.id,
            platform,
        });
    }

    return {
        initialize() {
            if (initialized) return;
            initialized = true;
            try {
                sessions = persistence.load().slice(-maxSessions);
            } catch (error) {
                logger?.warn?.("Failed to load queue history", {
                    error: error instanceof Error ? error.message : String(error),
                });
                sessions = [];
            }
            let recovered = false;
            for (const session of sessions) {
                if (session.endedAt !== null) continue;
                session.endedAt = now();
                session.endReason = "interrupted";
                recovered = true;
            }
            if (recovered) persist();
            unsubscribeQueue = queue.subscribe(() => syncActive());
            unsubscribePlayed = queue.subscribePlayed((entry) => {
                if (!active) return;
                played.set(entry.id, {
                    ...entry,
                    outcome: "played",
                    playedAt: now(),
                });
                syncActive();
            });
        },

        noteLiveStatus(platform, live, isConfigured) {
            if (!initialized) this.initialize();
            configured[platform] = isConfigured;
            if (!isConfigured) {
                liveState[platform] = null;
                reevaluate();
                return;
            }
            if (live === null) {
                // Failed check: retain the last confirmed state and do not end
                // an active stream just because the provider API is down.
                clearGrace();
                return;
            }
            liveState[platform] = live;
            if (live) {
                clearGrace();
                if (!active) {
                    startSession(platform);
                    return;
                }
                active.providers[platform] = true;
                syncActive();
                return;
            }
            reevaluate();
        },

        shutdown(reason = "app-quit") {
            if (active) endActive(reason);
            clearGrace();
            unsubscribeQueue?.();
            unsubscribePlayed?.();
            unsubscribeQueue = null;
            unsubscribePlayed = null;
            initialized = false;
        },

        getHistory() {
            return sessions
                .map(cloneSession)
                .sort((a, b) => b.startedAt - a.startedAt);
        },

        getActive() {
            return active ? cloneSession(active) : null;
        },

        clearHistory() {
            const removed = sessions.filter(
                (session) => session !== active
            ).length;
            sessions = active ? [active] : [];
            persist();
            return removed;
        },

        reset() {
            clearGrace();
            unsubscribeQueue?.();
            unsubscribePlayed?.();
            unsubscribeQueue = null;
            unsubscribePlayed = null;
            sessions = [];
            active = null;
            configured.kick = false;
            configured.twitch = false;
            liveState.kick = null;
            liveState.twitch = null;
            played.clear();
            initialized = false;
        },
    };
}
