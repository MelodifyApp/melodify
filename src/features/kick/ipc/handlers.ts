import { ipcMain, BrowserWindow } from "electron";
import Config from "@/core/config";
import {
    startKickAuthServer,
    openKickAuthUrl,
    stopKickAuthServer,
} from "@/features/kick/auth/server";
import {
    isListening,
    listenToChat,
    stopListeningToChat,
    sendKickMessage,
    startKickTokenAutoRefresh,
    stopKickTokenAutoRefresh,
} from "@/features/kick/chat/listener";
import { logInfo, logError, logWarn, logDebug } from "@/core/logging";
import { redactSecrets } from "@/core/logging/utils";
import { kickClient } from "@/features/kick/api/client";
import { sendToWindowIfAlive } from "@/shared/utils/windowSend";

let authInProgress = false;

function resetAuthState() {
    authInProgress = false;
}

/**
 * OAuth is only required for replies; anonymous guest reading is independent.
 * An auth failure stops the OAuth refresh timer so the failure is surfaced
 * once, but it must not tear down a healthy guest reader — only an explicit
 * logout/stop (or the intentional retry restart) may do that.
 */
function handleKickAuthUnavailable(reason: string): void {
    logWarn(
        `${reason}; guest chat reading is independent and stays as-is`,
        "kick:auth"
    );
    stopKickTokenAutoRefresh();
}

ipcMain.on("kick:auth", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    logDebug("IPC kick:auth called", redactSecrets({ sender: !!event.sender }));
    if (!window) return;

    if (authInProgress) {
        logWarn("Authentication already in progress");
        return;
    }

    authInProgress = true;

    try {
        await startKickAuthServer(window);
        openKickAuthUrl();

        // Set a timeout to reset auth state in case the flow doesn't complete
        setTimeout(() => {
            if (authInProgress) {
                logWarn("Auth flow timeout, resetting auth state");
                resetAuthState();
            }
        }, 60000); // 1 minute timeout
    } catch (error) {
        logError(error, "kick:auth:ipcHandler");
        sendToWindowIfAlive(window, "kick:authenticationFailed");
        resetAuthState();
    }
});

// Handler for auth completion notification from auth server
ipcMain.on("kick:authComplete", () => {
    logDebug("Auth completion notification received");
    resetAuthState();
});

ipcMain.handle("kick:getUserData", async (event) => {
    logDebug("IPC kick:getUserData called");
    return {
        username: Config.get("username") || "",
        chatroomId: Config.get("chatroomId") || "",
    };
});

ipcMain.handle("kick:findChatroom", async (event, data) => {
    logDebug("IPC kick:findChatroom called", redactSecrets(data));
    const { username } = data;

    const chatroomResult = await kickClient.findChatroom(username);
    const userProfileResult = await kickClient.getUserProfile(username);

    if (!userProfileResult) {
        logError("Failed to fetch user profile", "kick:findChatroom");
        return null;
    }

    const { broadcaster_user_id: userId } = userProfileResult;
    if (!chatroomResult) {
        return null;
    }

    const { chatroomId } = chatroomResult;
    Config.set({ username, chatroomId, userId: userId.toString() });
    logInfo(
        "kick:findChatroom set config",
        redactSecrets({ username, chatroomId, userId })
    );

    return chatroomId;
});

ipcMain.on("kick:sendMessage", async (event, message) => {
    logDebug("IPC kick:sendMessage called", redactSecrets({ message }));
    await sendKickMessage(message);
});

ipcMain.handle("kick:checkAuth", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);

    if (!kickClient.hasTokens()) {
        handleKickAuthUnavailable("No Kick OAuth tokens");
        return { authenticated: false };
    }

    const refreshed = await kickClient.getValidAccessToken();
    if (!refreshed) {
        handleKickAuthUnavailable("Kick OAuth token refresh failed");
        return { authenticated: false };
    }

    try {
        const channels = await kickClient.getChannels();
        const username = channels[0]?.slug || "";
        const userId = channels[0]?.broadcaster_user_id;

        if (username) {
            Config.set({
                username,
                userId: userId ? userId.toString() : undefined,
            });
        }

        let chatroomId = Config.get("chatroomId");
        if (!chatroomId && username) {
            const chatroomResult = await kickClient.findChatroom(username);
            if (chatroomResult?.chatroomId) {
                chatroomId = chatroomResult.chatroomId;
                Config.set({ chatroomId });
            }
        }

        if (chatroomId) {
            listenToChat(window ?? undefined);
        } else {
            stopListeningToChat(window ?? undefined);
        }

        startKickTokenAutoRefresh(window ?? undefined);
        return { authenticated: true, username };
    } catch (error) {
        logError(error, "kick:checkAuth");
        handleKickAuthUnavailable("Kick auth check failed");
        return { authenticated: false };
    }
});

