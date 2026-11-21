import type { HomePlatform, HomeQueueEntry } from "./homeSessionTypes";

export interface HomeQueueAddInput {
    title: string;
    artist: string;
    requester: string;
    platform: HomePlatform;
    acceptedAt?: number;
    artworkUrl?: string | null;
}

export interface HomeQueueStore {
    add(input: HomeQueueAddInput): HomeQueueEntry;
    markPlaying(track: {
        title: string;
        artist?: string;
        artists?: readonly string[];
    }): HomeQueueEntry | null;
    snapshot(): HomeQueueEntry[];
    restore(entries: HomeQueueEntry[]): void;
    subscribe(listener: (entries: HomeQueueEntry[]) => void): () => void;
    subscribePlayed(listener: (entry: HomeQueueEntry) => void): () => void;
    reset(): void;
}

interface StoredEntry {
    id: string;
    title: string;
    artist: string;
    requester: string;
    platform: HomePlatform;
    acceptedAt: number;
    artworkUrl: string | null;
}

function normalize(value: string): string {
    return value.trim().toLocaleLowerCase();
}

function artistParts(artist: string): string[] {
    return artist
        .split(",")
        .map(normalize)
        .filter(Boolean);
}

function matchesTrack(
    entry: StoredEntry,
    track: { title: string; artist?: string; artists?: readonly string[] }
): boolean {
    if (normalize(entry.title) !== normalize(track.title)) return false;
    const requested = artistParts(entry.artist);
    const current = (track.artists && track.artists.length > 0
        ? track.artists
        : track.artist
          ? [track.artist]
          : []
    )
        .map(normalize)
        .filter(Boolean);
    if (requested.length === 0 || current.length === 0) {
        return requested.length === current.length;
    }
    return requested.some((artist) => current.includes(artist));
}

export function createHomeQueueStore({
    now = Date.now,
    nextId,
}: {
    now?: () => number;
    nextId?: () => string;
} = {}): HomeQueueStore {
    let entries: StoredEntry[] = [];
    let sequence = 0;
    const listeners = new Set<(entries: HomeQueueEntry[]) => void>();
    const playedListeners = new Set<(entry: HomeQueueEntry) => void>();
    const makeId = nextId || (() => `home-queue-${++sequence}`);

    const publicEntries = (): HomeQueueEntry[] =>
        entries.map((entry, index) => ({
            ...entry,
            position: index + 1,
        }));

    const notify = () => {
        const snapshot = publicEntries();
        for (const listener of [...listeners]) {
            try {
                listener(snapshot);
            } catch {
                // A renderer/notification subscriber must not break queue state.
            }
        }
    };

    return {
        add(input) {
            const entry: StoredEntry = {
                id: makeId(),
                title: String(input.title || ""),
                artist: String(input.artist || ""),
                requester: String(input.requester || ""),
                platform: input.platform,
                acceptedAt:
                    typeof input.acceptedAt === "number" &&
                    Number.isFinite(input.acceptedAt)
                        ? input.acceptedAt
                        : now(),
                artworkUrl:
                    typeof input.artworkUrl === "string" &&
                    input.artworkUrl.length > 0
                        ? input.artworkUrl
                        : null,
            };
            entries.push(entry);
            notify();
            return publicEntries()[entries.length - 1];
        },
        markPlaying(track) {
            const index = entries.findIndex((entry) =>
                matchesTrack(entry, track)
            );
            if (index < 0) return null;
            const [removed] = entries.splice(index, 1);
            const publicRemoved = {
                ...removed,
                position: index + 1,
            };
            for (const listener of [...playedListeners]) {
                try {
                    listener(publicRemoved);
                } catch {
                    // A history subscriber must not break queue state.
                }
            }
            notify();
            return publicRemoved;
        },
        snapshot() {
            return publicEntries();
        },
        restore(inputEntries) {
            const byId = new Map<string, StoredEntry>();
            for (const input of inputEntries) {
                if (!input || typeof input.id !== "string" || !input.id) {
                    continue;
                }
                const acceptedAt =
                    typeof input.acceptedAt === "number" &&
                    Number.isFinite(input.acceptedAt)
                        ? input.acceptedAt
                        : now();
                byId.set(input.id, {
                    id: input.id,
                    title: String(input.title || ""),
                    artist: String(input.artist || ""),
                    requester: String(input.requester || ""),
                    platform:
                        input.platform === "twitch" ? "twitch" : "kick",
                    acceptedAt,
                    artworkUrl:
                        typeof input.artworkUrl === "string" &&
                        input.artworkUrl.length > 0
                            ? input.artworkUrl
                            : null,
                });
            }
            entries = [...byId.values()].sort(
                (a, b) => a.acceptedAt - b.acceptedAt
            );
            for (const entry of entries) {
                const match = /^home-queue-(\d+)$/.exec(entry.id);
                if (match) {
                    sequence = Math.max(sequence, Number(match[1]));
                }
            }
            notify();
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        subscribePlayed(listener) {
            playedListeners.add(listener);
            return () => {
                playedListeners.delete(listener);
            };
        },
        reset() {
            if (entries.length === 0) return;
            entries = [];
            notify();
        },
    };
}

/**
 * Main-process session queue. It does not persist on its own; the stream
 * session manager restores pending entries from the active session on resume.
 */
export const homeQueue = createHomeQueueStore();
