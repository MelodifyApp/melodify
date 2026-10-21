/**
 * Spotify Playback Management System
 *
 * This module provides comprehensive Spotify Web API integration with advanced
 * features for music streaming applications. It handles authentication, token
 * management, real-time playback monitoring, and automated file saving.
 *
 * Key Features:
 * - OAuth 2.0 token lifecycle management with automatic refresh
 * - Real-time current playing track monitoring
 * - Automatic song information file saving for OBS/streaming integration
 * - Rate limiting and error handling for API calls
 * - Configurable polling intervals and file update strategies
 * - Comprehensive logging for debugging authentication and playback issues
 *
 * Architecture:
 * - SpotifyWebApi: Third-party library for Spotify Web API communication
 * - Token Management: Automatic refresh before expiration
 * - File Saving: Configurable output for external applications (OBS, etc.)
 * - Error Recovery: Graceful handling of network issues and API limits
 */

import SpotifyWebApi from "spotify-web-api-node";
import Config from "@/core/config";
import { logError, logInfo, logWarn, logDebug } from "@/core/logging";
import { redactSecrets } from "@/core/logging/utils";
import fs from "fs";
import path from "path";

// Global state management for Spotify integration
let spotifyApi: SpotifyWebApi | null = null;
let refreshSpotifyTokenInterval: NodeJS.Timeout | null = null;
let saveSongInterval: NodeJS.Timeout | null = null;
let nextSaveTimeout: NodeJS.Timeout | null = null;
const songFileSavingEnabled = true;
let lastSavedSong: { title: string; artist: string } | null = null;
let songFileSavingInterval: NodeJS.Timeout | null = null;
let tokenGeneration = 0;
let refreshInFlight: Promise<boolean> | null = null;

/** Rebuild the API client after Spotify credentials change in Settings. */
export function resetSpotifyApi(): void {
    // Credential changes supersede any refresh that started with the old pair.
    tokenGeneration += 1;
    refreshInFlight = null;
    spotifyApi = null;
}

/** Persist new Spotify app credentials and invalidate any client built with the previous pair. */
export function updateSpotifyClientCredentials(
    spotifyClientId: string,
    spotifyClientSecret: string
): void {
    Config.set({ spotifyClientId, spotifyClientSecret });
    resetSpotifyApi();
}

/**
 * Spotify API Client Factory
 * Creates and configures a Spotify Web API client with credentials from configuration
 * Implements singleton pattern to avoid multiple API instances
 *
 * @returns Configured SpotifyWebApi instance or null if credentials missing
 */
export function getSpotifyApi(): SpotifyWebApi | null {
    if (spotifyApi) return spotifyApi;

    const spotifyClientId = Config.get("spotifyClientId");
    const spotifyClientSecret = Config.get("spotifyClientSecret");

    if (!spotifyClientId || !spotifyClientSecret) {
        return null;
    }

    // Initialize API client with configuration values
    spotifyApi = new SpotifyWebApi({
        clientId: spotifyClientId,
        clientSecret: spotifyClientSecret,
        redirectUri:
            Config.get("spotifyRedirectUri") ||
            "http://127.0.0.1:8888/callback", // Default fallback for development
    });

    // Apply stored authentication tokens if available
    const accessToken = Config.get("spotifyAccessToken");
    const refreshToken = Config.get("spotifyRefreshToken");
    if (accessToken) spotifyApi.setAccessToken(accessToken);
    if (refreshToken) spotifyApi.setRefreshToken(refreshToken);

    return spotifyApi;
}

/**
 * Token Restoration System
 * Loads previously stored authentication tokens from configuration
 * Validates token expiration and prepares API client for immediate use
 *
 * @returns Token data object or null if no valid tokens stored
 */
export function loadTokens() {
    const accessToken = Config.get("spotifyAccessToken");
    const expiresAt = Config.get("spotifyExpiresAt");
    const refreshToken = Config.get("spotifyRefreshToken");

    if (accessToken && refreshToken && expiresAt) {
        const api = getSpotifyApi();
        if (api) {
            api.setAccessToken(accessToken);
            api.setRefreshToken(refreshToken);
        }
        return { accessToken, refreshToken, expiresAt };
    }
    return null;
}

