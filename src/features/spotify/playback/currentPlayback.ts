export type CurrentPlaybackStatus = "loading" | "playing" | "idle" | "error";

export type CurrentPlaybackError = "inactive" | "auth" | "provider" | null;

export interface CurrentPlaybackTrack {
    title: string;
    artist: string;
    artists: string[];
    artworkUrl: string | null;
}

export interface CurrentPlaybackSnapshot {
    status: CurrentPlaybackStatus;
    track: CurrentPlaybackTrack | null;
    error: CurrentPlaybackError;
    updatedAt: number;
}

export interface CurrentPlaybackApi {
    getMyCurrentPlaybackState(): Promise<{
        body?: {
            is_playing?: boolean;
            item?: {
                type?: string;
                name?: string;
                artists?: Array<{ name?: string }>;
                album?: { images?: Array<{ url?: string }> };
            } | null;
        };
    }>;
}

export interface CurrentPlaybackServiceOptions {
    getApi: () => CurrentPlaybackApi | null;
    checkToken: () => Promise<boolean>;
    now?: () => number;
    intervalMs?: number;
    errorIntervalMs?: number;
}

export interface CurrentPlaybackService {
    getSnapshot(): CurrentPlaybackSnapshot;
    subscribe(listener: (snapshot: CurrentPlaybackSnapshot) => void): () => void;
    start(): void;
    stop(): void;
    reset(): void;
}

export const CURRENT_PLAYBACK_INTERVAL_MS = 5_000;
export const CURRENT_PLAYBACK_ERROR_INTERVAL_MS = 30_000;

function errorStatus(error: unknown): number {
    if (typeof error !== "object" || error === null) return NaN;
    return Number(
        (error as { statusCode?: unknown }).statusCode ??
            (
                error as {
                    body?: { error?: { status?: unknown } };
                }
            ).body?.error?.status
    );
}

function idleSnapshot(
    now: () => number,
    error: CurrentPlaybackError = null
): CurrentPlaybackSnapshot {
    return {
        status: "idle",
        track: null,
        error,
        updatedAt: now(),
    };
}

export function createCurrentPlaybackService({
    getApi,
    checkToken,
    now = Date.now,
    intervalMs = CURRENT_PLAYBACK_INTERVAL_MS,
    errorIntervalMs = CURRENT_PLAYBACK_ERROR_INTERVAL_MS,
}: CurrentPlaybackServiceOptions): CurrentPlaybackService {
    let snapshot: CurrentPlaybackSnapshot = {
        status: "loading",
        track: null,
        error: null,
        updatedAt: now(),
    };
    let active = false;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const listeners = new Set<(snapshot: CurrentPlaybackSnapshot) => void>();

    const notify = () => {
        for (const listener of [...listeners]) {
            try {
                listener(snapshot);
            } catch {
                // A UI/session subscriber must not stop playback polling.
            }
        }
    };

    const update = (next: CurrentPlaybackSnapshot) => {
        snapshot = next;
        notify();
    };

    const schedule = (delay: number, expectedGeneration: number) => {
        if (!active || expectedGeneration !== generation) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            void poll(expectedGeneration);
        }, delay);
    };

    const stopPolling = () => {
        active = false;
        generation += 1;
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };

    const stopForError = (error: CurrentPlaybackError) => {
        update({
            status: "error",
            track: null,
            error,
            updatedAt: now(),
        });
        stopPolling();
    };

    const poll = async (expectedGeneration: number) => {
        if (!active || expectedGeneration !== generation) return;
        let nextDelay = intervalMs;
        try {
            const api = getApi();
            if (!api) {
                update(idleSnapshot(now, "inactive"));
                active = false;
                generation += 1;
                return;
            }
            const tokenValid = await checkToken();
            if (!active || expectedGeneration !== generation) return;
            if (!tokenValid) {
                stopForError("auth");
                return;
            }

            const response = await api.getMyCurrentPlaybackState();
            if (!active || expectedGeneration !== generation) return;
            const body = response?.body;
            if (!body?.is_playing || !body.item || body.item.type !== "track") {
                update(idleSnapshot(now));
                return;
            }

            const title = String(body.item.name || "").trim();
            if (!title) {
                update(idleSnapshot(now));
                return;
            }
            const artists = (body.item.artists || [])
                .map((artist) => artist.name)
                .filter((name): name is string => typeof name === "string" && name.length > 0);
            const artworkUrl =
                body.item.album?.images?.find(
                    (image) => typeof image.url === "string" && image.url.length > 0
                )?.url ?? null;
            update({
                status: "playing",
                track: {
                    title,
                    artist: artists.join(", ") || "Unknown Artist",
                    artists,
                    artworkUrl,
                },
                error: null,
                updatedAt: now(),
            });
        } catch (error) {
            if (!active || expectedGeneration !== generation) return;
            const status = errorStatus(error);
            if (status === 401 || status === 403) {
                stopForError("auth");
                return;
            }
            update({
                status: "error",
                track: null,
                error: "provider",
                updatedAt: now(),
            });
            nextDelay = errorIntervalMs;
        } finally {
            schedule(nextDelay, expectedGeneration);
        }
    };

    return {
        getSnapshot() {
            return snapshot;
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        start() {
            if (active) return;
            active = true;
            generation += 1;
            const expectedGeneration = generation;
            void poll(expectedGeneration);
        },
        stop: stopPolling,
        reset() {
            stopPolling();
            update(idleSnapshot(now, "inactive"));
        },
    };
}
