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
import {
    isPlainObject,
    readBoundedString,
    readChatMessage,
} from "../../../core/ipc/payloadValidation";
import { verifyAppCredentials } from "../../../shared/utils/credentialVerification";

let authInProgress = false;
// Bumped on explicit logout and auth completion. Async identity/chat/timer
// continuations capture this value and abandon their work if it changed.
let kickSessionEpoch = 0;

function resetAuthState() {
    authInProgress = false;
}

function currentKickSessionEpoch(): number {
    return kickSessionEpoch;
}

function isCurrentKickSession(epoch: number): boolean {
    return epoch === kickSessionEpoch;
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
    kickSessionEpoch += 1;
    resetAuthState();
});

ipcMain.handle("kick:getUserData", async (event) => {
    logDebug("IPC kick:getUserData called");
    return {
        username: Config.get("username") || "",
        chatroomId: Config.get("chatroomId") || "",
    };
});

ipcMain.handle("kick:findChatroom", async (event, data: unknown) => {
    logDebug("IPC kick:findChatroom called", redactSecrets(data));
    const payload = isPlainObject(data) ? data : undefined;
    const username = readBoundedString(payload?.username, 50);
    if (!username) {
        logWarn(
            "Ignored malformed kick:findChatroom payload",
            "kick:findChatroom"
        );
        return null;
    }

    const epoch = currentKickSessionEpoch();
    const chatroomResult = await kickClient.findChatroom(username);
    if (!isCurrentKickSession(epoch)) {
        logDebug(
            "Ignored late kick:findChatroom result after session change",
            "kick:findChatroom"
        );
        return null;
    }
    const userProfileResult = await kickClient.getUserProfile(username);
    if (!isCurrentKickSession(epoch)) {
        logDebug(
            "Ignored late kick:findChatroom profile after session change",
            "kick:findChatroom"
        );
        return null;
    }

    if (!userProfileResult) {
        logError("Failed to fetch user profile", "kick:findChatroom");
        return null;
    }

    const { broadcaster_user_id: userId } = userProfileResult;
    if (!chatroomResult) {
        return null;
    }

    const { chatroomId } = chatroomResult;
    if (!isCurrentKickSession(epoch)) {
        return null;
    }
    Config.set({ username, chatroomId, userId: userId.toString() });
    logInfo(
        "kick:findChatroom set config",
        redactSecrets({ username, chatroomId, userId })
    );

    return chatroomId;
});

ipcMain.on("kick:sendMessage", async (event, message: unknown) => {
    const text = readChatMessage(message);
    if (!text) {
        logWarn("Ignored malformed kick:sendMessage payload", "kick:sendMessage");
        return;
    }
    logDebug("IPC kick:sendMessage called", redactSecrets({ message: text }));
    try {
        await sendKickMessage(text);
    } catch (error) {
        // Without this the async IPC handler would reject unhandled when the
        // Kick client has no session or the request fails.
        logError(error, "kick:sendMessage:ipcHandler");
    }
});

