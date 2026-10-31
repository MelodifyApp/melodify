import express from "express";
import { BrowserWindow, shell, ipcMain } from "electron";
import {
    generateCodeChallenge,
    generateCodeVerifier,
} from "@/shared/utils/pkce";
import type { Server } from "http";
import Config from "@/core/config";
import { listenToChat } from "@/features/twitch/chat/listener";
import { logInfo, logError, logDebug } from "@/core/logging";
import { redactSecrets } from "@/core/logging/utils";
import { twitchClient } from "@/features/twitch/api/client";
import { TWITCH_REDIRECT_URI } from "@/shared/constants";
import { sendToWindowIfAlive } from "@/shared/utils/windowSend";
import { loopbackHostForRedirect } from "@/shared/utils/loopbackHost";
import { oauthFlows } from "@/shared/utils/oauthFlowStore";

const port = 8890;

let serverInstance: Server | null = null;
let serverStarting = false;
let authGeneration = 0;

export async function startTwitchAuthServer(
    window: BrowserWindow
): Promise<void> {
    logDebug(
        "startTwitchAuthServer called",
        redactSecrets({ window: !!window })
    );

    // Prevent multiple server starts
    if (serverInstance || serverStarting) {
        logDebug("Auth server already running or starting, skipping");
        return;
    }

    serverStarting = true;
    authGeneration += 1;
    oauthFlows.cancel("twitch");

    const app = express();

    return new Promise((resolve, reject) => {
        app.get("/callback", async (req, res) => {
            const flow = oauthFlows.take("twitch", req.query.state);
            if (flow === "missing" || flow === "mismatch" || flow === "expired") {
                logError(
                    `Twitch auth callback rejected: OAuth flow ${flow}`,
                    "twitchAuthServer:callback"
                );
                res.status(400).send(
                    "❌ Authentication failed: invalid or expired OAuth state"
                );
                return;
            }

            const code = req.query.code as string | undefined;
            const generation = authGeneration;
            const scope = req.query.scope as string | undefined;
            logDebug(
                "Twitch auth callback hit",
                { hasCode: !!code, scope }
            );

            if (!code) {
                const errorMsg = "Missing code parameter in callback";
                logError(errorMsg, "twitchAuthServer:callback");
                res.status(400).send(
                    "❌ Authentication failed: Missing authorization code"
                );
                sendToWindowIfAlive(window, "twitch:authenticationFailed");
                // Emit auth completion to main process even on failure
                ipcMain.emit("twitch:authComplete");

                // Clean up server state
                if (serverInstance) {
                    serverInstance.close();
                    serverInstance = null;
                }
                serverStarting = false;
                return;
            }

            try {
                const clientId = Config.get("twitchClientId");
                const clientSecret = Config.get("twitchClientSecret");
                const codeVerifier = flow.flow.codeVerifier;

                if (!clientId || !clientSecret) {
                    throw new Error("Missing Twitch client ID or secret");
                }

                if (!codeVerifier) {
                    throw new Error("Missing code verifier");
                }

                // Exchange code for tokens
                const tokenResponse = await fetch(
                    "https://id.twitch.tv/oauth2/token",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            client_id: clientId,
                            client_secret: clientSecret,
                            code: code,
                            grant_type: "authorization_code",
                            redirect_uri: TWITCH_REDIRECT_URI,
                            code_verifier: codeVerifier,
                        }),
                    }
                );

                if (!tokenResponse.ok) {
                    const errorData = await tokenResponse.json();
                    throw new Error(
                        `Token exchange failed: ${JSON.stringify(errorData)}`
                    );
                }

                const tokenData = await tokenResponse.json();

                const accessToken = tokenData.access_token;
                const refreshToken = tokenData.refresh_token;
                const expiresIn = tokenData.expires_in;

                if (!accessToken) {
                    throw new Error("No access token in response");
                }

                const expiresAt = Date.now() + expiresIn * 1000;

                if (generation !== authGeneration) {
                    res.status(409).send("Authentication cancelled");
                    return;
                }

                logInfo("Twitch tokens obtained successfully");

                // Get authenticated user info
                const userResponse = await fetch(
                    "https://api.twitch.tv/helix/users",
                    {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            "Client-Id": clientId,
                        },
                    }
                );

                if (!userResponse.ok) {
                    throw new Error("Failed to get user info from Twitch API");
                }

                const userData = await userResponse.json();
                if (!userData.data || userData.data.length === 0) {
                    throw new Error("No user data returned from Twitch API");
                }

                if (generation !== authGeneration) {
                    res.status(409).send("Authentication cancelled");
                    return;
                }

                // Persist only after the user fetch; a logout during either
                // request must not restore the session.
                twitchClient.updateTokens({
                    accessToken,
                    refreshToken: refreshToken || null,
                    expiresAt,
                });

                const user = userData.data[0];
                const botUserId = user.id;
                const twitchUsername = user.login;

                // The authenticated account is the broadcaster for this login.
                // Never reuse a previous account's stale broadcaster identity.
                const broadcasterUserId = botUserId;

                Config.set({
                    twitchBotUserId: botUserId,
                    twitchUserId: broadcasterUserId,
                    twitchUsername: twitchUsername,
                });

                logInfo(
                    "Twitch user/bot info set",
                    redactSecrets({
                        botUserId,
                        broadcasterUserId,
                        twitchUsername,
                    })
                );

                res.send(
                    "✅ Twitch authentication successful! You can close this window."
                );
                sendToWindowIfAlive(window, "twitch:authenticated", {
                    twitchUsername,
                });
                // Emit auth completion to main process
                ipcMain.emit("twitch:authComplete");
                listenToChat(window, true);
                // Don't resolve here - server startup Promise already resolved
            } catch (error) {
                logError(error, "twitchAuthServer:callback");

                // Send more specific error messages to the user
                let errorMessage = "❌ Twitch authentication failed.";
                if (error instanceof Error) {
                    if (error.message.includes("token")) {
                        errorMessage =
                            "❌ Authentication failed: Could not obtain or validate access tokens.";
                    } else if (error.message.includes("user")) {
                        errorMessage =
                            "❌ Authentication failed: Could not retrieve user information.";
                    } else if (error.message.includes("verifier")) {
                        errorMessage =
                            "❌ Authentication failed: Missing or invalid code verifier.";
                    }
                }

                res.status(500).send(errorMessage);
                sendToWindowIfAlive(window, "twitch:authenticationFailed");
                // Emit auth completion to main process even on failure
                ipcMain.emit("twitch:authComplete");
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
            serverInstance = app.listen(port, loopbackHostForRedirect(TWITCH_REDIRECT_URI), () => {
                logInfo(
                    `Twitch Auth server running at http://localhost:${port}`
                );
                serverStarting = false; // Server is now running
                resolve(); // Resolve immediately when server starts, not when auth completes
            });

            serverInstance.on("error", (error: any) => {
                logError(error, "twitchAuthServer:serverError");
                serverStarting = false;
                serverInstance = null;
                reject(error);
            });
        } catch (error) {
            logError(error, "twitchAuthServer:serverStartup");
            serverStarting = false;
            serverInstance = null;
            reject(error);
        }
    });
}

export function openTwitchAuthUrl() {
    const codeVerifier = generateCodeVerifier();
    const flow = oauthFlows.begin("twitch", { codeVerifier });
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const scopes =
        "user:bot user:read:chat user:write:chat channel:read:subscriptions channel:read:redemptions";

    const twitchClientId = Config.get("twitchClientId");
    const state = flow.state;

    const url =
        `https://id.twitch.tv/oauth2/authorize?` +
        `response_type=code` +
        `&client_id=${twitchClientId}` +
        `&redirect_uri=${encodeURIComponent(TWITCH_REDIRECT_URI)}` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&state=${state}` +
        `&code_challenge=${codeChallenge}` +
        `&code_challenge_method=S256`;

    shell.openExternal(url);
}

export function stopTwitchAuthServer(): void {
    oauthFlows.cancel("twitch");
    authGeneration += 1;
    if (serverInstance) {
        logInfo("Stopping Twitch auth server");
        serverInstance.close();
        serverInstance = null;
    }
    serverStarting = false;
}
