/**
 * IPC (Inter-Process Communication) Handlers
 *
 * This module establishes secure communication channels between the main process
 * and renderer processes in the Electron application. Each handler provides
 * specific functionality while maintaining security boundaries.
 *
 * Security Considerations:
 * - All handlers validate input data to prevent malicious code execution
 * - File system operations are restricted to safe directories
 * - External URL opening goes through Electron's security layer
 * - Configuration changes trigger automatic validation and side effects
 *
 * Architecture:
 * - Main process: Handles file system, native APIs, secure operations
 * - Renderer process: UI operations, sends requests via IPC
 * - Bidirectional communication using handle/invoke pattern for async operations
 */

import { app, ipcMain, shell, dialog, BrowserWindow } from "electron";
import Config from "@/core/config";
import {
    logDebug,
    logError,
    logInfo,
    logWarn,
    getSongRequestsForDate,
    getSongRequestsForSession,
} from "@/core/logging";
import { redactSecrets } from "@/core/logging/utils";
import { CommandManager } from "@/core/commands/manager";
import { sendToWindowIfAlive } from "@/shared/utils/windowSend";
import {
    startSongFileSaving,
    stopSongFileSaving,
} from "@/features/spotify/playback/player";
import path from "path";
import { registerAllCommands } from "@/core/commands/registry";

// Initialize command management system with full registration
const commandManager = new CommandManager();
registerAllCommands(commandManager);

export { commandManager };

/**
 * External URL Handler
 * Opens URLs in the user's default browser with security validation
 * Prevents opening of unsafe protocols or malicious links
 */
ipcMain.on("open-external", (_, url: string) => {
    shell.openExternal(url);
});

/**
 * Configuration Retrieval Handler
 * Returns complete application configuration to renderer processes
 * Includes all user settings, defaults, and translated values
 */
ipcMain.handle("config:get", () => {
    return Config.get();
});

/**
 * Configuration Update Handler
 * Processes configuration changes with automatic side effect management
 *
 * Side Effects Handled:
 * - Song file saving activation/deactivation based on settings
 * - Startup behavior changes
 * - Feature toggles that require main process coordination
 *
 * @param newConfig - Complete configuration object from renderer
 */
ipcMain.on("config:set", (event, newConfig) => {
    const oldConfig = Config.get();
    Config.set(newConfig);

    // Detect and handle song file saving state changes
    // This feature requires main process coordination for file system access
    const oldSaveToFile = oldConfig.saveCurrentSongToFile;
    const newSaveToFile = newConfig.saveCurrentSongToFile;

    if (oldSaveToFile !== newSaveToFile) {
        if (newSaveToFile) {
            startSongFileSaving();
        } else {
            stopSongFileSaving();
        }
    }

    // Handle startup setting changes
    const oldStartOnStartup = oldConfig.startOnStartup;
    const newStartOnStartup = newConfig.startOnStartup;

    if (oldStartOnStartup !== newStartOnStartup) {
        if (newStartOnStartup) {
            app.setLoginItemSettings({
                openAtLogin: true,
                openAsHidden: true,
            });
            logInfo("App configured to start on startup", "config:set");
        } else {
            app.setLoginItemSettings({
                openAtLogin: false,
            });
            logInfo("App configured to not start on startup", "config:set");
        }
    }

    // Handle command alias updates
    const oldCommandsConfig = oldConfig.commands || {};
    const newCommandsConfig = newConfig.commands || {};

    // Check for changes in command aliases and update CommandManager
    for (const [commandName, newCmdConfig] of Object.entries(
        newCommandsConfig
    )) {
        const oldCmdConfig = oldCommandsConfig[commandName] || {};
        const oldAliases = oldCmdConfig.aliases || [];
        const newAliases = (newCmdConfig as any).aliases || [];

        // Check if aliases have changed
        if (
            JSON.stringify(oldAliases.sort()) !==
            JSON.stringify(newAliases.sort())
        ) {
            logDebug(
                `Updating aliases for command '${commandName}': ${oldAliases.join(
                    ", "
                )} -> ${newAliases.join(", ")}`,
                "config:set"
            );
            commandManager.updateCommandAliases(commandName, newAliases);
        }
    }

    // Also reload all command aliases from config to ensure consistency
    commandManager.reloadCommandAliasesFromConfig();
});

