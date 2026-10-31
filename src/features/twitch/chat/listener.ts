import WebSocket from "ws";
import Config from "@/core/config";
import { logInfo, logError, logWarn, logDebug } from "@/core/logging";
import { redactSecrets } from "@/core/logging/utils";
import { CommandContext } from "@/core/commands/manager";
import { commandManager } from "@/core/ipc/handlers";
import { twitchClient } from "@/features/twitch/api/client";
import { executeSongRequest } from "@/core/commands/songRequest";
import { decodeTwitchChatContext } from "./context";
import { rewardMatchesConfigured } from "@/shared/rewards/rewardTitles";
import { sendToWindowIfAlive } from "@/shared/utils/windowSend";

export type TwitchReadinessState =
    | "stopped"
    | "connecting"
    | "subscribing"
    | "ready"
    | "reconnecting"
    | "error";

export let isListening = false;
let readinessState: TwitchReadinessState = "stopped";
let connectionActive = false;
let retryRequiresExplicitStart = false;
let activeWindow: Electron.BrowserWindow | null = null;
let websocketClient: WebSocket | null = null;
let websocketSessionID: string | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const EVENTSUB_WEBSOCKET_URL = "wss://eventsub.wss.twitch.tv/ws";

export function getTwitchReadinessState(): TwitchReadinessState {
    return readinessState;
}

function clearReconnectTimer(): void {
    if (!reconnectTimer) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
}

function sendConnectionStatus(channel: string): void {
    sendToWindowIfAlive(activeWindow, channel);
}

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

function isCurrentConnection(
    client: WebSocket,
    sessionId?: string
): boolean {
    return (
        connectionActive &&
        websocketClient === client &&
        (sessionId === undefined || websocketSessionID === sessionId)
    );
}

function handleSocketClosed(client: WebSocket): void {
    if (websocketClient !== client) return;

    const wasReady = isListening;
    websocketClient = null;
    websocketSessionID = null;
    isListening = false;

    if (!connectionActive) {
        if (readinessState !== "error") readinessState = "stopped";
        if (wasReady) sendConnectionStatus("twitch:chatDisconnected");
        return;
    }

    if (wasReady) {
        sendConnectionStatus("twitch:chatDisconnected");
    }

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        connectionActive = false;
        retryRequiresExplicitStart = true;
        readinessState = "error";
        reconnectAttempts = 0;
        logError(
            "Twitch reconnect attempts exhausted",
            "twitch:reconnect"
        );
        if (!wasReady) sendConnectionStatus("twitch:chatDisconnected");
        return;
    }

    reconnectAttempts += 1;
    readinessState = "reconnecting";
    logInfo(
        `Attempting to reconnect to Twitch (attempt ${reconnectAttempts})`,
        "twitch:reconnect"
    );
    clearReconnectTimer();
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!connectionActive || readinessState !== "reconnecting") return;
        try {
            websocketClient = startWebSocketClient();
        } catch (error) {
            logError(error, "twitch:reconnect");
            connectionActive = false;
            retryRequiresExplicitStart = true;
            readinessState = "error";
            isListening = false;
            sendConnectionStatus("twitch:chatDisconnected");
        }
    }, 2000 * reconnectAttempts);
}

function failReadiness(client: WebSocket): void {
    if (websocketClient !== client) return;

    connectionActive = false;
    retryRequiresExplicitStart = true;
    isListening = false;
    readinessState = "error";
    websocketSessionID = null;
    reconnectAttempts = 0;
    clearReconnectTimer();
    websocketClient = null;

    try {
        client.close();
    } catch (error) {
        logError(error, "twitch:websocketClose");
    }
    sendConnectionStatus("twitch:chatDisconnected");
}

function markReady(client: WebSocket, sessionId: string): void {
    if (!isCurrentConnection(client, sessionId)) return;

    isListening = true;
    readinessState = "ready";
    retryRequiresExplicitStart = false;
    reconnectAttempts = 0;
    logInfo(
        `Listening to Twitch chat after EventSub subscriptions were accepted`,
        "twitch:listenToChat"
    );
    sendConnectionStatus("twitch:chatConnected");
}

