import { BrowserWindow } from "electron";
import { saveTokens, getSpotifyApi } from "@/features/spotify/playback/player";
import express from "express";
import { Server } from "http";
import { logInfo, logError, logWarn, logDebug } from "@/core/logging";
import { redactSecrets } from "@/core/logging/utils";
import { sendToWindowIfAlive } from "@/shared/utils/windowSend";

// Make startSpotifyAuthServer accept window or webContents to send events back to frontend
export function startSpotifyAuthServer(window: BrowserWindow) {
    logDebug(
        "startSpotifyAuthServer called",
        redactSecrets({ window: !!window })
    );
    const app = express();
    const port = 8888;

    let authServer: Server | null = null;

    app.get("/callback", async (req, res) => {
        const code = req.query.code as string | undefined;
        logDebug("Spotify auth callback hit", { hasCode: !!code });
        if (!code) {
            res.status(400).send("Missing code");
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

            // Close the server after successful authentication
            if (authServer) {
                authServer.close();
            }
        } catch (err) {
            logError(err, "spotifyAuthServer:startSpotifyAuthServer");
            res.status(500).send("Spotify authentication failed.");

            // Close the server on error as well
            if (authServer) {
                authServer.close();
            }
        }
    });

    authServer = app.listen(port, () => {
        logInfo(`Spotify Auth server running at http://localhost:${port}`);

        // Auto-close the server after 5 minutes to prevent it from running indefinitely
        setTimeout(
            () => {
                if (authServer) {
                    logInfo("Spotify Auth server timed out, closing");
                    authServer.close();
                }
            },
            5 * 60 * 1000
        ); // 5 minutes
    });

    authServer.on("close", () => {
        logInfo("Spotify Auth server closed");
    });
}