/**
 * Token Persistence System
 * Saves new authentication tokens to configuration and updates API client
 * Logs token save events and handles potential errors
 *
 * @param accessToken New access token
 * @param refreshToken New refresh token
 * @param expiresIn Expiration time in seconds
 */
export function saveTokens({
    accessToken,
    refreshToken,
    expiresIn,
}: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}) {
    // Any explicit token save (OAuth login, reconnect) supersedes refreshes
    // that started earlier and could otherwise overwrite the newer session.
    tokenGeneration += 1;
    const expiresAt = Date.now() + expiresIn * 1000;
    Config.set({
        spotifyAccessToken: accessToken,
        spotifyRefreshToken: refreshToken,
        spotifyExpiresAt: expiresAt,
    });
    const api = getSpotifyApi();
    if (api) {
        api.setAccessToken(accessToken);
        api.setRefreshToken(refreshToken);
    }
    logInfo("Spotify tokens saved", { expiresAt });
}

/**
 * Access Token Refresh System
 * Obtains a new access token using the refresh token
 * Updates the API client and persists the new token
 *
 * @returns True if the access token was successfully refreshed, false otherwise
 */
export async function refreshSpotifyAccessToken(): Promise<boolean> {
    // Concurrent token checks share one refresh so a slower response cannot
    // overwrite a newer token pair.
    if (refreshInFlight) return refreshInFlight;
    const generation = tokenGeneration;
    const refresh = performSpotifyRefresh(generation);
    refreshInFlight = refresh;
    try {
        return await refresh;
    } finally {
        if (refreshInFlight === refresh) refreshInFlight = null;
    }
}

async function performSpotifyRefresh(generation: number): Promise<boolean> {
    const tokens = loadTokens();
    if (!tokens) return false;
    try {
        const api = getSpotifyApi();
        if (!api) return false;
        const data = await api.refreshAccessToken();
        // A login, logout or credential change during the request wins.
        if (generation !== tokenGeneration) return false;
        const { access_token, expires_in } = data.body;
        if (
            typeof access_token !== "string" ||
            !access_token ||
            typeof expires_in !== "number" ||
            !Number.isFinite(expires_in) ||
            expires_in <= 0
        ) {
            logError(
                "Spotify token refresh returned invalid token data",
                "spotify:refreshSpotifyAccessToken"
            );
            return false;
        }
        api.setAccessToken(access_token);
        saveTokens({
            accessToken: access_token,
            refreshToken: tokens.refreshToken,
            expiresIn: expires_in,
        });
        logInfo("Spotify access token refreshed");
        return true;
    } catch (error) {
        logError(error, "spotify:refreshSpotifyAccessToken");
        return false;
    }
}

/**
 * Access Token Validation and Refresh
 * Checks if the access token is valid and refreshes it if necessary
 * This function should be called before any API request that requires authentication
 *
 * @param window Optional Electron window object for authentication flows
 * @returns True if the access token is valid (and refreshed if needed), false otherwise
 */
export async function checkSpotifyAccessToken(
    window?: Electron.BrowserWindow
): Promise<boolean> {
    const tokens = loadTokens();
    if (!tokens) return false;
    if (Date.now() >= tokens.expiresAt) {
        return await refreshSpotifyAccessToken();
    }
    return true;
}

/**
 * Song Playback and Queue Management
 * Searches for a song by query, retrieves its details, and adds it to the playback queue
 * Supports direct URI playback and search-based playback
 *
 * @param songQuery The song query or URI
 * @param username The username for playback context (required by Spotify API)
 * @returns The played song's title and artist, or null if not found
 */
