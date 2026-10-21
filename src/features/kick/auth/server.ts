import express from "express";
import { BrowserWindow, shell, ipcMain } from "electron";
import {
    generateCodeChallenge,
    generateCodeVerifier,
} from "@/shared/utils/pkce";
import type { Server } from "http";
import Config from "@/core/config";
import { listenToChat } from "@/features/kick/chat/listener";
import { logInfo, logError, logDebug } from "@/core/logging";
import { redactSecrets } from "@/core/logging/utils";
import { kickClient } from "@/features/kick/api/client";
import { sendToWindowIfAlive } from "@/shared/utils/windowSend";

const redirectUri =
    Config.get("kickRedirectUri") || "http://localhost:8889/callback";
const port = 8889;

let serverInstance: Server | null = null;
let serverStarting = false;

export async function startKickAuthServer(
    window: BrowserWindow
): Promise<void> {
    logDebug("startKickAuthServer called", redactSecrets({ window: !!window }));

    // Prevent multiple server starts
    if (serverInstance || serverStarting) {
        logDebug("Auth server already running or starting, skipping");
        return;
    }

    serverStarting = true;

    const app = express();

    return new Promise((resolve, reject) => {
        app.get("/callback", async (req, res) => {
            const code = req.query.code as string | undefined;
            logDebug("Kick auth callback hit", { hasCode: !!code });

            if (!code) {
                const errorMsg = "Missing code parameter in callback";
                logError(errorMsg, "kickAuthServer:callback");
                res.status(400).send(
                    "❌ Authentication failed: Missing authorization code"
                );
                sendToWindowIfAlive(window, "kick:authenticationFailed");
                // Emit auth completion to main process even on failure
                ipcMain.emit("kick:authComplete");

                // Clean up server state
                if (serverInstance) {
                    serverInstance.close();
                    serverInstance = null;
                }
                serverStarting = false;
                return;
            }

            try {
                const codeVerifier = Config.get("codeVerifier");
                if (!codeVerifier) {
                    throw new Error("Missing code verifier");
                }

                // Exchange code for tokens using KickClient
                const tokenExchangeSuccess =
                    await kickClient.exchangeCodeForTokens(code, codeVerifier);
                if (!tokenExchangeSuccess) {
                    throw new Error("Failed to exchange code for tokens");
                }

                logInfo("Kick tokens obtained successfully");

                // Get user's channels using KickClient
                const channels = await kickClient.getChannels();
                if (!channels || channels.length === 0) {
                    throw new Error("No channels found for user");
                }

                const username = channels[0].slug;

                // Get chatroom using the public API (more reliable than authenticated endpoint)
                // Retry a few times in case of temporary issues
                let chatroomResult = null;
                let retryCount = 0;
                const maxRetries = 3;

                while (!chatroomResult && retryCount < maxRetries) {
                    try {
                        chatroomResult =
                            await kickClient.findChatroom(username);
                        if (chatroomResult) break;
                    } catch (error) {
                        logError(
                            error,
                            `kickAuthServer:findChatroom:attempt${
                                retryCount + 1
                            }`
                        );
                    }

                    retryCount++;
                    if (retryCount < maxRetries) {
                        logDebug(
                            `Retrying chatroom lookup for ${username} (attempt ${
                                retryCount + 1
                            }/${maxRetries})`
                        );
                        await new Promise((resolve) =>
                            setTimeout(resolve, 1000)
                        ); // Wait 1 second before retry
                    }
                }

                if (!chatroomResult) {
                    throw new Error(
                        `Failed to find chatroom for user '${username}' after ${maxRetries} attempts. Please ensure the channel exists and is accessible.`
                    );
                }

                Config.set({
                    userId: channels[0].broadcaster_user_id.toString(),
                    username: username,
                    chatroomId: chatroomResult.chatroomId,
                });

                logInfo(
                    "Kick user/channel/chatroom set",
                    redactSecrets({
                        userId: channels[0].broadcaster_user_id,
                        username,
                        chatroomId: chatroomResult.chatroomId,
                    })
                );

                res.send(
                    "✅ Kick authentication successful! You can close this window."
                );
                sendToWindowIfAlive(window, "kick:authenticated", {
                    username,
                });
                // Emit auth completion to main process
                ipcMain.emit("kick:authComplete");
                listenToChat(window);
                // Don't resolve here - server startup Promise already resolved
            } catch (error) {
                logError(error, "kickAuthServer:startKickAuthServer");

                // Send more specific error messages to the user
                let errorMessage = "❌ Kick authentication failed.";
                if (error instanceof Error) {
                    if (error.message.includes("chatroom")) {
                        errorMessage =
                            "❌ Authentication failed: Could not access channel chatroom. Please ensure your channel exists and is set up properly.";
                    } else if (error.message.includes("channels")) {
                        errorMessage =
                            "❌ Authentication failed: No channels found for your account.";
                    } else if (error.message.includes("tokens")) {
                        errorMessage =
                            "❌ Authentication failed: Could not obtain access tokens.";
                    }
                }

                res.status(500).send(errorMessage);
                sendToWindowIfAlive(window, "kick:authenticationFailed");
                // Emit auth completion to main process even on failure
                ipcMain.emit("kick:authComplete");
                // Don't resolve here - server startup Promise already resolved
            } finally {
                if (serverInstance) {
                    serverInstance.close();
                    serverInstance = null;
                }
                serverStarting = false;
            }
        });

        try {
            serverInstance = app.listen(port, () => {
                logInfo(`Kick Auth server running at http://localhost:${port}`);
                serverStarting = false; // Server is now running
                resolve(); // Resolve immediately when server starts, not when auth completes
            });

            serverInstance.on("error", (error: any) => {
                logError(error, "kickAuthServer:serverError");
                serverStarting = false;
                serverInstance = null;
                reject(error);
            });
        } catch (error) {
            logError(error, "kickAuthServer:serverStartup");
            serverStarting = false;
            serverInstance = null;
            reject(error);
        }
    });
}

export function openKickAuthUrl() {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const scopes = "chat:write user:read channel:read";

    Config.set({ codeVerifier });

    const kickClientId = Config.get("kickClientId");
    const state = Math.random().toString(36).slice(2);

    const url =
        `https://id.kick.com/oauth/authorize?` +
        `response_type=code` +
        `&client_id=${kickClientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&state=${state}` +
        `&code_challenge=${codeChallenge}` +
        `&code_challenge_method=S256`;

    shell.openExternal(url);
}

export function stopKickAuthServer(): void {
    if (serverInstance) {
        logInfo("Stopping Kick auth server");
        serverInstance.close();
        serverInstance = null;
    }
    serverStarting = false;
}

// All legacy Config.getKick, Config.setKick, Config.getSecrets usages removed. All config is now flat and type-safe.
