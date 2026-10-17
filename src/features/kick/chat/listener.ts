import Config from "@/core/config";
import { logInfo, logError, logWarn, logDebug } from "@/core/logging";
import { redactSecrets } from "@/core/logging/utils";
import { CommandContext } from "@/core/commands/manager";
import { commandManager } from "@/core/ipc/handlers";
import { kickClient } from "@/features/kick/api/client";
import { executeSongRequest } from "@/core/commands/songRequest";
import {
    createGuestChatClient,
    type KickGuestMessageEvent,
    type KickGuestRewardEvent,
} from "@/features/kick/chat/guestChat";
import {
    createKickChatAdapter,
    type KickChatAdapter,
} from "@/features/kick/chat/adapter";

// Kick chat reading runs over the negotiated anonymous guest transport
// (guestChat.ts). OAuth credentials are only needed for replies.
export let isListening = false;
let refreshKickTokenInterval: NodeJS.Timeout | null = null;
let chatAdapter: KickChatAdapter | null = null;
// Bumped on every start/stop so a chatroom lookup that resolves late can never
// start a reader after an explicit stop or logout.
let chatGeneration = 0;

export async function refreshKickAccessToken(): Promise<boolean> {
    return await kickClient.refreshAccessToken();
}

export async function sendKickMessage(message: string): Promise<void> {
    logDebug("sendKickMessage called", redactSecrets({ message }));

    const userId = Config.get("userId");
    if (!userId) {
        logError("Missing Kick userId", "kick:sendKickMessage");
        throw new Error("Missing Kick userId");
    }

    await kickClient.sendMessage(message, Number(userId));
}

async function handleGuestMessage(event: KickGuestMessageEvent): Promise<void> {
    const ctx: CommandContext = {
        username: event.username,
        message: event.message,
        badges: event.badges,
        raw: event.raw,
        platform: "kick",
    };
    try {
        await commandManager.handle(ctx);
    } catch (error) {
        logError(error, "kick:messageProcessing");
    }
}

function handleGuestReward(event: KickGuestRewardEvent): void {
    try {
        // Reward redemptions keep the existing title filter and permission
        // behavior; chat commands are unaffected.
        const configuredRewardTitle = Config.get("rewardTitle") || "Song Request";
        if (configuredRewardTitle !== event.rewardTitle) return;

        const songQuery = event.userInput;
        const ctx: CommandContext = {
            username: event.username,
            message: songQuery,
            badges: [],
            raw: event.raw,
            platform: "kick",
        };

        void executeSongRequest(ctx, songQuery, commandManager, {
            sendReply: sendKickMessage,
            skipPermissionCheck: true,
        }).catch((error) => {
            logError(error, "kick:rewardProcessing");
        });
    } catch (error) {
        logError(error, "kick:rewardProcessing");
    }
}

export async function listenToChat(window?: Electron.BrowserWindow) {
    if (chatAdapter?.isActive()) {
        logDebug("Kick chat listener already active", "kick:listenToChat");
        return;
    }

    chatGeneration += 1;
    const generation = chatGeneration;

    let chatroomId = Config.get("chatroomId");
    if (!chatroomId) {
        logDebug("Missing Kick chatroomId", "kick:listenToChat");
        const username = Config.get("username");
        if (!username) {
            logError(
                "Missing Kick username, can't retrieve chatroom ID",
                "kick:listenToChat"
            );
            return;
        }
        const chatroomResult = await kickClient.findChatroom(username);
        if (generation !== chatGeneration) {
            logDebug(
                "Kick chat start superseded while resolving the chatroom",
                "kick:listenToChat"
            );
            return;
        }
        if (!chatroomResult) {
            logError(
                "Failed to find chatroom for username: " + username,
                "kick:listenToChat"
            );
            return;
        }
        chatroomId = chatroomResult.chatroomId;
        Config.set({ chatroomId });
        logInfo(
            "Retrieved and set chatroomId from username",
            redactSecrets({ username, chatroomId })
        );
    }

    if (!chatroomId) {
        logError("Missing Kick chatroomId after lookup", "kick:listenToChat");
        return;
    }

    const adapter = createKickChatAdapter({
        createClient: (handlers) =>
            createGuestChatClient({
                chatroomId: String(chatroomId),
                onEvent: handlers.onEvent,
                onState: handlers.onState,
            }),
        onMessage: (event) => {
            void handleGuestMessage(event);
        },
        onReward: handleGuestReward,
        onConnected: () => {
            isListening = true;
            logInfo(
                `Kick guest chat ready for chatroom ID: ${chatroomId}`,
                "kick:listenToChat"
            );
            window?.webContents.send("kick:chatConnected");
        },
        onDisconnected: () => {
            isListening = false;
            logWarn("Kick guest chat disconnected", "kick:listenToChat");
            window?.webContents.send("kick:chatDisconnected");
        },
        onError: (error) => {
            logError(error, "kick:guestChatError");
        },
        onStateChange: (state) => {
            logDebug(`Kick guest chat state: ${state}`, "kick:listenToChat");
        },
    });

    chatAdapter = adapter;
    logInfo(`Connecting to Kick guest chat for chatroom ID: ${chatroomId}`);
    adapter.start();
}

export function stopListeningToChat(window?: Electron.BrowserWindow) {
    // Supersede any in-flight start (including a pending chatroom lookup).
    chatGeneration += 1;

    const adapter = chatAdapter;
    chatAdapter = null;
    if (!adapter) {
        logDebug(
            "Not currently listening to Kick chat",
            "kick:stopListeningToChat"
        );
        return;
    }

    const wasListening = isListening;
    isListening = false;
    adapter.stop();
    logInfo("Stopped listening to Kick chat", "kick:stopListeningToChat");

    if (wasListening) {
        window?.webContents.send("kick:chatDisconnected");
    }
}

export async function startKickTokenAutoRefresh(
    window?: Electron.BrowserWindow
) {
    if (refreshKickTokenInterval) clearInterval(refreshKickTokenInterval);

    refreshKickTokenInterval = setInterval(async () => {
        const kickExpiresAt = Config.get("kickExpiresAt");
        if (!kickExpiresAt) return;

        // Check if token is about to expire (within 2 minutes)
        if (Date.now() >= kickExpiresAt - 2 * 60 * 1000) {
            const refreshSuccess = await refreshKickAccessToken();

            if (!refreshSuccess) {
                logError(
                    "Failed to refresh Kick token; guest chat reading stays connected",
                    "kick:tokenRefresh"
                );
                stopKickTokenAutoRefresh();

                // Replies still require a valid OAuth session, so surface the
                // login failure without tearing down the anonymous guest
                // reader. Manual logout/stop still stops everything.
                window?.webContents.send("kick:authenticationFailed");
            }
        }
    }, 60 * 1000);
}

export function stopKickTokenAutoRefresh() {
    if (refreshKickTokenInterval) clearInterval(refreshKickTokenInterval);
    refreshKickTokenInterval = null;
}
