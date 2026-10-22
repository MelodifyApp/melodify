// preload.ts
// Preload script for the Electron renderer process.
// Exposes safe APIs to the renderer process through contextBridge.

import { contextBridge, ipcRenderer } from "electron";

/**
 * Exposes Electron APIs to the renderer process through contextBridge.
 * Provides a secure way for the renderer to communicate with the main process.
 */
contextBridge.exposeInMainWorld("electronAPI", {
    // Window control functions
    minimize: () => ipcRenderer.send("window:minimize"),
    close: () => ipcRenderer.send("window:close"),

    // Development functions
    openUITestWindow: () => ipcRenderer.invoke("open-ui-test-window"),

    // App information
    getAppVersion: () => ipcRenderer.invoke("app:getVersion"),

    // IPC communication
    send: (channel: string, data?: any) => ipcRenderer.send(channel, data),
    on: (channel: string, func: (...args: any[]) => void) => {
        if (typeof func !== "function") {
            console.error(
                "Invalid function provided to electronAPI.on for channel:",
                channel
            );
            return;
        }
        return ipcRenderer.on(channel, (_event, ...args) => {
            try {
                func(...args);
            } catch (error) {
                console.error(
                    "Error in event listener for channel:",
                    channel,
                    error
                );
            }
        });
    },
    removeListener: (channel: string, func: (...args: any[]) => void) =>
        ipcRenderer.removeListener(channel, func),
    invoke: (channel: string, ...args: any[]) =>
        ipcRenderer.invoke(channel, ...args),
    removeAllListeners: (channel: string) =>
        ipcRenderer.removeAllListeners(channel),

    // External link handling
    openExternal: (url: string) => ipcRenderer.send("open-external", url),

    // File system operations
    selectSongFilePath: () => ipcRenderer.invoke("file:selectSongFilePath"),

    // Configuration management
    updateTranslatedDefaults: () =>
        ipcRenderer.invoke("config:updateTranslatedDefaults"),

    // Startup management
    getStartupStatus: () => ipcRenderer.invoke("startup:getStatus"),
    setStartupStatus: (enabled: boolean) =>
        ipcRenderer.send("startup:setStatus", enabled),

    // Update management
    checkForUpdates: () => ipcRenderer.send("update:check"),
    setAutoUpdate: (enabled: boolean) =>
        ipcRenderer.send("update:setAuto", enabled),
    getAutoUpdate: () => ipcRenderer.invoke("update:getAuto"),
    onUpdateStatus: (callback: (event: any, ...args: any[]) => void) =>
        ipcRenderer.on("update:status", callback),
    downloadUpdate: (manifest: any) =>
        ipcRenderer.send("update:download", manifest),
    installUpdate: () => ipcRenderer.send("update:install"),
    setSpotifySecrets: (secrets: Record<string, string>) =>
        ipcRenderer.send("spotify:setSecrets", secrets),
    setKickSecrets: (secrets: Record<string, string>) =>
        ipcRenderer.send("kick:setSecrets", secrets),
    restart: () => ipcRenderer.send("app:restart"),
});
