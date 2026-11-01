export type HomePlaybackStatus = "loading" | "playing" | "idle" | "error";
export type HomePlaybackError = "inactive" | "auth" | "provider" | null;
export type HomePlatform = "kick" | "twitch";

export interface HomeNowPlaying {
    status: HomePlaybackStatus;
    title: string | null;
    artist: string | null;
    artworkUrl: string | null;
    error: HomePlaybackError;
}

export interface HomeQueueEntry {
    id: string;
    title: string;
    artist: string;
    requester: string;
    platform: HomePlatform;
    acceptedAt: number;
    position: number;
}

export interface HomeSessionSnapshot {
    revision: number;
    current: HomeNowPlaying;
    queue: HomeQueueEntry[];
    queueScope: "session";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

/** Whitelist the renderer payload so IPC extras never cross into Home state. */
export function normalizeHomeSessionSnapshot(
    value: unknown
): HomeSessionSnapshot | null {
    if (!isRecord(value) || !Array.isArray(value.queue)) return null;
    if (!isRecord(value.current)) return null;
    const status = value.current.status;
    if (
        status !== "loading" &&
        status !== "playing" &&
        status !== "idle" &&
        status !== "error"
    ) {
        return null;
    }
    const errorValue = value.current.error;
    if (
        errorValue !== null &&
        errorValue !== "inactive" &&
        errorValue !== "auth" &&
        errorValue !== "provider"
    ) {
        return null;
    }
    const error = errorValue as HomePlaybackError;
    const title = text(value.current.title);
    const artist = text(value.current.artist);
    if (status === "playing" && (!title || !artist)) return null;

    const artwork = text(value.current.artworkUrl);
    const artworkUrl =
        artwork && /^https:\/\//i.test(artwork) ? artwork : null;
    const queue: HomeQueueEntry[] = [];
    for (const raw of value.queue) {
        if (!isRecord(raw)) continue;
        const id = text(raw.id);
        const entryTitle = text(raw.title);
        const entryArtist = text(raw.artist);
        const requester = text(raw.requester);
        const platform = raw.platform;
        const acceptedAt = raw.acceptedAt;
        if (
            !id ||
            !entryTitle ||
            !entryArtist ||
            !requester ||
            (platform !== "kick" && platform !== "twitch") ||
            typeof acceptedAt !== "number" ||
            !Number.isFinite(acceptedAt)
        ) {
            continue;
        }
        queue.push({
            id,
            title: entryTitle,
            artist: entryArtist,
            requester,
            platform,
            acceptedAt,
            position: queue.length + 1,
        });
    }

    return {
        revision:
            typeof value.revision === "number" &&
            Number.isFinite(value.revision)
                ? value.revision
                : 0,
        current: {
            status,
            title,
            artist,
            artworkUrl,
            error,
        },
        queue,
        queueScope: "session",
    };
}
