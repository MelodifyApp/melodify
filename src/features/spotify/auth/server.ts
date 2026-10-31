import { randomUUID } from "node:crypto";
import { BrowserWindow } from "electron";
import { saveTokens, getSpotifyApi } from "@/features/spotify/playback/player";
import express from "express";
import { Server } from "http";
import { logInfo, logError, logWarn, logDebug } from "@/core/logging";
import { redactSecrets } from "@/core/logging/utils";
import { sendToWindowIfAlive } from "@/shared/utils/windowSend";
import { loopbackHostForRedirect } from "@/shared/utils/loopbackHost";
import { SPOTIFY_REDIRECT_URI } from "@/shared/constants";

const port = 8888;
export const SPOTIFY_AUTH_TIMEOUT_MS = 5 * 60 * 1000;

export type SpotifyAuthStatus =
    | "idle"
    | "starting"
    | "pending"
    | "success"
    | "cancelled"
    | "timeout"
    | "bind-error"
    | "failed";

export interface SpotifyAuthState {
    state: SpotifyAuthStatus;
    reason: string | null;
    canRetry: boolean;
}

let authServer: Server | null = null;
let authStarting = false;
let expectedOAuthState: string | null = null;
let authGeneration = 0;
let authTimer: NodeJS.Timeout | null = null;
let activeWindow: BrowserWindow | null = null;
let authState: SpotifyAuthState = {
    state: "idle",
    reason: null,
    canRetry: true,
};

export function getSpotifyAuthState(): SpotifyAuthState {
    return { ...authState };
}

function publishAuthState(
    state: SpotifyAuthStatus,
    reason: string | null = null
): void {
    authState = {
        state,
        reason,
        canRetry:
            state === "cancelled" ||
            state === "timeout" ||
            state === "bind-error" ||
            state === "failed",
    };
    sendToWindowIfAlive(activeWindow, "spotify:authState", {
        ...authState,
    });
}

function clearAuthTimer(): void {
    if (!authTimer) return;
    clearTimeout(authTimer);
    authTimer = null;
}

function closeSpotifyAuthServer(
    nextState?: SpotifyAuthStatus,
    reason: string | null = null
): void {
    expectedOAuthState = null;
    authStarting = false;
    authGeneration += 1;
    clearAuthTimer();
    const server = authServer;
    authServer = null;
    if (server) {
        server.close();
    }
    if (nextState) publishAuthState(nextState, reason);
    activeWindow = null;
}

/** Stop a pending OAuth callback server (e.g. on logout or user cancel). */
export function stopSpotifyAuthServer(): void {
    closeSpotifyAuthServer("cancelled", "cancelled");
}

/**
 * Start the Spotify OAuth callback server and resolve only after the listener
 * is actually bound. Bind failures reject with a retryable local error state.
 */
