import Config from "@/core/config";
import { kickClient } from "@/features/kick/api/client";
import { twitchClient } from "@/features/twitch/api/client";
import { homeQueue } from "./homeQueue";
import { readLiveStatusWithRetry } from "./liveStatusRetry";
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
                ? readLiveStatusWithRetry(() => kickClient.getLiveStatus())
                : Promise.resolve(null),
            twitchConfigured
                ? readLiveStatusWithRetry(() => twitchClient.getLiveStatus())
                : Promise.resolve(null),
        ]);
        if (!manager) return;
        // Apply the whole poll at once so a provider evaluated first cannot
        // decide the session before the other provider's state is known.
        manager.noteLiveStatuses([
            {
                platform: "kick",
                live: kickLive,
                configured: kickConfigured,
            },
            {
                platform: "twitch",
                live: twitchLive,
                configured: twitchConfigured,
            },
        ]);
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

export function hasActiveStreamSession(): boolean {
    if (!manager) initializeStreamSessions();
    return !!manager?.getActive();
}

export function getQueueHistory(): QueueStreamSession[] {
    if (!manager) initializeStreamSessions();
    return manager?.getHistory() ?? [];
}

export function clearQueueHistory(): number {
    if (!manager) initializeStreamSessions();
    return manager?.clearHistory() ?? 0;
}