function startWebSocketClient(): WebSocket {
    logInfo(
        `Connecting to Twitch EventSub WebSocket: ${EVENTSUB_WEBSOCKET_URL}`,
        "twitch:websocket"
    );

    const client = new WebSocket(EVENTSUB_WEBSOCKET_URL);
    websocketClient = client;

    client.on("error", (error) => {
        if (websocketClient !== client) return;
        logError(error, "twitch:websocketError");
    });

    client.on("open", () => {
        if (websocketClient !== client) return;
        logInfo(
            `Connected to Twitch EventSub WebSocket`,
            "twitch:websocketOpen"
        );
        if (connectionActive && !isListening) {
            readinessState = "connecting";
        }
    });

    client.on("message", (data) => {
        if (websocketClient !== client) return;
        try {
            handleWebSocketMessage(client, JSON.parse(data.toString()));
        } catch (error) {
            logError(error, "twitch:websocketMessageParse");
        }
    });

    client.on("close", () => {
        logWarn(`Twitch EventSub WebSocket closed`, "twitch:websocketClose");
        handleSocketClosed(client);
    });

    return client;
}

async function subscribeEvent(
    type: string,
    version: string,
    condition: Record<string, string>,
    accessToken: string,
    clientId: string,
    sessionId: string
): Promise<boolean> {
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
                    type,
                    version,
                    condition,
                    transport: {
                        method: "websocket",
                        session_id: sessionId,
                    },
                }),
            }
        );

        if (response.status !== 202) {
            let details = "";
            try {
                details = JSON.stringify(await response.json());
            } catch {
                details = "unreadable response";
            }
            logError(
                `Failed to subscribe to ${type}. Status: ${response.status}, Data: ${details}`,
                "twitch:registerEventSub"
            );
            return false;
        }

        let subscriptionId = "unknown";
        try {
            const data = await response.json();
            if (typeof data?.data?.[0]?.id === "string") {
                subscriptionId = data.data[0].id;
            }
        } catch {
            // A 202 is already acceptance; logging the id is best effort.
        }
        logInfo(
            `Subscribed to ${type} [${subscriptionId}]`,
            "twitch:registerEventSub"
        );
        return true;
    } catch (error) {
        logError(error, "twitch:registerEventSub");
        return false;
    }
}

async function registerEventSubListeners(
    client: WebSocket,
    sessionId: string
): Promise<boolean> {
    const broadcasterUserId = Config.get("twitchUserId");
    const botUserId = Config.get("twitchBotUserId");
    const accessToken = await twitchClient.getValidAccessToken();
    const clientId = Config.get("twitchClientId");

    if (!broadcasterUserId || !botUserId || !accessToken || !clientId) {
        logError(
            "Missing required Twitch configuration for EventSub",
            "twitch:registerEventSub"
        );
        return false;
    }
    if (!isCurrentConnection(client, sessionId)) return false;

    const chatAccepted = await subscribeEvent(
        "channel.chat.message",
        "1",
        {
            broadcaster_user_id: broadcasterUserId,
            user_id: botUserId,
        },
        accessToken,
        clientId,
        sessionId
    );
    if (!chatAccepted || !isCurrentConnection(client, sessionId)) {
        return false;
    }

    const rewardsAccepted = await subscribeEvent(
        "channel.channel_points_custom_reward_redemption.add",
        "1",
        {
            broadcaster_user_id: broadcasterUserId,
        },
        accessToken,
        clientId,
        sessionId
    );
    return rewardsAccepted && isCurrentConnection(client, sessionId);
}

function handleRevocation(client: WebSocket): void {
    if (websocketClient !== client) return;

    logWarn(
        "Twitch EventSub subscription was revoked",
        "twitch:registerEventSub"
    );
    connectionActive = false;
    retryRequiresExplicitStart = true;
    isListening = false;
    readinessState = "error";
    websocketSessionID = null;
    reconnectAttempts = 0;
    clearReconnectTimer();
    websocketClient = null;

    try {
        client.close();
    } catch (error) {
        logError(error, "twitch:websocketClose");
    }
    sendConnectionStatus("twitch:chatDisconnected");
}

