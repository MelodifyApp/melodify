import { randomUUID } from "node:crypto";
import { BrowserWindow } from "electron";
import { saveTokens, getSpotifyApi } from "@/features/spotify/playback/player";
import express from "express";
import { Server } from "http";
import { logInfo, logError, logWarn, logDebug } from "@/core/logging";
import { redactSecrets } from "@/core/logging/utils";
import { sendToWindowIfAlive } from "@/shared/utils/windowSend";

const port = 8888;
let authServer: Server | null = null;
let authStarting = false;
let expectedOAuthState: string | null = null;

function closeSpotifyAuthServer(): void {
    expectedOAuthState = null;
    authStarting = false;
    const server = authServer;
    authServer = null;
    if (server) {
        server.close();
    }
}

/** Stop a pending OAuth callback server (e.g. on logout). */
export function stopSpotifyAuthServer(): void {
    closeSpotifyAuthServer();
}

/**
 * Start the Spotify OAuth callback server and return the state that the
 * authorization request must include. Returns null when one is already active.
 */
export function startSpotifyAuthServer(window: BrowserWindow): string | null {
    logDebug(
        "startSpotifyAuthServer called",
        redactSecrets({ window: !!window })
    );

    if (authServer || authStarting) {
        logDebug("Spotify auth server already running or starting, skipping");
        return null;
    }

    authStarting = true;
    expectedOAuthState = randomUUID();
    const state = expectedOAuthState;
    const app = express();

    app.get("/callback", async (req, res) => {
        const expected = expectedOAuthState;
        expectedOAuthState = null;
        if (!expected || req.query.state !== expected) {
            logWarn(
                "Spotify auth callback rejected: OAuth state mismatch",
                "spotifyAuthServer"
            );
            res.status(400).send("Invalid OAuth state");
            closeSpotifyAuthServer();
            return;
        }

        const code = req.query.code as string | undefined;
        logDebug("Spotify auth callback hit", { hasCode: !!code });
        if (!code) {
            res.status(400).send("Missing code");
            closeSpotifyAuthServer();
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
                closeSpotifyAuthServer();
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

            closeSpotifyAuthServer();
        } catch (err) {
            logError(err, "spotifyAuthServer:startSpotifyAuthServer");
            res.status(500).send("Spotify authentication failed.");
            closeSpotifyAuthServer();
        }
    });

    authServer = app.listen(port, () => {
        authStarting = false;
        logInfo(`Spotify Auth server running at http://localhost:${port}`);

        // Auto-close the server after 5 minutes to prevent it from running indefinitely
        const serverReference = authServer;
        setTimeout(
            () => {
                if (authServer === serverReference) {
                    logInfo("Spotify Auth server timed out, closing");
                    closeSpotifyAuthServer();
                }
            },
            5 * 60 * 1000
        ); // 5 minutes
    });

    authServer.on("error", (error) => {
        logError(error, "spotifyAuthServer:serverError");
        authServer = null;
        authStarting = false;
        expectedOAuthState = null;
    });

    authServer.on("close", () => {
        logInfo("Spotify Auth server closed");
    });

    return state;
}
