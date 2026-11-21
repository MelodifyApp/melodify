// index.ts
// Main process entry point for the Electron application.
// Handles app lifecycle, window management, tray creation, and IPC setup.

import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } from "electron";
import { logInfo, logDebug, logError, logWarn } from "@/core/logging";
import { applyNavigationGuards } from "./navigationGuard";
import Config from "@/core/config";
import Updater from "basic-electron-updater";
import { createUpdateController, statUpdateArtifact } from "./updateController";
import { createAppLifecycle } from "./appLifecycle";
import { createUpdateStatusSnapshot } from "./updateSnapshot";
import { UPDATE_APP_ID, UPDATE_SIGNING_KEYS } from "./updateSecurity";
import { sendToWindowIfAlive } from "@/shared/utils/windowSend";
import path from "path";
import fs from "fs";
import os from "os";

// Import IPC handlers for different features
import "@/core/ipc";
import "@/features/kick/ipc/handlers";
import "@/features/kick/ipc/rewards";
import "@/features/home/ipc/handlers";
import "@/features/spotify/ipc/handlers";
import "@/features/twitch/ipc/handlers";
import "@/features/twitch/ipc/rewards";

// Import feature initialization functions
import {
    startKickTokenAutoRefresh,
    stopKickTokenAutoRefresh,
    stopListeningToChat,
} from "@/features/kick/chat/listener";
import { stopKickAuthServer } from "@/features/kick/auth/server";
import {
    startSpotifyTokenRefreshInterval,
    stopSpotifyTokenAutoRefresh,
} from "@/features/spotify/playback/player";
import { initializeHomeSession } from "@/features/home/homeSession";
import {
    initializeStreamSessions,
    shutdownStreamSessions,
} from "@/features/home/streamSessionRuntime";

// Window dimensions and platform detection
const WINDOW_WIDTH = 1200;
const WINDOW_HEIGHT = 800;
const IS_MAC = process.platform === "darwin";

// Webpack entry points (declared by webpack)
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Handle Windows installer squirrel events
if (require("electron-squirrel-startup")) {
    app.quit();
}

// Global variables for window and tray management
let mainWindow: BrowserWindow | null = null;
let testWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// Acquire the process lock before updater/provider initialization or app-ready
// background work. A duplicate launch quits here and focuses the owner through
// the second-instance handler registered below.
const appLifecycle = createAppLifecycle({
    app,
    getMainWindow: () => mainWindow,
    getTray: () => tray,
    createTray: () => createTray(),
    getMinimizeToTray: () => Config.get("minimizeToTray") === true,
    isMac: IS_MAC,
    log: {
        info: (message, context) => logInfo(message, context),
        warn: (message, context) => logWarn(message, context),
    },
});
const isPrimaryInstance = appLifecycle.acquireSingleInstanceLock();
if (!isPrimaryInstance) {
    logWarn("Duplicate Melodify launch exited", "main:singleInstance");
}

// Initialize the updater with configuration
let updater: Updater | null = null;
const isIsolatedPreview =
    process.env.NODE_ENV === "development" &&
    !!process.env.MELODIFY_PREVIEW_USER_DATA;
if (isIsolatedPreview) {
    logInfo("Updater disabled for isolated UI preview", "updater:init");
} else {
    try {
        updater = new Updater({
            repo: "MelodifyApp/melodify",
            autoDownload: false, // Don't auto-download, let user choose
            allowPrerelease: false, // Only stable releases
            debug: false, // Enable debug in dev
            security: {
                appId: UPDATE_APP_ID,
                publicKeys: UPDATE_SIGNING_KEYS,
            },
            logger: {
                info: (message: string) => logInfo(message, "updater"),
                debug: (message: string) => logDebug(message, "updater"),
                warn: (message: string) => logWarn(message, "updater"),
                error: (message: string) => logError(message, "updater"),
            },
        });
        logInfo("Updater initialized successfully", "updater:init");
    } catch (error: any) {
        logError(error, "updater:init");
        // Continue without updater if initialization fails
    }
}

const realTempDir = (() => {
    try {
        return fs.realpathSync(os.tmpdir());
    } catch {
        return os.tmpdir();
    }
})();

const updateStatusSnapshot = createUpdateStatusSnapshot();

const updateController = createUpdateController({
    updater,
    platform: process.platform,
    tempDir: os.tmpdir(),
    realTempDir,
    statFile: (filePath: string) => statUpdateArtifact(filePath, fs),
    broadcast: (channel, ...args) => broadcast(channel, ...args),
    beforeApplyUpdate: () => appLifecycle.beginInstallerQuit(),
    onInstallFailure: () => appLifecycle.cancelInstallerQuit(),
    log: {
        info: (message) => logInfo(message, "updater"),
        warn: (message) => logWarn(message, "updater"),
        error: (error, message) => logError(error, message ?? "updater"),
    },
});