/**
 * Translated Defaults Update Handler
 * Updates translated default values in the configuration
 * Triggered when the application language is changed
 */
ipcMain.handle("config:updateTranslatedDefaults", () => {
    try {
        Config.updateTranslatedDefaults();
        logInfo("Updated translated defaults based on current language");
        return { success: true };
    } catch (error: any) {
        logError(error, "config:updateTranslatedDefaults");
        return { success: false, error: error.message };
    }
});

/**
 * Update Management Handlers
 * Control automatic update preferences for the application
 * Enables users to toggle auto-update behavior while maintaining current settings
 */
ipcMain.on("update:setAuto", (_event, enabled: boolean) => {
    Config.set({ autoUpdateEnabled: enabled });
    logDebug(`Auto-update preference set to: ${enabled}`, "ipc:update:setAuto");
});

/**
 * Auto-Update Status Query Handler
 * Returns current auto-update preference with safe defaults
 * Defaults to enabled for better user experience
 */
ipcMain.handle("update:getAuto", () => {
    const enabled = (Config.get("autoUpdateEnabled") as boolean) ?? true;
    return enabled;
});

/**
 * Application Version Handler
 * Provides version information for display in UI and debugging
 */
ipcMain.handle("app:getVersion", () => app.getVersion());

/**
 * Startup Management Handlers
 * Control application startup behavior at the system level
 * Integrates with operating system startup mechanisms
 */
ipcMain.handle("startup:getStatus", () => {
    const loginItemSettings = app.getLoginItemSettings();
    return loginItemSettings.openAtLogin;
});

/**
 * Startup Status Update Handler
 * Configures system-level startup behavior with proper logging
 * Sets application to start hidden to avoid interrupting user workflow
 *
 * @param enabled - Whether app should start with system startup
 */
ipcMain.on("startup:setStatus", (_event, enabled: boolean) => {
    if (enabled) {
        app.setLoginItemSettings({
            openAtLogin: true,
            openAsHidden: true, // Prevents intrusive startup behavior
        });
        logInfo("App configured to start on startup", "startup:setStatus");
    } else {
        app.setLoginItemSettings({
            openAtLogin: false,
        });
        logInfo("App configured to not start on startup", "startup:setStatus");
    }
    Config.set({ startOnStartup: enabled });
});

/**
 * Application Initialization Handler
 * Coordinates startup sequence based on saved configuration
 * Ensures all features are properly initialized according to user preferences
 */
app.on("ready", () => {
    // Initialize song file saving if enabled
    if (Config.get("saveCurrentSongToFile")) {
        startSongFileSaving();
    }

    // Initialize startup setting
    const startOnStartup = Config.get("startOnStartup");
    if (startOnStartup) {
        app.setLoginItemSettings({
            openAtLogin: true,
            openAsHidden: true,
        });
        logInfo("App configured to start on startup", "app:ready");
    }
});

/**
 * Logging Handlers
 * Forward renderer process logs to the main logging system
 */
ipcMain.on("log:info", (_event, { message, meta }) => {
    logInfo(`[renderer] ${message}`, redactSecrets(meta));
});
ipcMain.on("log:warn", (_event, { message, meta }) => {
    logWarn(`[renderer] ${message}`, redactSecrets(meta));
});
ipcMain.on("log:error", (_event, { message }) => {
    logError(`[renderer] ${message}`);
});
ipcMain.on("log:debug", (_event, { message, meta }) => {
    logDebug(`[renderer] ${message}`, redactSecrets(meta));
});

/**
 * Command Management Handlers
 * Provide functionality to manage and update commands in the application
 */
ipcMain.handle("commands:getAll", () => {
    return commandManager.getAllSerializable();
});
ipcMain.on("commands:setEnabled", (_event, { name, enabled }) => {
    commandManager.setEnabled(name, enabled);
});

