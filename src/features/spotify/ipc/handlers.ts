import { ipcMain, BrowserWindow, shell } from "electron";
import psList from "ps-list";
import Config from "@/core/config";
import {
    getSpotifyApi,
    updateSpotifyClientCredentials,
    checkSpotifyAccessToken,
    startSpotifyTokenRefreshInterval,
    stopSpotifyTokenAutoRefresh,
} from "@/features/spotify/playback/player";
import { startSpotifyAuthServer, stopSpotifyAuthServer } from "@/features/spotify/auth/server";
import { exec } from "child_process";
import { promisify } from "util";
import { logInfo, logError, logDebug } from "@/core/logging";
import { redactSecrets } from "@/core/logging/utils";

const execAsync = promisify(exec);

ipcMain.on("spotify:auth", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    logDebug("IPC spotify:auth", redactSecrets({ sender: !!event.sender }));
    if (!window) {
        return;
    }

    const scopes = [
        "user-read-playback-state",
        "user-modify-playback-state",
        "user-read-currently-playing",
        "user-read-private",
    ];

    const spotifyApi = getSpotifyApi();
    if (!spotifyApi) {
        return;
    }

    const state = startSpotifyAuthServer(window);
    if (!state) {
        return;
    }

    const authURL = spotifyApi.createAuthorizeURL(scopes, state);
    logDebug("Opening Spotify auth URL", redactSecrets({ authURL }));
    shell.openExternal(authURL);
});

ipcMain.handle("spotify:getUserData", async () => {
    try {
        const spotifyApi = getSpotifyApi();
        const me = await spotifyApi.getMe();
        logDebug("spotify:getUserData result", redactSecrets(me.body));
        return me.body;
    } catch (err) {
        logError(err, "spotify:getUserData");
        return null;
    }
});

ipcMain.handle("spotify:checkAuth", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const accessToken = Config.get("spotifyAccessToken");
    const refreshToken = Config.get("spotifyRefreshToken");
    logDebug(
        "spotify:checkAuth called",
        redactSecrets({
            hasAccessToken: !!accessToken,
            hasRefreshToken: !!refreshToken,
        })
    );
    if (!accessToken || !refreshToken) {
        stopSpotifyTokenAutoRefresh();
        return { authenticated: false };
    }
    const refreshed = await checkSpotifyAccessToken();
    if (!refreshed) {
        stopSpotifyTokenAutoRefresh();
        return { authenticated: false };
    }
    try {
        const spotifyApi = getSpotifyApi();
        const me = await spotifyApi.getMe();
        startSpotifyTokenRefreshInterval(window);
        logDebug(
            "spotify:checkAuth success",
            redactSecrets({ username: me.body.display_name })
        );
        return { authenticated: true, username: me.body.display_name };
    } catch (err) {
        logError(err, "spotify:checkAuth");
        return { authenticated: false };
    }
});

ipcMain.on("spotify:logout", () => {
    stopSpotifyAuthServer();
    stopSpotifyTokenAutoRefresh();
    const spotifyApi = getSpotifyApi();
    Config.set({
        spotifyAccessToken: undefined,
        spotifyRefreshToken: undefined,
        spotifyExpiresAt: undefined,
    });
    spotifyApi.setAccessToken("");
    spotifyApi.setRefreshToken("");
    logInfo("spotify:logout called");
});

ipcMain.handle("spotify:isRunning", async () => {
    try {
        const processes = await psList();
        return processes.some((proc) =>
            proc.name.toLowerCase().includes("spotify")
        );
    } catch (err) {
        console.warn("ps-list failed, falling back to tasklist:", err);
        try {
            const { stdout } = await execAsync("tasklist");
            return stdout.toLowerCase().includes("spotify.exe");
        } catch (execErr) {
            console.error("tasklist also failed:", execErr);
            return false;
        }
    }
});

ipcMain.handle("spotify:hasSecrets", () => {
    const spotifyClientId = Config.get("spotifyClientId");
    const spotifyClientSecret = Config.get("spotifyClientSecret");
    return !!spotifyClientId && !!spotifyClientSecret;
});

ipcMain.handle("spotify:setSecrets", async (event, secrets) => {
    const record =
        secrets && typeof secrets === "object" && !Array.isArray(secrets)
            ? (secrets as Record<string, unknown>)
            : null;
    const spotifyClientId =
        typeof record?.spotifyClientId === "string"
            ? record.spotifyClientId.trim()
            : "";
    const spotifyClientSecret =
        typeof record?.spotifyClientSecret === "string"
            ? record.spotifyClientSecret.trim()
            : "";
    if (!spotifyClientId || !spotifyClientSecret) {
        return { success: false, error: "Missing client ID or secret." };
    }
    // Try to get a token using Client Credentials Flow to validate the credentials
    const tokenUrl = "https://accounts.spotify.com/api/token";
    const params = new URLSearchParams();
    params.append("grant_type", "client_credentials");
    try {
        const response = await fetch(tokenUrl, {
            method: "POST",
            headers: {
                Authorization:
                    "Basic " +
                    Buffer.from(
                        `${spotifyClientId}:${spotifyClientSecret}`
                    ).toString("base64"),
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
        });
        const data = await response.json();
        if (!response.ok) {
            return { success: false, error: "Invalid client ID or secret." };
        }
        // Save secrets if valid
        // Persist credentials and discard the singleton that may still hold
        // the previous client ID/secret before OAuth starts.
        updateSpotifyClientCredentials(spotifyClientId, spotifyClientSecret);
        return { success: true };
    } catch (err) {
        return { success: false, error: "Failed to validate credentials." };
    }
});

ipcMain.handle("spotify:hasSession", async () => {
    try {
        const spotifyApi = getSpotifyApi();
        if (!spotifyApi) return false;

        const devices = await spotifyApi.getMyDevices();
        const hasActiveDevice = devices.body.devices.some(
            (device: any) => device.is_active
        );
        return hasActiveDevice;
    } catch (error) {
        // Silently return false for API errors to avoid log spam
        return false;
    }
});
