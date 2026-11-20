import Config from "@/core/config";
import { kickClient } from "@/features/kick/api/client";
import { twitchClient } from "@/features/twitch/api/client";
import { homeQueue } from "./homeQueue";
import { createQueueHistoryPersistence } from "./queueHistory";
import {
    createStreamSessionManager,
    type QueueStreamSession,
    type StreamSessionManager,
} from "./streamSession";

const LIVE_POLL_MS = 30_000;

let manager: StreamSessionManager | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollInFlight = false;

function isKickConfigured(): boolean {
    return !!Config.get("username") || kickClient.hasTokens();
}

function isTwitchConfigured(): boolean {
    return (
        !!Config.get("twitchUserId") &&
        !!Config.get("twitchClientId")
    );
}

async function pollLiveStatus(): Promise<void> {
    if (pollInFlight || !manager) return;
    pollInFlight = true;
    try {
        const kickConfigured = isKickConfigured();
        const twitchConfigured = isTwitchConfigured();
        const [kickLive, twitchLive] = await Promise.all([
            kickConfigured
                ? kickClient.getLiveStatus().catch((): null => null)
                : Promise.resolve(null),
            twitchConfigured
                ? twitchClient.getLiveStatus().catch((): null => null)
                : Promise.resolve(null),
        ]);
        if (!manager) return;
        // A null result means "unknown"; the manager keeps the last confirmed
        // state so a provider outage never ends or splits the stream.
        manager.noteLiveStatus("kick", kickLive, kickConfigured);
        manager.noteLiveStatus("twitch", twitchLive, twitchConfigured);
    } finally {
        pollInFlight = false;
    }
}

export function initializeStreamSessions(): void {
    if (manager) return;
    manager = createStreamSessionManager({
        queue: homeQueue,
        persistence: createQueueHistoryPersistence(),
    });
    manager.initialize();
    if (!pollTimer) {
        void pollLiveStatus();
        pollTimer = setInterval(() => {
            void pollLiveStatus();
        }, LIVE_POLL_MS);
        (pollTimer as { unref?: () => void }).unref?.();
    }
}

export function shutdownStreamSessions(): void {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    pollInFlight = false;
    manager?.shutdown("app-quit");
    manager = null;
}

export function getQueueHistory(): QueueStreamSession[] {
    if (!manager) initializeStreamSessions();
    return manager?.getHistory() ?? [];
}

export function clearQueueHistory(): number {
    if (!manager) initializeStreamSessions();
    return manager?.clearHistory() ?? 0;
}