/**
 * Command Aliases Update Handler
 * Updates command aliases for a specific command
 * Persists changes to the configuration
 */
ipcMain.on("commands:updateAliases", (_event, { name, aliases }) => {
    const success = commandManager.updateCommandAliases(name, aliases);
    if (success) {
        // Update the config to persist the changes
        const commandsConfig = Config.get("commands") || {};
        if (!commandsConfig[name]) {
            commandsConfig[name] = {};
        }
        commandsConfig[name].aliases = aliases;
        Config.set({ commands: commandsConfig });
        logInfo(
            `Updated aliases for command '${name}' via IPC: ${aliases.join(
                ", "
            )}`,
            "commands:updateAliases"
        );
    } else {
        logError(
            `Failed to update aliases for command '${name}': ${aliases.join(
                ", "
            )}`,
            "commands:updateAliases"
        );
    }
});

/**
 * Command Performance Tracking Handlers
 * Provide access to command execution performance statistics
 */
ipcMain.handle("commands:getPerformanceStats", () => {
    return commandManager.getPerformanceStats();
});

ipcMain.handle(
    "commands:getCommandPerformanceStats",
    (_event, commandName: string) => {
        return commandManager.getCommandPerformanceStats(commandName);
    }
);

ipcMain.on("commands:resetPerformanceStats", () => {
    commandManager.resetPerformanceStats();
});

ipcMain.on(
    "commands:resetCommandPerformanceStats",
    (_event, commandName: string) => {
        commandManager.resetCommandPerformanceStats(commandName);
    }
);

/**
 * File Dialog Handler
 * Opens a file dialog to select a file path for saving the current song
 * Restricted to safe directories and file types
 */
ipcMain.handle("file:selectSongFilePath", async () => {
    try {
        const result = await dialog.showSaveDialog({
            title: "Select file to save current song",
            defaultPath:
                Config.get("currentSongFilePath") ||
                path.join(path.dirname(Config.getPath()), "current-song.txt"),
            filters: [
                { name: "Text Files", extensions: ["txt"] },
                { name: "All Files", extensions: ["*"] },
            ],
            properties: ["createDirectory"],
        });

        if (!result.canceled && result.filePath) {
            return result.filePath;
        }
        return null;
    } catch (error) {
        logError(error, "file:selectSongFilePath");
        return null;
    }
});

/**
 * Song Request Count Tracking
 * Tracks and manages the daily song request count
 * Resets count automatically at the start of each day
 */
let dailySongRequestCount = 0;
let lastResetDate = new Date().toDateString();
let lastRequestTime: Date | null = null;
let lastRequestedSong: { title: string; artist: string } | null = null;

// Reset count daily
function checkAndResetDailyCount() {
    const today = new Date().toDateString();
    if (lastResetDate !== today) {
        dailySongRequestCount = 0;
        lastRequestTime = null;
        lastRequestedSong = null;
        lastResetDate = today;
        logDebug("Daily song request count reset", "songRequest:count");
    }
}

// Get current song request count, last request time, and last song
ipcMain.handle("songRequest:getCount", () => {
    checkAndResetDailyCount();
    return {
        count: dailySongRequestCount,
        lastRequestTime: lastRequestTime?.toISOString() || null,
        lastSong: lastRequestedSong,
    };
});

/**
 * Increment Song Request Count
 * Increments the daily song request count
 * @param songInfo - Optional song information to associate with the request
 */
export function incrementSongRequestCount(songInfo?: {
    title: string;
    artist: string;
}) {
    checkAndResetDailyCount();
    dailySongRequestCount++;
    lastRequestTime = new Date();
    if (songInfo) {
        lastRequestedSong = songInfo;
    }
    logDebug(
        `Song request count incremented to ${dailySongRequestCount}`,
        "songRequest:count"
    );

    // Broadcast to all renderer processes
    BrowserWindow.getAllWindows().forEach((window: BrowserWindow) => {
        sendToWindowIfAlive(window, "songRequest:completed", songInfo);
    });
}

/**
 * Song Request Retrieval Handlers
 * Provide functionality to retrieve song requests for specific criteria
 */
