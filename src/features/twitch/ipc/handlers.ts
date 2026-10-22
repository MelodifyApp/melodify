import { ipcMain, BrowserWindow } from "electron";
import Config from "@/core/config";
import {
    startTwitchAuthServer,
    openTwitchAuthUrl,
    stopTwitchAuthServer,
} from "@/features/twitch/auth/server";
import {
    isListening,
    listenToChat,
    stopListeningToChat,
    sendTwitchMessage,
} from "@/features/twitch/chat/listener";
import { logInfo, logError, logWarn, logDebug } from "@/core/logging";
import { redactSecrets } from "@/core/logging/utils";
import { twitchClient } from "@/features/twitch/api/client";
import { sendToWindowIfAlive } from "@/shared/utils/windowSend";

let authInProgress = false;

function resetAuthState() {
    authInProgress = false;
}

ipcMain.on("twitch:auth", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    logDebug(
        "IPC twitch:auth called",
        redactSecrets({ sender: !!event.sender })
    );
    if (!window) return;

    if (authInProgress) {
        logWarn("Authentication already in progress");
        return;
    }

    authInProgress = true;

    try {
        await startTwitchAuthServer(window);
        openTwitchAuthUrl();

        // Set a timeout to reset auth state in case the flow doesn't complete
        setTimeout(() => {
            if (authInProgress) {
                logWarn("Auth flow timeout, resetting auth state");
                resetAuthState();
                stopTwitchAuthServer();
            }
        }, 60000); // 1 minute timeout
    } catch (error) {
        logError(error, "twitch:auth:ipcHandler");
        sendToWindowIfAlive(window, "twitch:authenticationFailed");
        resetAuthState();
    }
});

// Handler for auth completion notification from auth server
ipcMain.on("twitch:authComplete", () => {
    logDebug("Auth completion notification received");
    resetAuthState();
});

ipcMain.handle("twitch:getUserData", async (event) => {
    logDebug("IPC twitch:getUserData called");
    return {
        twitchUsername: Config.get("twitchUsername") || "",
        twitchBotUserId: Config.get("twitchBotUserId") || "",
        twitchUserId: Config.get("twitchUserId") || "",
    };
});

ipcMain.on("twitch:sendMessage", async (event, message) => {
    logDebug("IPC twitch:sendMessage called", redactSecrets({ message }));
    try {
        await sendTwitchMessage(message);
    } catch (error) {
        logError(error, "twitch:sendMessage:ipcHandler");
        const window = BrowserWindow.fromWebContents(event.sender);
        sendToWindowIfAlive(window, "twitch:sendMessageError", {
            message: error instanceof Error ? error.message : "Unknown error",
        });
    }
});

ipcMain.handle("twitch:checkAuth", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);

    if (!twitchClient.hasTokens()) {
        stopListeningToChat(window);
        return { authenticated: false };
    }

    if (!(await twitchClient.getValidAccessToken())) {
        stopListeningToChat(window);
        return { authenticated: false };
    }

    listenToChat(window);

    const twitchUsername = Config.get("twitchUsername");
    return { authenticated: true, twitchUsername };
});

ipcMain.on("twitch:logout", (event) => {
    logInfo("IPC twitch:logout called");
    const window = BrowserWindow.fromWebContents(event.sender);

    // Stop all Twitch-related services
    stopTwitchAuthServer();
    stopListeningToChat(window);
    twitchClient.clearTokens();

    // Clear user config
    Config.set({
        twitchUsername: undefined,
        twitchUserId: undefined,
        twitchBotUserId: undefined,
    });

    // Notify UI that authentication is cleared
    sendToWindowIfAlive(window, "twitch:authenticationFailed");

    logInfo(
        "Twitch logout completed - stopped chat listener and cleared tokens"
    );
});

ipcMain.handle("twitch:hasSecrets", async () => {
    const twitchClientId = Config.get("twitchClientId");
    const twitchClientSecret = Config.get("twitchClientSecret");
    logDebug(
        "twitch:hasSecrets called",
        redactSecrets({
            hasClientId: !!twitchClientId,
            hasClientSecret: !!twitchClientSecret,
        })
    );
    return !!twitchClientId && !!twitchClientSecret;
});

ipcMain.on("twitch:setSecrets", (event, secrets) => {
    const record =
        secrets && typeof secrets === "object" && !Array.isArray(secrets)
            ? (secrets as Record<string, unknown>)
            : null;
    const twitchClientId =
        typeof record?.twitchClientId === "string"
            ? record.twitchClientId.trim()
            : "";
    const twitchClientSecret =
        typeof record?.twitchClientSecret === "string"
            ? record.twitchClientSecret.trim()
            : "";
    if (!twitchClientId || !twitchClientSecret) {
        logWarn(
            "twitch:setSecrets ignored a malformed payload",
            "twitch:setSecrets"
        );
        return;
    }
    logInfo("twitch:setSecrets called");
    Config.set({ twitchClientId, twitchClientSecret });
});

ipcMain.handle("twitch:isListeningToChat", async () => {
    logDebug("twitch:isListeningToChat called");
    return isListening;
});

ipcMain.on("twitch:stopListening", (event) => {
    logInfo("IPC twitch:stopListening called");
    const window = BrowserWindow.fromWebContents(event.sender);
    stopListeningToChat(window);
});
