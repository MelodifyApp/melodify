import WebSocket from "ws";
import Config from "@/core/config";
import { logInfo, logError, logWarn, logDebug } from "@/core/logging";
import { redactSecrets } from "@/core/logging/utils";
import { CommandContext } from "@/core/commands/manager";
import { commandManager } from "@/core/ipc/handlers";
import { twitchClient } from "@/features/twitch/api/client";
import { executeSongRequest } from "@/core/commands/songRequest";
import { decodeTwitchChatContext } from "./context";
import { sendToWindowIfAlive } from "@/shared/utils/windowSend";

export let isListening = false;
let websocketClient: WebSocket | null = null;
let websocketSessionID: string | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const EVENTSUB_WEBSOCKET_URL = "wss://eventsub.wss.twitch.tv/ws";

export async function sendTwitchMessage(message: string): Promise<void> {
    logDebug("sendTwitchMessage called", redactSecrets({ message }));

    const broadcasterUserId = Config.get("twitchUserId");
    const botUserId = Config.get("twitchBotUserId");

    if (!broadcasterUserId || !botUserId) {
        logError(
            "Missing Twitch broadcaster or bot user ID",
            "twitch:sendMessage"
        );
        throw new Error("Missing Twitch broadcaster or bot user ID");
    }

    const accessToken = await twitchClient.getValidAccessToken();
    if (!accessToken) {
        logError("Missing Twitch access token", "twitch:sendMessage");
        throw new Error("Missing Twitch access token");
    }

    const clientId = Config.get("twitchClientId");
    if (!clientId) {
        logError("Missing Twitch client ID", "twitch:sendMessage");
        throw new Error("Missing Twitch client ID");
    }

    try {
        const response = await fetch(
            "https://api.twitch.tv/helix/chat/messages",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Client-Id": clientId,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    broadcaster_id: broadcasterUserId,
                    sender_id: botUserId,
                    message: message,
                }),
            }
        );

        if (response.status !== 200) {
            const data = await response.json();
            logError(
                `Failed to send Twitch chat message: ${JSON.stringify(data)}`,
                "twitch:sendMessage"
            );
            throw new Error("Failed to send chat message");
        } else {
            logDebug(
                `Sent Twitch chat message: ${message}`,
                "twitch:sendMessage"
            );
        }
    } catch (error) {
        logError(error, "twitch:sendMessage");
        throw error;
    }
}

async function validateToken(): Promise<boolean> {
    const accessToken = await twitchClient.getValidAccessToken();
    if (!accessToken) {
        logError("No access token available", "twitch:validateToken");
        return false;
    }

    try {
        const response = await fetch("https://id.twitch.tv/oauth2/validate", {
            method: "GET",
            headers: {
                Authorization: `OAuth ${accessToken}`,
            },
        });

        if (response.status !== 200) {
            const data = await response.json();
            logError(
                `Token validation failed with status ${response.status}: ${JSON.stringify(data)}`,
                "twitch:validateToken"
            );
            return false;
        }

        logInfo("Twitch token validated successfully", "twitch:validateToken");
        return true;
    } catch (error) {
        logError(error, "twitch:validateToken");
        return false;
    }
}

function startWebSocketClient(): WebSocket {
    logInfo(
        `Connecting to Twitch EventSub WebSocket: ${EVENTSUB_WEBSOCKET_URL}`,
        "twitch:websocket"
    );

    const client = new WebSocket(EVENTSUB_WEBSOCKET_URL);

    client.on("error", (error) => {
        logError(error, "twitch:websocketError");
    });

    client.on("open", () => {
        logInfo(
            `Connected to Twitch EventSub WebSocket`,
            "twitch:websocketOpen"
        );
        reconnectAttempts = 0;
    });

    client.on("message", (data) => {
        try {
            handleWebSocketMessage(JSON.parse(data.toString()));
        } catch (error) {
            logError(error, "twitch:websocketMessageParse");
        }
    });

    client.on("close", () => {
        logWarn(`Twitch EventSub WebSocket closed`, "twitch:websocketClose");
        websocketClient = null;
        websocketSessionID = null;
        if (isListening && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            logInfo(
                `Attempting to reconnect to Twitch (attempt ${reconnectAttempts})`,
                "twitch:reconnect"
            );
            // Attempt reconnection after delay
            setTimeout(() => {
                if (isListening) {
                    websocketClient = startWebSocketClient();
                }
            }, 2000 * reconnectAttempts);
        }
    });

    return client;
}