export async function playSong(
    songQuery: string,
    username: string
): Promise<{ title: string; artist: string } | null> {
    logDebug("playSong called", redactSecrets({ songQuery, username }));
    const spotifyApi = getSpotifyApi();
    if (!spotifyApi) {
        logError("Spotify API not configured", "spotify:playSong");
        return null;
    }
    let trackUri: string | null = null;
    let track: any = null;
    // Updated regex to handle /intl-xx/ in the URL path and optional query params
    const match = songQuery.match(
        /(?:https?:\/\/open\.spotify\.com\/(?:intl-[a-z]{2,3}\/)?track\/|spotify:track:)([a-zA-Z0-9]+)/
    );
    if (match && match[1]) {
        trackUri = `spotify:track:${match[1]}`;
        try {
            const trackData = await spotifyApi.getTrack(match[1]);
            track = trackData.body;
        } catch (err) {
            logError(err, "spotify:playSong:getTrack");
        }
    } else {
        const tracks = await spotifyApi.searchTracks(songQuery, {
            limit: 1,
        });
        if (!tracks.body.tracks.total) {
            logWarn(
                "No tracks found for query: " + songQuery,
                "spotify:playSong"
            );
            return null;
        }
        track = tracks.body.tracks.items[0];
        trackUri = track.uri;
    }
    if (trackUri && track) {
        logDebug("Adding to queue", redactSecrets({ trackUri, track }));
        try {
            await spotifyApi.addToQueue(trackUri);
        } catch (err) {
            logError(err, "spotify:playSong:addToQueue");
            // A found track is not a successful request until Spotify accepts it.
            return null;
        }

        return {
            title: track.name,
            artist: track.artists.map((a: any) => a.name).join(", "),
        };
    }

    return null;
}

/**
 * Periodic Access Token Refresh
 * Starts an interval that refreshes the Spotify access token periodically
 * Stops the interval if the token cannot be refreshed
 *
 * @param window Electron window object for authentication flows
 */
export async function startSpotifyTokenRefreshInterval(
    window: Electron.BrowserWindow
): Promise<void> {
    if (refreshSpotifyTokenInterval) {
        clearInterval(refreshSpotifyTokenInterval);
    }
    refreshSpotifyTokenInterval = setInterval(async () => {
        try {
            const valid = await checkSpotifyAccessToken(window);
            if (!valid) {
                logWarn(
                    "Failed to refresh Spotify access token",
                    "spotify:startSpotifyTokenRefreshInterval"
                );
                clearInterval(refreshSpotifyTokenInterval!);
                refreshSpotifyTokenInterval = null;
            }
        } catch (err) {
            logError(err, "spotify:startSpotifyTokenRefreshInterval");
        }
    }, 60 * 1000);
}

/**
 * Token and Playback System Shutdown
 * Stops all intervals and timeouts related to Spotify token refreshing and song saving
 * This should be called when the application is closing or Spotify integration is disabled
 */
export function stopSpotifyTokenAutoRefresh() {
    if (refreshSpotifyTokenInterval) {
        clearInterval(refreshSpotifyTokenInterval);
        refreshSpotifyTokenInterval = null;
    }

    // Also stop song saving intervals
    if (saveSongInterval) {
        clearInterval(saveSongInterval);
        saveSongInterval = null;
    }

    if (nextSaveTimeout) {
        clearTimeout(nextSaveTimeout);
        nextSaveTimeout = null;
    }

    if (songFileSavingInterval) {
        clearTimeout(songFileSavingInterval);
        songFileSavingInterval = null;
    }

    logDebug("All Spotify intervals and timeouts cleared", "spotify:stop");
}