function handleWebSocketMessage(client: WebSocket, data: any): void {
    try {
        if (websocketClient !== client) return;
        if (!data.metadata) {
            logDebug(
                "Invalid WebSocket message format",
                "twitch:handleMessage"
            );
            return;
        }

        const messageType = data.metadata.message_type;

        if (messageType === "session_welcome") {
            if (!connectionActive) return;
            if (readinessState === "subscribing" || readinessState === "ready") {
                return;
            }
            const sessionId = data.payload?.session?.id;
            if (typeof sessionId !== "string" || !sessionId) {
                failReadiness(client);
                return;
            }
            websocketSessionID = sessionId;
            readinessState = "subscribing";
            isListening = false;
            logInfo(
                `WebSocket session established: ${websocketSessionID}`,
                "twitch:sessionWelcome"
            );
            void registerEventSubListeners(client, sessionId)
                .then((registered) => {
                    if (registered) {
                        markReady(client, sessionId);
                    } else {
                        failReadiness(client);
                    }
                })
                .catch((error) => {
                    logError(error, "twitch:registerEventSub");
                    failReadiness(client);
                });
        } else if (messageType === "revocation") {
            handleRevocation(client);
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
        const configuredRewardId = Config.get("twitchRewardId");

        if (
            !username ||
            !rewardMatchesConfigured({
                configuredId: configuredRewardId,
                configuredTitle: configuredRewardTitle,
                eventId: event.reward?.id,
                eventTitle: rewardTitle,
            })
        ) {
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

export async function listenToChat(
    window?: Electron.BrowserWindow,
    forceRetry = false
) {
    if (connectionActive) {
        logDebug("Twitch chat connection is already active", "twitch:listenToChat");
        return;
    }
    if (retryRequiresExplicitStart && !forceRetry) {
        logDebug(
            "Twitch readiness is in a terminal state; waiting for an explicit retry",
            "twitch:listenToChat"
        );
        return;
    }

    clearReconnectTimer();
    connectionActive = true;
    retryRequiresExplicitStart = false;
    isListening = false;
    readinessState = "connecting";
    activeWindow = window ?? activeWindow;
    reconnectAttempts = 0;

    try {
        const tokenValid = await validateToken();
        if (!connectionActive || readinessState !== "connecting") return;
        if (!tokenValid) {
            logError("Token validation failed", "twitch:listenToChat");
            connectionActive = false;
            retryRequiresExplicitStart = false;
            isListening = false;
            readinessState = "error";
            sendConnectionStatus("twitch:authenticationFailed");
            return;
        }

        websocketClient = startWebSocketClient();
        logInfo(
            "Connecting to Twitch chat; waiting for EventSub subscriptions",
            "twitch:listenToChat"
        );
    } catch (error) {
        logError(error, "twitch:listenToChat");
        connectionActive = false;
        retryRequiresExplicitStart = false;
        isListening = false;
        readinessState = "error";
        websocketClient = null;
        websocketSessionID = null;
        sendConnectionStatus("twitch:authenticationFailed");
    }
}

export function stopListeningToChat(window?: Electron.BrowserWindow) {
    const hadConnection =
        connectionActive ||
        websocketClient !== null ||
        readinessState !== "stopped";

    clearReconnectTimer();
    if (window) activeWindow = window;
    connectionActive = false;
    retryRequiresExplicitStart = false;
    isListening = false;
    readinessState = "stopped";
    websocketSessionID = null;
    reconnectAttempts = 0;

    const client = websocketClient;
    websocketClient = null;
    if (client) {
        try {
            client.close();
        } catch (error) {
            logError(error, "twitch:stopListeningToChat");
        }
    }

    logInfo(
        "Stopped listening to Twitch chat",
        "twitch:stopListeningToChat"
    );
    if (hadConnection) {
        sendConnectionStatus("twitch:chatDisconnected");
    }
    activeWindow = null;
}