async function registerEventSubListeners(): Promise<void> {
    const broadcasterUserId = Config.get("twitchUserId");
    const botUserId = Config.get("twitchBotUserId");
    const accessToken = await twitchClient.getValidAccessToken();
    const clientId = Config.get("twitchClientId");

    if (!broadcasterUserId || !botUserId || !accessToken || !clientId) {
        logError(
            "Missing required Twitch configuration for EventSub",
            "twitch:registerEventSub"
        );
        return;
    }

    if (!websocketSessionID) {
        logError(
            "WebSocket session ID not available",
            "twitch:registerEventSub"
        );
        return;
    }

    try {
        const response = await fetch(
            "https://api.twitch.tv/helix/eventsub/subscriptions",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Client-Id": clientId,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    type: "channel.chat.message",
                    version: "1",
                    condition: {
                        broadcaster_user_id: broadcasterUserId,
                        user_id: botUserId,
                    },
                    transport: {
                        method: "websocket",
                        session_id: websocketSessionID,
                    },
                }),
            }
        );

        if (response.status !== 202) {
            const data = await response.json();
            logError(
                `Failed to subscribe to channel.chat.message. Status: ${response.status}, Data: ${JSON.stringify(data)}`,
                "twitch:registerEventSub"
            );
        } else {
            const data = await response.json();
            logInfo(
                `Subscribed to channel.chat.message [${data.data[0].id}]`,
                "twitch:registerEventSub"
            );
        }

        const rewardsResponse = await fetch(
            "https://api.twitch.tv/helix/eventsub/subscriptions",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Client-Id": clientId,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    type: "channel.channel_points_custom_reward_redemption.add",
                    version: "1",
                    condition: {
                        broadcaster_user_id: broadcasterUserId,
                    },
                    transport: {
                        method: "websocket",
                        session_id: websocketSessionID,
                    },
                }),
            }
        );

        if (rewardsResponse.status !== 202) {
            const data = await rewardsResponse.json();
            logError(
                `Failed to subscribe to channel.channel_points_custom_reward_redemption.add. Status: ${rewardsResponse.status}, Data: ${JSON.stringify(data)}`,
                "twitch:registerEventSub"
            );
        } else {
            const data = await rewardsResponse.json();
            logInfo(
                `Subscribed to channel.channel_points_custom_reward_redemption.add [${data.data[0].id}]`,
                "twitch:registerEventSub"
            );
        }
    } catch (error) {
        logError(error, "twitch:registerEventSub");
    }
}

function handleWebSocketMessage(data: any): void {
    try {
        if (!data.metadata) {
            logDebug(
                "Invalid WebSocket message format",
                "twitch:handleMessage"
            );
            return;
        }

        const messageType = data.metadata.message_type;

        if (messageType === "session_welcome") {
            websocketSessionID = data.payload.session.id;
            logInfo(
                `WebSocket session established: ${websocketSessionID}`,
                "twitch:sessionWelcome"
            );
            registerEventSubListeners();
        } else if (
            messageType === "notification" &&
            data.metadata.subscription_type === "channel.chat.message"
        ) {
            handleChatMessage(data.payload.event);
        } else if (
            messageType === "notification" &&
            data.metadata.subscription_type ===
                "channel.channel_points_custom_reward_redemption.add"
        ) {
            handleChannelPointRedemption(data.payload.event);
        }
    } catch (error) {
        logError(error, "twitch:handleWebSocketMessage");
    }
}

type TwitchRewardRedemptionEvent = {
    user_login?: string;
    user_name?: string;
    user_input?: string;
    reward?: {
        id?: string;
        title?: string;
    };
};

async function handleChannelPointRedemption(
    event: TwitchRewardRedemptionEvent
): Promise<void> {
    try {
        const username = event.user_login || event.user_name;
        const songQuery = (event.user_input || "").trim();
        const rewardTitle = event.reward?.title;
        const configuredRewardTitle =
            Config.get("twitchRewardTitle") || "Song Request";

        if (!username || !rewardTitle || rewardTitle !== configuredRewardTitle) {
            return;
        }

        const ctx: CommandContext = {
            username,
            message: songQuery,
            badges: [],
            raw: event,
            platform: "twitch",
        };

        await executeSongRequest(ctx, songQuery, commandManager, {
            sendReply: sendTwitchMessage,
            skipPermissionCheck: true,
        });
    } catch (error) {
        logError(error, "twitch:rewardProcessing");
    }
}

async function handleChatMessage(event: any): Promise<void> {
    try {
        const ctx = decodeTwitchChatContext(event);
        if (!ctx) {
            logDebug("Missing message data", "twitch:handleChatMessage");
            return;
        }

        await commandManager.handle(ctx);
    } catch (error) {
        logError(error, "twitch:handleChatMessage");
    }
}

export async function listenToChat(window?: Electron.BrowserWindow) {
    if (isListening) {
        logDebug("Already listening to Twitch chat", "twitch:listenToChat");
        return;
    }

    // Validate token before connecting
    const tokenValid = await validateToken();
    if (!tokenValid) {
        logError("Token validation failed", "twitch:listenToChat");
        sendToWindowIfAlive(window, "twitch:authenticationFailed");
        return;
    }

    try {
        isListening = true;
        websocketClient = startWebSocketClient();

        logInfo("Started listening to Twitch chat", "twitch:listenToChat");
        sendToWindowIfAlive(window, "twitch:chatConnected");
    } catch (error) {
        logError(error, "twitch:listenToChat");
        isListening = false;
        websocketClient = null;
        sendToWindowIfAlive(window, "twitch:authenticationFailed");
    }
}

export function stopListeningToChat(window?: Electron.BrowserWindow) {
    if (!isListening) {
        logDebug(
            "Not currently listening to Twitch chat",
            "twitch:stopListeningToChat"
        );
        return;
    }

    try {
        if (websocketClient) {
            websocketClient.close();
            websocketClient = null;
        }

        isListening = false;
        websocketSessionID = null;
        reconnectAttempts = 0;

        logInfo(
            "Stopped listening to Twitch chat",
            "twitch:stopListeningToChat"
        );
        sendToWindowIfAlive(window, "twitch:chatDisconnected");
    } catch (error) {
        logError(error, "twitch:stopListeningToChat");        // Force reset state even if cleanup failed
        isListening = false;
        websocketClient = null;
        websocketSessionID = null;
    }
}
