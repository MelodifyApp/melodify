import {
    getCurrentPlaybackSnapshot,
    startCurrentPlaybackPolling,
    subscribeCurrentPlayback,
} from "@/features/spotify/playback/player";
import type { CurrentPlaybackSnapshot } from "@/features/spotify/playback/currentPlayback";
import { homeQueue } from "./homeQueue";
import type {
    HomeNowPlaying,
    HomeSessionSnapshot,
} from "./homeSessionTypes";

let initialized = false;
let revision = 0;
let lastPlayingKey: string | null = null;
let lastSerialized = "";
let unsubscribePlayback: (() => void) | null = null;
let unsubscribeQueue: (() => void) | null = null;
const listeners = new Set<(snapshot: HomeSessionSnapshot) => void>();

function toNowPlaying(snapshot: CurrentPlaybackSnapshot): HomeNowPlaying {
    return {
        status: snapshot.status,
        title: snapshot.track?.title ?? null,
        artist: snapshot.track?.artist ?? null,
        artworkUrl: snapshot.track?.artworkUrl ?? null,
        error: snapshot.error,
    };
}

function buildSnapshot(): HomeSessionSnapshot {
    return {
        revision,
        current: toNowPlaying(getCurrentPlaybackSnapshot()),
        queue: homeQueue.snapshot(),
        queueScope: "session",
    };
}

function publish(): void {
    const current = toNowPlaying(getCurrentPlaybackSnapshot());
    const queue = homeQueue.snapshot();
    const serialized = JSON.stringify({ current, queue });
    if (serialized === lastSerialized) return;
    lastSerialized = serialized;
    revision += 1;
    const snapshot: HomeSessionSnapshot = {
        revision,
        current,
        queue,
        queueScope: "session",
    };
    for (const listener of [...listeners]) {
        try {
            listener(snapshot);
        } catch {
            // A renderer/bridge subscriber must not break session state.
        }
    }
}

function onPlayback(snapshot: CurrentPlaybackSnapshot): void {
    if (snapshot.status === "playing" && snapshot.track) {
        const key = `${snapshot.track.title.toLowerCase()}\u0000${snapshot.track.artists
            .map((artist) => artist.toLowerCase())
            .join("\u0000")}`;
        if (key !== lastPlayingKey) {
            lastPlayingKey = key;
            homeQueue.markPlaying(snapshot.track);
        }
    }
    publish();
}

function onQueue(): void {
    publish();
}

export function initializeHomeSession(): void {
    if (initialized) return;
    initialized = true;
    unsubscribePlayback = subscribeCurrentPlayback(onPlayback);
    unsubscribeQueue = homeQueue.subscribe(onQueue);
    startCurrentPlaybackPolling();
    onPlayback(getCurrentPlaybackSnapshot());
}

export function getHomeSessionSnapshot(): HomeSessionSnapshot {
    const snapshot = buildSnapshot();
    // Keep the last published payload aligned with direct reads.
    lastSerialized = JSON.stringify({
        current: snapshot.current,
        queue: snapshot.queue,
    });
    return snapshot;
}

export function subscribeHomeSession(
    listener: (snapshot: HomeSessionSnapshot) => void
): () => void {
    listeners.add(listener);
    listener(buildSnapshot());
    return () => {
        listeners.delete(listener);
    };
}

/** Test/lifecycle seam; the queue intentionally does not persist. */
export function resetHomeSession(): void {
    unsubscribePlayback?.();
    unsubscribeQueue?.();
    unsubscribePlayback = null;
    unsubscribeQueue = null;
    listeners.clear();
    homeQueue.reset();
    revision = 0;
    lastPlayingKey = null;
    lastSerialized = "";
    initialized = false;
}