function broadcast(channel: string, ...args: any[]) {
    try {
        if (channel === "update:status") {
            updateStatusSnapshot.record(args[0], args[1]);
        }
        const windows = BrowserWindow.getAllWindows();
        if (windows.length === 0) {
            logDebug(
                `No windows available for broadcast to channel: ${channel}`,
                "broadcast"
            );
            return;
        }

        windows.forEach((win) => {
            if (win && !win.isDestroyed() && win.webContents) {
                try {
                    win.webContents.send(channel, ...args);
                } catch (error: any) {
                    logError(error, `broadcast:${channel}:window`);
                }
            }
        });
    } catch (error: any) {
        logError(error, `broadcast:${channel}`);
    }
}

// Set up event listeners for the updater
if (updater) {
    updater.on("checking-for-update", () => {
        broadcast("update:status", "checking");
    });

    updater.on("update-available", (info: any) => {
        logInfo(`Update available: ${info.version}`, "updater");
        broadcast("update:status", "available", info);
    });

    updater.on("update-not-available", () => {
        logInfo("App is up to date.", "updater");
        broadcast("update:status", "not-available");
    });

    updater.on("download-progress", (progress: any) => {
        logDebug(`Download progress: ${progress.percent}%`, "updater");
        broadcast("update:status", "downloading", progress);
    });

    // The library's own "downloaded" event fires before the artifact has been
    // validated, so the UI status is emitted by updateController instead.

    updater.on("error", (error: any) => {
        logError(error, "updater");
        broadcast(
            "update:status",
            "error",
            error.message || "Unknown update error"
        );
    });
} else {
    logWarn(
        "Updater not available - update functionality disabled",
        "updater:setup"
    );
}

async function checkForUpdates() {
    await updateController.checkForUpdates();
}

async function downloadUpdate() {
    await updateController.downloadUpdate();
}

function installUpdate() {
    updateController.installUpdate();
}

// Embedded tray icon as base64
const TRAY_ICON_BASE64 =
    "data:image/png;base64,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";

/**
 * Creates the system tray with icon and context menu.
 * Handles tray icon creation, menu setup, and click events.
 */
const createTray = () => {
    if (tray) {
        tray.destroy();
    }

    let icon: Electron.NativeImage;

    try {
        // Create icon from embedded base64 data
        icon = nativeImage.createFromDataURL(TRAY_ICON_BASE64);
        broadcast("tray:debug", "✅ Created icon from embedded base64 data");
    } catch (error) {
        logError(error, "createTray:base64Icon");
        broadcast(
            "tray:debug",
            `❌ Failed to create icon from base64: ${error instanceof Error ? error.message : "Unknown error"}`
        );
        return;
    }

    if (icon.isEmpty()) {
        logError("Embedded icon is empty", "createTray:emptyIcon");
        broadcast("tray:debug", "❌ Embedded icon is empty");
        return;
    }

    try {
        // Create tray with resized icon (tray icons should be 16x16 or 22x22 pixels)
        tray = new Tray(icon.resize({ width: 16, height: 16 }));
        logInfo("Tray created successfully with embedded icon", "createTray");
        broadcast(
            "tray:debug",
            "✅ Tray created successfully with embedded icon"
        );
    } catch (error) {
        logError(error, "createTray:failedToCreateTray");
        broadcast(
            "tray:debug",
            `❌ Failed to create tray: ${error instanceof Error ? error.message : "Unknown error"}`
        );
        return;
    }

    // Create context menu for the tray
    const contextMenu = Menu.buildFromTemplate([
        {
            label: "Open",
            click: () => {
                mainWindow?.show();
            },
        },
        {
            label: "Quit",
            click: () => {
                appLifecycle.requestQuit("tray-quit");
            },
        },
    ]);

    tray.setToolTip("Melodify");
    tray.setContextMenu(contextMenu);
    tray.on("click", () => {
        mainWindow?.show();
    });
    logDebug("Tray setup complete", "createTray");
};

/**
 * Keeps the renderer titlebar icon in sync with native maximize/restore.
 */
const trackMaximizedState = (window: BrowserWindow): void => {
    const notify = () => {
        sendToWindowIfAlive(window, "window:maximized", window.isMaximized());
    };
    window.on("maximize", notify);
    window.on("unmaximize", notify);
};

/**
 * Creates the UI test window for development purposes.
 * Only available in development mode.
 */