ipcMain.handle("kick:checkAuth", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const epoch = currentKickSessionEpoch();

    if (!kickClient.hasTokens()) {
        handleKickAuthUnavailable("No Kick OAuth tokens");
        return { authenticated: false };
    }

    const refreshed = await kickClient.getValidAccessToken();
    if (!refreshed) {
        handleKickAuthUnavailable("Kick OAuth token refresh failed");
        return { authenticated: false };
    }
    if (!isCurrentKickSession(epoch)) {
        return { authenticated: false };
    }

    try {
        const channels = await kickClient.getChannels();
        if (!isCurrentKickSession(epoch)) {
            logDebug(
                "Ignored late kick:checkAuth channels after session change",
                "kick:checkAuth"
            );
            return { authenticated: false };
        }
        const username = channels[0]?.slug || "";
        const userId = channels[0]?.broadcaster_user_id;

        if (username) {
            if (!isCurrentKickSession(epoch)) {
                return { authenticated: false };
            }
            Config.set({
                username,
                userId: userId ? userId.toString() : undefined,
            });
        }

        let chatroomId = Config.get("chatroomId");
        if (!chatroomId && username) {
            const chatroomResult = await kickClient.findChatroom(username);
            if (!isCurrentKickSession(epoch)) {
                logDebug(
                    "Ignored late kick:checkAuth chatroom after session change",
                    "kick:checkAuth"
                );
                return { authenticated: false };
            }
            if (chatroomResult?.chatroomId) {
                chatroomId = chatroomResult.chatroomId;
                Config.set({ chatroomId });
            }
        }

        if (!isCurrentKickSession(epoch)) {
            return { authenticated: false };
        }
        if (chatroomId) {
            listenToChat(window ?? undefined);
        } else {
            stopListeningToChat(window ?? undefined);
        }

        if (!isCurrentKickSession(epoch)) {
            return { authenticated: false };
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
    const epoch = currentKickSessionEpoch();

    if (!kickClient.hasTokens()) {
        handleKickAuthUnavailable("No Kick OAuth tokens");
        return { authenticated: false };
    }

    const refreshed = await kickClient.getValidAccessToken();
    if (!refreshed) {
        handleKickAuthUnavailable("Kick OAuth token refresh failed");
        return { authenticated: false };
    }
    if (!isCurrentKickSession(epoch)) {
        return { authenticated: false };
    }

    let username = Config.get("username") || "";
    if (!username) {
        const channels = await kickClient.getChannels();
        if (!isCurrentKickSession(epoch)) {
            return { authenticated: false };
        }
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
        if (!isCurrentKickSession(epoch)) {
            return { authenticated: false };
        }
        if (chatroomResult?.chatroomId) {
            chatroomId = chatroomResult.chatroomId;
            Config.set({ chatroomId });
        }
    }

    if (!isCurrentKickSession(epoch)) {
        return { authenticated: false };
    }
    stopListeningToChat(window ?? undefined);
    if (chatroomId) {
        listenToChat(window ?? undefined);
    }
    if (!isCurrentKickSession(epoch)) {
        return { authenticated: false };
    }
    startKickTokenAutoRefresh(window ?? undefined);

    return { authenticated: true };
});

ipcMain.on("kick:logout", (event) => {
    logInfo("IPC kick:logout called");
    kickSessionEpoch += 1;
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

function readKickCredentialPair(secrets: unknown): {
    clientId: string;
    clientSecret: string;
} {
    const record = isPlainObject(secrets) ? secrets : null;
    const clientId =
        typeof record?.kickClientId === "string"
            ? record.kickClientId.trim()
            : "";
    const suppliedSecret =
        typeof record?.kickClientSecret === "string"
            ? record.kickClientSecret.trim()
            : "";
    const storedId = String(Config.get("kickClientId") || "").trim();
    const storedSecret = String(Config.get("kickClientSecret") || "").trim();
    return {
        clientId,
        clientSecret:
            suppliedSecret ||
            (clientId && clientId === storedId ? storedSecret : ""),
    };
}

ipcMain.handle("kick:verifySecrets", async (_event, secrets) => {
    const { clientId, clientSecret } = readKickCredentialPair(secrets);
    if (!clientId || !clientSecret) {
        return { success: false, code: "missing_credentials" };
    }
    return verifyAppCredentials("kick", { clientId, clientSecret });
});

ipcMain.handle("kick:setSecrets", async (_event, secrets) => {
    const { clientId, clientSecret } = readKickCredentialPair(secrets);
    if (!clientId || !clientSecret) {
        logWarn(
            "kick:setSecrets ignored a malformed payload",
            "kick:setSecrets"
        );
        return { success: false, code: "missing_credentials" };
    }
    const verification = await verifyAppCredentials("kick", {
        clientId,
        clientSecret,
    });
    if (!verification.success) {
        return verification;
    }
    logInfo("kick:setSecrets called");
    Config.set({ kickClientId: clientId, kickClientSecret: clientSecret });
    return { success: true };
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
