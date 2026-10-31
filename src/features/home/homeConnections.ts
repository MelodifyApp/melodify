/**
 * Home connection state derived from the real provider checks already used by
 * the existing Spotify, Kick and Twitch cards. This module performs reads
 * only; every action stays in the provider cards.
 */

export type HomeConnectionId = "spotify" | "kick" | "twitch";
export type HomeConnectionState =
    | "loading"
    | "setup"
    | "connect"
    | "connected"
    | "attention"
    | "unavailable";
export type HomeConnectionTone = "ok" | "warn" | "error" | "muted";

export interface HomeConnectionFlags {
    spotify: {
        hasSecrets: boolean | null;
        authenticated: boolean | null;
        hasSession: boolean | null;
        error: boolean;
    };
    kick: {
        hasSecrets: boolean | null;
        authenticated: boolean | null;
        listening: boolean | null;
        error: boolean;
    };
    twitch: {
        hasSecrets: boolean | null;
        authenticated: boolean | null;
        listening: boolean | null;
        error: boolean;
    };
}

export interface HomeConnectionView {
    id: HomeConnectionId;
    state: HomeConnectionState;
    tone: HomeConnectionTone;
}

export interface PresenceReadResult {
    value: boolean | null;
    error: boolean;
}

export interface HomeConnectionsBridge {
    invoke(channel: string, data?: unknown): Promise<unknown>;
    on?(
        channel: string,
        listener: (...args: unknown[]) => void
    ): void;
    removeListener?(
        channel: string,
        listener: (...args: unknown[]) => void
    ): void;
}

export function emptyHomeConnectionFlags(): HomeConnectionFlags {
    return {
        spotify: {
            hasSecrets: null,
            authenticated: null,
            hasSession: null,
            error: false,
        },
        kick: {
            hasSecrets: null,
            authenticated: null,
            listening: null,
            error: false,
        },
        twitch: {
            hasSecrets: null,
            authenticated: null,
            listening: null,
            error: false,
        },
    };
}

/** A successful session check must never stop later presence ticks. */
export function shouldCheckSpotifyPresence(
    flags: HomeConnectionFlags
): boolean {
    return flags.spotify.authenticated === true;
}

/**
 * Merges one presence tick. Error reads replace the previous value instead of
 * preserving a stale green state; services without a read are left untouched.
 */
export function applyPresenceReads(
    flags: HomeConnectionFlags,
    reads: Partial<Record<HomeConnectionId, PresenceReadResult>>
): HomeConnectionFlags {
    return {
        spotify: reads.spotify
            ? {
                  ...flags.spotify,
                  hasSession: reads.spotify.value,
                  error: reads.spotify.error,
              }
            : flags.spotify,
        kick: reads.kick
            ? {
                  ...flags.kick,
                  listening: reads.kick.value,
                  error: reads.kick.error,
              }
            : flags.kick,
        twitch: reads.twitch
            ? {
                  ...flags.twitch,
                  listening: reads.twitch.value,
                  error: reads.twitch.error,
              }
            : flags.twitch,
    };
}

function view(
    id: HomeConnectionId,
    state: HomeConnectionState
): HomeConnectionView {
    const tone: HomeConnectionTone =
        state === "connected"
            ? "ok"
            : state === "loading"
              ? "muted"
              : state === "unavailable"
                ? "error"
                : "warn";
    return { id, state, tone };
}

export function deriveHomeConnections(
    flags: HomeConnectionFlags
): Record<HomeConnectionId, HomeConnectionView> {
    const spotify = flags.spotify;
    let spotifyView: HomeConnectionView;
    if (spotify.error) {
        spotifyView = view("spotify", "unavailable");
    } else if (
        spotify.hasSecrets === null ||
        spotify.authenticated === null ||
        spotify.hasSession === null
    ) {
        spotifyView = view("spotify", "loading");
    } else if (spotify.authenticated && spotify.hasSession) {
        spotifyView = view("spotify", "connected");
    } else if (spotify.authenticated) {
        spotifyView = view("spotify", "attention");
    } else if (!spotify.hasSecrets) {
        spotifyView = view("spotify", "setup");
    } else {
        spotifyView = view("spotify", "connect");
    }

    const chatView = (
        id: "kick" | "twitch",
        state: HomeConnectionFlags["kick"]
    ): HomeConnectionView => {
        if (state.error) return view(id, "unavailable");
        if (
            state.hasSecrets === null ||
            state.authenticated === null ||
            state.listening === null
        ) {
            return view(id, "loading");
        }
        if (state.listening) return view(id, "connected");
        if (!state.hasSecrets) return view(id, "setup");
        if (!state.authenticated) return view(id, "connect");
        return view(id, "attention");
    };

    return {
        spotify: spotifyView,
        kick: chatView("kick", flags.kick),
        twitch: chatView("twitch", flags.twitch),
    };
}

/** Message key for the compact Home status chip. */
export type HomeConnectionStateMap = Partial<
    Record<HomeConnectionId, HomeConnectionState>
>;

export function homeConnectionStateMap(
    views: Record<HomeConnectionId, HomeConnectionView>
): HomeConnectionStateMap {
    return {
        spotify: views.spotify.state,
        kick: views.kick.state,
        twitch: views.twitch.state,
    };
}