const createTestWindow = (): void => {
    // Only allow in development mode
    if (process.env.NODE_ENV !== "development") {
        logWarn(
            "UI test window requested but not in development mode",
            "createTestWindow"
        );
        return;
    }

    // Don't create multiple test windows
    if (testWindow && !testWindow.isDestroyed()) {
        testWindow.focus();
        return;
    }

    logInfo("Creating UI test window");
    try {
        testWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            minWidth: 320,
            minHeight: 600,
            fullscreenable: false,
            resizable: true,
            maximizable: true,
            autoHideMenuBar: true,
            frame: false,
            webPreferences: {
                preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
                contextIsolation: true,
                nodeIntegration: false,
            },
            parent: mainWindow || undefined,
        });

        trackMaximizedState(testWindow);

        // Load the same entry point but with a query parameter to identify it as test window
        testWindow.loadURL(`${MAIN_WINDOW_WEBPACK_ENTRY}?testmode=true`);
        testWindow.setMenu(null);
        applyNavigationGuards(testWindow.webContents, {
            openExternal: (url) => {
                void shell.openExternal(url);
            },
        });

        // Open DevTools for the test window
        testWindow.webContents.openDevTools({ mode: "detach" });

        // Handle window close event
        testWindow.on("closed", () => {
            testWindow = null;
            logInfo("UI test window closed");
        });

        // Handle potential crashes
        testWindow.webContents.on("render-process-gone", (event, details) => {
            logError(
                `UI test window render process gone: ${details.reason}`,
                "testWindow:crash"
            );
            if (testWindow && !testWindow.isDestroyed()) {
                testWindow.close();
            }
            testWindow = null;
        });

        // Handle unresponsive window
        testWindow.on("unresponsive", () => {
            logWarn(
                "UI test window became unresponsive",
                "testWindow:unresponsive"
            );
        });

        testWindow.on("responsive", () => {
            logInfo(
                "UI test window became responsive again",
                "testWindow:responsive"
            );
        });

        logInfo("UI test window created");
    } catch (error) {
        logError(error, "main:createTestWindow");
    }
};

/**
 * Creates the main application window.
 * Sets up window properties, loads the app, and handles window events.
 */
const createMainWindow = (): void => {
    logInfo("Creating main application window");
    try {
        // Create the main window with specific properties
        mainWindow = new BrowserWindow({
            width: WINDOW_WIDTH,
            height: WINDOW_HEIGHT,
            minWidth: WINDOW_WIDTH,
            maxWidth: WINDOW_WIDTH,
            minHeight: WINDOW_HEIGHT,
            maxHeight: WINDOW_HEIGHT,
            fullscreenable: false,
            resizable: false,
            maximizable: false,
            autoHideMenuBar: true,
            frame: false,
            webPreferences: {
                preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
                contextIsolation: true,
                nodeIntegration: false,
            },
        });

        trackMaximizedState(mainWindow);

        // Load the app and remove default menu
        mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
        mainWindow.setMenu(null);
        applyNavigationGuards(mainWindow.webContents, {
            openExternal: (url) => {
                void shell.openExternal(url);
            },
        });

        // Open DevTools in development mode; fixture review can disable it.
        if (
            process.env.NODE_ENV === "development" &&
            process.env.MELODIFY_DISABLE_DEVTOOLS !== "1"
        ) {
            mainWindow.webContents.openDevTools({ mode: "detach" });
            logDebug("DevTools opened in development mode");
        }

        // Handle window close event through the one lifecycle owner.
        mainWindow.on("close", (event) => {
            appLifecycle.handleWindowClose(event);
        });

        logInfo("Main window created");
    } catch (error) {
        logError(error, "main:createMainWindow");
    }
};

app.on("ready", () => {
    if (!appLifecycle.isPrimaryInstance()) return;
    Config.unlockSecrets();
    logInfo("App ready event");
    createMainWindow();

    // Create tray if minimize-to-tray is enabled
    if (Config.get("minimizeToTray")) {
        createTray();
    }

    // Initialize features after app is ready
    try {
        // Only start Kick features if authenticated, otherwise let the UI handle auth flow
        // The kick:checkAuth handler will start listening when authentication is confirmed
        if (mainWindow) {
            startKickTokenAutoRefresh(mainWindow);
        } else {
            logWarn(
                "Main window not available for Kick token refresh",
                "main:features"
            );
        }

        // Only start Spotify token refresh if mainWindow is available
        if (mainWindow) {
            startSpotifyTokenRefreshInterval(mainWindow);
        } else {
            logWarn(
                "Main window not available for Spotify token refresh",
                "main:features"
            );
        }

        // The session queue/current-song state belongs to main and must keep
        // updating even when Home is not the mounted renderer view.
        initializeHomeSession();
        initializeStreamSessions();

        logInfo("Features initialized successfully", "main:features");
    } catch (error: any) {
        logError(error, "main:featureInit");
    }

    // Check for updates automatically if enabled (after a delay)
    checkAutoUpdate();
});

