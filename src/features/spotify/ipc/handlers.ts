import { ipcMain, BrowserWindow, shell } from "electron";
import psList from "ps-list";
import Config from "@/core/config";
import {
    getSpotifyApi,
    updateSpotifyClientCredentials,
    checkSpotifyAccessToken,
    startSpotifyTokenRefreshInterval,
    stopSpotifyTokenAutoRefresh,
    startSongFileSaving,
} from "@/features/spotify/playback/player";
import { startSpotifyAuthServer, stopSpotifyAuthServer } from "@/features/spotify/auth/server";
import { exec } from "child_process";
import { promisify } from "util";
import { logInfo, logError, logDebug } from "@/core/logging";
import { redactSecrets } from "@/core/logging/utils";
import { verifyAppCredentials } from "../../../shared/utils/credentialVerification";

const execAsync = promisify(exec);

ipcMain.on("spotify:auth", async (event) => {
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

    try {
        // Do not open the browser until listen() has bound the callback port.
        const state = await startSpotifyAuthServer(window);
        if (!state) {
            return;
        }

        const authURL = spotifyApi.createAuthorizeURL(scopes, state);
        logDebug("Opening Spotify auth URL", redactSecrets({ authURL }));
        shell.openExternal(authURL);
    } catch (error) {
        logError(error, "spotify:auth");
    }
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
        if (Config.get("saveCurrentSongToFile")) {
            startSongFileSaving();
        }
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

function readSpotifyCredentialPair(secrets: unknown): {
    clientId: string;
    clientSecret: string;
} {
    const record =
        secrets && typeof secrets === "object" && !Array.isArray(secrets)
            ? (secrets as Record<string, unknown>)
            : null;
    const clientId =
        typeof record?.spotifyClientId === "string"
            ? record.spotifyClientId.trim()
            : "";
    const suppliedSecret =
        typeof record?.spotifyClientSecret === "string"
            ? record.spotifyClientSecret.trim()
            : "";
    const storedId = String(Config.get("spotifyClientId") || "").trim();
    const storedSecret = String(Config.get("spotifyClientSecret") || "").trim();
    return {
        clientId,
        clientSecret:
            suppliedSecret ||
            (clientId && clientId === storedId ? storedSecret : ""),
    };
}

ipcMain.handle("spotify:verifySecrets", async (_event, secrets) => {
    const { clientId, clientSecret } = readSpotifyCredentialPair(secrets);
    if (!clientId || !clientSecret) {
        return { success: false, code: "missing_credentials" };
    }
    return verifyAppCredentials("spotify", { clientId, clientSecret });
});

ipcMain.handle("spotify:setSecrets", async (_event, secrets) => {
    const { clientId, clientSecret } = readSpotifyCredentialPair(secrets);
    if (!clientId || !clientSecret) {
        return { success: false, code: "missing_credentials" };
    }
    // Verify once more before writing. Only stable failure codes are returned:
    // never the service response, a token, or the supplied credentials.
    const verification = await verifyAppCredentials("spotify", {
        clientId,
        clientSecret,
    });
    if (!verification.success) {
        return verification;
    }
    // Persist credentials and discard the singleton that may still hold the
    // previous client ID/secret before OAuth starts.
    updateSpotifyClientCredentials(clientId, clientSecret);
    return { success: true };
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
    } catch {
        // A provider/network failure is not proof that no device is active.
        // Return null so callers can show unavailable instead of a false
        // negative or a stale ready state.
        return null;
    }
});