/** Only states that actually changed; a render with the same states is quiet. */
export function changedHomeConnectionIds(
    previous: HomeConnectionStateMap,
    current: Record<HomeConnectionId, HomeConnectionView>
): HomeConnectionId[] {
    return (["spotify", "kick", "twitch"] as const).filter(
        (id) => previous[id] !== current[id].state
    );
}

const HOME_CONNECTION_NAMES: Record<HomeConnectionId, string> = {
    spotify: "Spotify",
    kick: "Kick",
    twitch: "Twitch",
};

/** One polite announcement sentence per changed service. */
export function buildHomeConnectionAnnouncement(
    changed: HomeConnectionId[],
    views: Record<HomeConnectionId, HomeConnectionView>,
    t: (key: string, options?: Record<string, unknown>) => string
): string {
    return changed
        .map((id) =>
            t("home.connections.announcement", {
                service: HOME_CONNECTION_NAMES[id],
                status: t(homeConnectionMessageKey(views[id])),
            })
        )
        .join(" ");
}

export function homeConnectionMessageKey(
    connection: HomeConnectionView
): string {
    switch (connection.state) {
        case "loading":
            return "home.connections.checking";
        case "setup":
            return "home.connections.needsSetup";
        case "connect":
            return "home.connections.connect";
        case "connected":
            return connection.id === "spotify"
                ? "home.connections.ready"
                : "home.connections.listening";
        case "attention":
            return connection.id === "spotify"
                ? "home.connections.openSpotify"
                : "home.connections.connectChat";
        case "unavailable":
            return "home.connections.unavailable";
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

export async function readPresenceValue(
    bridge: HomeConnectionsBridge,
    channel: string
): Promise<PresenceReadResult> {
    try {
        const result = await bridge.invoke(channel);
        return typeof result === "boolean"
            ? { value: result, error: false }
            : { value: null, error: true };
    } catch {
        return { value: null, error: true };
    }
}

/**
 * Reads one presence tick. A ready Spotify session is checked again on every
 * tick; the auth flags only gate which provider calls are made.
 */
export async function readHomePresence(
    bridge: HomeConnectionsBridge,
    flags: HomeConnectionFlags
): Promise<Partial<Record<HomeConnectionId, PresenceReadResult>>> {
    const [spotify, kick, twitch] = await Promise.all([
        shouldCheckSpotifyPresence(flags)
            ? readPresenceValue(bridge, "spotify:hasSession")
            : undefined,
        flags.kick.authenticated
            ? readPresenceValue(bridge, "kick:isListeningToChat")
            : undefined,
        flags.twitch.authenticated
            ? readPresenceValue(bridge, "twitch:isListeningToChat")
            : undefined,
    ]);
    return { spotify, kick, twitch };
}

async function readAuth(
    bridge: HomeConnectionsBridge,
    channel: string
): Promise<{ value: boolean | null; error: boolean }> {
    try {
        const result = await bridge.invoke(channel);
        if (!isRecord(result) || typeof result.authenticated !== "boolean") {
            return { value: null, error: true };
        }
        return { value: result.authenticated, error: false };
    } catch {
        return { value: null, error: true };
    }
}

/**
 * Reads the same status inputs as the provider cards. It never sends a
 * provider action and never receives a secret/token.
 */
export async function loadHomeConnections(
    bridge: HomeConnectionsBridge
): Promise<HomeConnectionFlags> {
    const [spotifySecrets, kickSecrets, twitchSecrets] = await Promise.all([
        readPresenceValue(bridge, "spotify:hasSecrets"),
        readPresenceValue(bridge, "kick:hasSecrets"),
        readPresenceValue(bridge, "twitch:hasSecrets"),
    ]);

    const [spotifyAuth, kickAuth, twitchAuth] = await Promise.all([
        readAuth(bridge, "spotify:checkAuth"),
        readAuth(bridge, "kick:checkAuth"),
        readAuth(bridge, "twitch:checkAuth"),
    ]);

    const [spotifySession, kickListening, twitchListening] = await Promise.all([
        spotifyAuth.value
            ? readPresenceValue(bridge, "spotify:hasSession")
            : { value: false, error: false },
        kickAuth.value
            ? readPresenceValue(bridge, "kick:isListeningToChat")
            : { value: false, error: false },
        twitchAuth.value
            ? readPresenceValue(bridge, "twitch:isListeningToChat")
            : { value: false, error: false },
    ]);

    return {
        spotify: {
            hasSecrets: spotifySecrets.value,
            authenticated: spotifyAuth.value,
            hasSession: spotifySession.value,
            error:
                spotifySecrets.error ||
                spotifyAuth.error ||
                spotifySession.error,
        },
        kick: {
            hasSecrets: kickSecrets.value,
            authenticated: kickAuth.value,
            listening: kickListening.value,
            error:
                kickSecrets.error || kickAuth.error || kickListening.error,
        },
        twitch: {
            hasSecrets: twitchSecrets.value,
            authenticated: twitchAuth.value,
            listening: twitchListening.value,
            error:
                twitchSecrets.error || twitchAuth.error || twitchListening.error,
        },
    };
}