export async function startSpotifyAuthServer(
    window: BrowserWindow
): Promise<string | null> {
    logDebug(
        "startSpotifyAuthServer called",
        redactSecrets({ window: !!window })
    );

    if (authServer || authStarting) {
        logDebug("Spotify auth server already running or starting, skipping");
        return null;
    }

    authStarting = true;
    authGeneration += 1;
    expectedOAuthState = randomUUID();
    activeWindow = window;
    publishAuthState("starting");
    const state = expectedOAuthState;
    const app = express();

    app.get("/callback", async (req, res) => {
        const expected = expectedOAuthState;
        if (!expected || req.query.state !== expected) {
            // Do not consume or close the valid pending flow for an invalid
            // callback. It may be an attacker or a stale browser tab.
            logWarn(
                "Spotify auth callback rejected: OAuth state mismatch",
                "spotifyAuthServer"
            );
            res.status(400).send("Invalid OAuth state");
            return;
        }
        expectedOAuthState = null;

        const generation = authGeneration;
        if (req.query.error === "access_denied") {
            logInfo("Spotify authentication cancelled by user");
            res.status(400).send("Authentication cancelled");
            closeSpotifyAuthServer("cancelled", "access-denied");
            return;
        }
        if (req.query.error) {
            logWarn(
                "Spotify authentication returned an OAuth error",
                "spotifyAuthServer"
            );
            res.status(400).send("Authentication failed");
            closeSpotifyAuthServer("failed", "oauth-error");
            return;
        }

        const code = req.query.code as string | undefined;
        logDebug("Spotify auth callback hit", { hasCode: !!code });
        if (!code) {
            res.status(400).send("Missing code");
            closeSpotifyAuthServer("failed", "missing-code");
            return;
        }

        try {
            const spotifyApi = getSpotifyApi();

            if (!spotifyApi) {
                sendToWindowIfAlive(window, "toast", {
                    type: "error",
                    message: "Spotify API not initialized. Please try again.",
                });
                res.status(500).send("Spotify API not initialized.");
                closeSpotifyAuthServer("failed", "api-unavailable");
                return;
            }

            const data = await spotifyApi.authorizationCodeGrant(code);
            const { access_token, refresh_token, expires_in } = data.body;
            logDebug(
                "Spotify token grant response",
                redactSecrets({
                    access_token: !!access_token,
                    refresh_token: !!refresh_token,
                    expires_in,
                })
            );

            spotifyApi.setAccessToken(access_token);
            spotifyApi.setRefreshToken(refresh_token);
            const user = await spotifyApi.getMe();

            if (!user || !user.body || !user.body.display_name) {
                throw new Error("Failed to get user information from Spotify");
            }

            if (generation !== authGeneration) {
                // Logout during the grant/getMe exchange wins: drop the
                // in-memory token and never persist the stale session.
                spotifyApi.setAccessToken("");
                spotifyApi.setRefreshToken("");
                res.status(409).send("Authentication cancelled");
                closeSpotifyAuthServer("cancelled", "superseded");
                return;
            }

            saveTokens({
                accessToken: access_token,
                refreshToken: refresh_token,
                expiresIn: expires_in,
            });

            res.send(
                "Spotify authentication successful! You can close this window."
            );
            logInfo(
                "Spotify authenticated",
                redactSecrets({ username: user.body.display_name })
            );

            // Send IPC message back to frontend
            if (
                !sendToWindowIfAlive(window, "spotify:authenticated", {
                    username: user.body.display_name,
                })
            ) {
                logWarn(
                    "Window is destroyed or invalid, cannot send authentication event",
                    "spotifyAuthServer"
                );
            }

            closeSpotifyAuthServer("success");
        } catch (err) {
            logError(err, "spotifyAuthServer:startSpotifyAuthServer");
            res.status(500).send("Spotify authentication failed.");
            closeSpotifyAuthServer("failed", "exchange-failed");
        }
    });

    return new Promise((resolve, reject) => {
        let settled = false;
        let server: Server;
        try {
            server = app.listen(
                port,
                loopbackHostForRedirect(SPOTIFY_REDIRECT_URI),
                () => {
                    authStarting = false;
                    publishAuthState("pending");
                    logInfo(
                        `Spotify Auth server running at http://localhost:${port}`
                    );
                    authTimer = setTimeout(() => {
                        if (authServer === server) {
                            logInfo("Spotify Auth server timed out, closing");
                            closeSpotifyAuthServer("timeout", "timeout");
                        }
                    }, SPOTIFY_AUTH_TIMEOUT_MS);
                    (authTimer as { unref?: () => void }).unref?.();
                    if (!settled) {
                        settled = true;
                        resolve(state);
                    }
                }
            );
            authServer = server;
        } catch (error) {
            authStarting = false;
            authServer = null;
            expectedOAuthState = null;
            publishAuthState("bind-error", "bind-failed");
            activeWindow = null;
            reject(error);
            return;
        }

        server.on("error", (error) => {
            logError(error, "spotifyAuthServer:serverError");
            const wasStarting = authStarting;
            authStarting = false;
            if (authServer === server) authServer = null;
            expectedOAuthState = null;
            clearAuthTimer();
            publishAuthState("bind-error", "bind-failed");
            activeWindow = null;
            if (!settled) {
                settled = true;
                reject(error);
            } else if (wasStarting) {
                logWarn(
                    "Spotify auth listener failed before it became ready",
                    "spotifyAuthServer"
                );
            }
        });

        server.on("close", () => {
            logInfo("Spotify Auth server closed");
        });
    });
}