app.on("before-quit", () => {
    shutdownStreamSessions();
});

app.on("window-all-closed", () => {
    stopKickTokenAutoRefresh();
    if (mainWindow) {
        stopListeningToChat(mainWindow);
    }
    stopKickAuthServer();
    stopSpotifyTokenAutoRefresh();
    // Clean up test window reference
    if (testWindow && testWindow.isDestroyed()) {
        testWindow = null;
    }
    appLifecycle.handleWindowAllClosed();
});

app.on("activate", () => {
    if (!appLifecycle.isPrimaryInstance()) return;
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});

// Window control IPC handlers
ipcMain.on("window:minimize", (event) => {
    logInfo("Window minimize requested");
    const senderWindow = BrowserWindow.fromWebContents(event.sender);

    // Check if this is the test window
    if (senderWindow === testWindow) {
        testWindow?.minimize();
        return;
    }

    // Handle main window minimize
    const minimizeToTray = Config.get("minimizeToTray");
    if (minimizeToTray) {
        mainWindow?.hide();
        if (!tray) {
            createTray();
        }
    } else {
        mainWindow?.minimize();
    }
});

ipcMain.on("window:maximize", (event) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    const target =
        senderWindow === testWindow ? testWindow : mainWindow;
    if (!target || target.isDestroyed() || !target.isMaximizable()) return;
    if (target.isMaximized()) target.unmaximize();
    else target.maximize();
});

ipcMain.handle("window:isMaximized", (event) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    const target =
        senderWindow === testWindow ? testWindow : mainWindow;
    return !!target && !target.isDestroyed() && target.isMaximized();
});

ipcMain.on("window:close", (event) => {
    logInfo("Window close requested");
    const senderWindow = BrowserWindow.fromWebContents(event.sender);

    // Check if this is the test window
    if (senderWindow === testWindow) {
        testWindow?.close();
        return;
    }

    // Handle main window close through the explicit lifecycle intent.
    appLifecycle.requestQuit("titlebar-close");
});

// Development IPC handlers
ipcMain.handle("open-ui-test-window", () => {
    logInfo("UI test window requested");
    createTestWindow();
});

// App control IPC handlers
ipcMain.on("app:restart", () => {
    app.relaunch({ args: process.argv.slice(1).concat(["--relaunch"]) });
    appLifecycle.requestQuit("restart");
});

// Updater IPC handlers - Note: These override any core IPC update handlers
ipcMain.removeAllListeners("update:check");
ipcMain.removeAllListeners("update:download");
ipcMain.removeAllListeners("update:install");

ipcMain.handle("update:getStatus", () => updateStatusSnapshot.read());

ipcMain.on("update:check", () => {
    logDebug("Update check requested from renderer", "updater:ipc");
    checkForUpdates();
});

ipcMain.on("update:download", (_event, _manifest) => {
    logDebug("Update download requested from renderer", "updater:ipc");
    downloadUpdate();
});

ipcMain.on("update:install", () => {
    logDebug("Update install requested from renderer", "updater:ipc");
    installUpdate();
});

// IPC handler for opening the UI test window
ipcMain.on("window:test", () => {
    logInfo("Test window requested");
    createTestWindow();
});

// IPC handler for testing tray creation
ipcMain.on("tray:test-create", () => {
    logInfo("Tray creation test requested from renderer", "tray:test");
    broadcast("tray:debug", "🔧 Tray creation test started");

    // Destroy existing tray first if it exists
    if (tray) {
        tray.destroy();
        broadcast("tray:debug", "🗑️ Destroyed existing tray");
    }

    // Create new tray with embedded icon
    createTray();
});

// Check for updates automatically if enabled
const checkAutoUpdate = () => {
    try {
        const autoUpdateEnabled = Config.get("autoUpdateEnabled") ?? true;
        if (autoUpdateEnabled && updater) {
            logInfo(
                "Auto-update is enabled, checking for updates in 5 seconds",
                "main:autoUpdate"
            );
            setTimeout(() => {
                checkForUpdates().catch((error) => {
                    logError(error, "main:autoUpdateCheck");
                });
            }, 5000); // Wait 5 seconds after app start
        } else if (!updater) {
            logWarn(
                "Auto-update requested but updater is not available",
                "main:autoUpdate"
            );
        } else {
            logDebug("Auto-update is disabled", "main:autoUpdate");
        }
    } catch (error: any) {
        logError(error, "main:autoUpdate:configAccess");
    }
};

logInfo("Main process setup complete", "main:setup");