// Function to save current song to file
async function saveCurrentSongToFile() {
    if (!songFileSavingEnabled) {
        return;
    }

    try {
        const spotifyApi = getSpotifyApi();
        if (!spotifyApi) {
            return;
        }

        // Check and refresh access token if needed before making API call
        const tokenValid = await checkSpotifyAccessToken();
        if (!tokenValid) {
            logWarn(
                "Spotify access token invalid, skipping song file save",
                "saveCurrentSongToFile"
            );
            return;
        }

        const playbackState = await spotifyApi.getMyCurrentPlaybackState();

        if (!playbackState.body.is_playing || !playbackState.body.item) {
            return;
        }

        const item = playbackState.body.item;
        if (item.type !== "track") {
            return; // Only handle tracks, not episodes
        }

        const currentSong = {
            title: item.name,
            artist: item.artists[0]?.name || "Unknown Artist",
        };

        // Check if song has changed
        if (
            lastSavedSong &&
            lastSavedSong.title === currentSong.title &&
            lastSavedSong.artist === currentSong.artist
        ) {
            return; // Song hasn't changed, don't save
        }

        // Song has changed, save it
        await saveSongToFile(currentSong);
        lastSavedSong = currentSong;

        // Schedule next check based on song duration
        const songDuration = item.duration_ms;
        const nextCheckDelay = Math.min(songDuration + 5000, 300000); // Max 5 minutes
        logDebug(
            `Song changed, next check in ${Math.round(nextCheckDelay / 1000)}s`,
            "saveCurrentSongToFile"
        );

        if (songFileSavingInterval) {
            clearTimeout(songFileSavingInterval);
        }
        songFileSavingInterval = setTimeout(
            saveCurrentSongToFile,
            nextCheckDelay
        );
    } catch (error) {
        // Handle token expiration specifically
        if (
            error instanceof Error &&
            error.message.includes("access token expired")
        ) {
            logDebug(
                "Access token expired in saveCurrentSongToFile, attempting refresh",
                "saveCurrentSongToFile"
            );
            try {
                const refreshed = await refreshSpotifyAccessToken();
                if (refreshed) {
                    logDebug(
                        "Token refreshed successfully, retrying song file save",
                        "saveCurrentSongToFile"
                    );
                    // Retry the operation once after successful refresh
                    setTimeout(saveCurrentSongToFile, 1000);
                } else {
                    logWarn(
                        "Failed to refresh Spotify token for song file saving",
                        "saveCurrentSongToFile"
                    );
                }
            } catch (refreshError) {
                logError(refreshError, "saveCurrentSongToFile:tokenRefresh");
            }
            return;
        }

        // Only log error if it's not a common "no playback" error
        if (
            error instanceof Error &&
            !error.message.includes("NO_ACTIVE_DEVICE") &&
            !error.message.includes("PREMIUM_REQUIRED")
        ) {
            logError(error, "saveCurrentSongToFile");
        }
    }
}

// Helper function to save song to file
async function saveSongToFile(songInfo: { title: string; artist: string }) {
    try {
        logDebug("saveSongToFile called", { songInfo });
        const saveToFile = Config.get("saveCurrentSongToFile");
        const filePath = Config.get("currentSongFilePath");

        logDebug("Song file saving config", { saveToFile, filePath });

        if (!saveToFile || !filePath) {
            logDebug("Song file saving disabled or no file path configured");
            return;
        }

        // Handle empty song info (no song playing)
        let songText = "";
        if (songInfo.title && songInfo.artist) {
            const currentSongFormat =
                Config.get("currentSongFormat") || "{title} - {artist}";
            songText = currentSongFormat
                .replace("{title}", songInfo.title)
                .replace("{artist}", songInfo.artist);
        }

        // Ensure directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filePath, songText, "utf-8");
        logDebug(`Current song saved to file: ${filePath}`, {
            songText: songText || "No song playing",
        });
    } catch (error) {
        logError(error, "spotify:saveSongToFile");
    }
}

/**
 * Song File Saving Control
 * Starts or stops the automatic saving of the currently playing song to a file
 * The saved information can be used for streaming overlays (e.g., OBS)
 *
 * - On start, clears any existing intervals or timeouts to avoid duplicates
 * - Immediately saves the current song information to file
 * - Sets up a periodic fallback save every 30 seconds
 */
export function startSongFileSaving() {
    // Clear any existing intervals and timeouts
    if (saveSongInterval) {
        clearInterval(saveSongInterval);
    }
    if (nextSaveTimeout) {
        clearTimeout(nextSaveTimeout);
    }

    // Start the first check immediately
    saveCurrentSongToFile();
    logInfo("Started saving current song to file");

    // Also set up a periodic check every 30 seconds as a fallback
    saveSongInterval = setInterval(() => {
        saveCurrentSongToFile();
    }, 30000);
}

/**
 * Song File Saving Control
 * Stops the automatic saving of the currently playing song to a file
 * Clears any existing intervals or timeouts related to song saving
 */
export function stopSongFileSaving() {
    if (saveSongInterval) {
        clearInterval(saveSongInterval);
        saveSongInterval = null;
    }
    if (nextSaveTimeout) {
        clearTimeout(nextSaveTimeout);
        nextSaveTimeout = null;
    }

    logInfo("Stopped saving current song to file");
}