ipcMain.handle("kick:retryChat", async (event) => {
    logInfo("IPC kick:retryChat called");
    const window = BrowserWindow.fromWebContents(event.sender);

    if (!kickClient.hasTokens()) {
        handleKickAuthUnavailable("No Kick OAuth tokens");
        return { authenticated: false };
    }

    const refreshed = await kickClient.getValidAccessToken();
    if (!refreshed) {
        handleKickAuthUnavailable("Kick OAuth token refresh failed");
        return { authenticated: false };
    }

    let username = Config.get("username") || "";
    if (!username) {
        const channels = await kickClient.getChannels();
        username = channels[0]?.slug || "";
        const userId = channels[0]?.broadcaster_user_id;
        if (username) {
            Config.set({
                username,
                userId: userId ? userId.toString() : undefined,
            });
        }
    }

    let chatroomId = Config.get("chatroomId");
    if (!chatroomId && username) {
        const chatroomResult = await kickClient.findChatroom(username);
        if (chatroomResult?.chatroomId) {
            chatroomId = chatroomResult.chatroomId;
            Config.set({ chatroomId });
        }
    }

    stopListeningToChat(window ?? undefined);
    if (chatroomId) {
        listenToChat(window ?? undefined);
    }
    startKickTokenAutoRefresh(window ?? undefined);

    return { authenticated: true };
});

ipcMain.on("kick:logout", (event) => {
    logInfo("IPC kick:logout called");
    const window = BrowserWindow.fromWebContents(event.sender);

    // Stop all Kick-related services
    stopKickAuthServer();
    stopKickTokenAutoRefresh();
    stopListeningToChat(window || undefined);
    kickClient.clearTokens();

    // Notify UI that authentication is cleared
    sendToWindowIfAlive(window, "kick:authenticationFailed");

    logInfo("Kick logout completed - stopped chat listener and cleared tokens");
});

ipcMain.handle("kick:hasSecrets", async () => {
    const kickClientId = Config.get("kickClientId");
    const kickClientSecret = Config.get("kickClientSecret");
    logDebug(
        "kick:hasSecrets called",
        redactSecrets({
            hasClientId: !!kickClientId,
            hasClientSecret: !!kickClientSecret,
        })
    );
    return !!kickClientId && !!kickClientSecret;
});

ipcMain.handle("kick:getSecrets", async () => {
    logDebug("kick:getSecrets called");
    return {
        kickClientId: Config.get("kickClientId"),
        kickClientSecret: Config.get("kickClientSecret"),
    };
});

ipcMain.on("kick:setSecrets", (event, secrets) => {
    const record =
        secrets && typeof secrets === "object" && !Array.isArray(secrets)
            ? (secrets as Record<string, unknown>)
            : null;
    const kickClientId =
        typeof record?.kickClientId === "string"
            ? record.kickClientId.trim()
            : "";
    const kickClientSecret =
        typeof record?.kickClientSecret === "string"
            ? record.kickClientSecret.trim()
            : "";
    if (!kickClientId || !kickClientSecret) {
        logWarn(
            "kick:setSecrets ignored a malformed payload",
            "kick:setSecrets"
        );
        return;
    }
    logInfo("kick:setSecrets called");
    Config.set({ kickClientId, kickClientSecret });
});

ipcMain.handle("kick:isListeningToChat", async () => {
    logDebug("kick:isListeningToChat called");
    return isListening;
});

ipcMain.on("kick:stopListening", (event) => {
    logInfo("IPC kick:stopListening called");
    const window = BrowserWindow.fromWebContents(event.sender);
    stopListeningToChat(window || undefined);
});
