// preload.ts
// Preload script for the Electron renderer process.
// Exposes safe APIs to the renderer process through contextBridge.

import { contextBridge, ipcRenderer } from "electron";
import {
    INVOKE_CHANNELS,
    LISTEN_CHANNELS,
    SEND_CHANNELS,
} from "../shared/ipcChannels";

const sendChannels = new Set(SEND_CHANNELS);
const invokeChannels = new Set(INVOKE_CHANNELS);
const listenChannels = new Set(LISTEN_CHANNELS);

function blockChannel(kind: string, channel: unknown): void {
    console.error(`Blocked ${kind} on unapproved IPC channel:`, channel);
}

function isApprovedChannel(
    kind: string,
    channel: unknown,
    allowed: Set<string>
): channel is string {
    if (typeof channel !== "string" || !allowed.has(channel)) {
        blockChannel(kind, channel);
        return false;
    }
    return true;
}

/**
 * The bridge wraps listeners so a throwing handler cannot break other
 * subscribers. `removeListener` must be able to find that wrapper again, so
 * remember which wrapper belongs to which (listener, channel) pair.
 */
const listenerWrappers = new WeakMap<
    (...args: any[]) => void,
    Map<string, (event: unknown, ...args: any[]) => void>
>();

function removeListenerWrapper(
    channel: string,
    func: (...args: any[]) => void
): ((event: unknown, ...args: any[]) => void) | undefined {
    const byChannel = listenerWrappers.get(func);
    const wrapper = byChannel?.get(channel);
    if (byChannel && wrapper) {
        byChannel.delete(channel);
    }
    return wrapper;
}

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

    // IPC communication - only channels approved in shared/ipcChannels.ts may
    // cross the bridge.
    send: (channel: string, data?: any) => {
        if (!isApprovedChannel("send", channel, sendChannels)) return;
        ipcRenderer.send(channel, data);
    },
    on: (channel: string, func: (...args: any[]) => void) => {
        if (!isApprovedChannel("listener", channel, listenChannels)) return;
        if (typeof func !== "function") {
            console.error(
                "Invalid function provided to electronAPI.on for channel:",
                channel
            );
            return;
        }
        const wrapper = (_event: unknown, ...args: any[]) => {
            try {
                func(...args);
            } catch (error) {
                console.error(
                    "Error in event listener for channel:",
                    channel,
                    error
                );
            }
        };
        let byChannel = listenerWrappers.get(func);
        if (!byChannel) {
            byChannel = new Map();
            listenerWrappers.set(func, byChannel);
        }
        byChannel.set(channel, wrapper);
        return ipcRenderer.on(channel, wrapper);
    },
    removeListener: (channel: string, func: (...args: any[]) => void) => {
        if (!isApprovedChannel("removeListener", channel, listenChannels)) {
            return;
        }
        if (typeof func !== "function") return;
        const wrapper = removeListenerWrapper(channel, func);
        if (!wrapper) return;
        ipcRenderer.removeListener(channel, wrapper);
    },
    invoke: (channel: string, ...args: any[]) => {
        if (!isApprovedChannel("invoke", channel, invokeChannels)) {
            return Promise.reject(
                new Error(
                    `Blocked invoke on unapproved IPC channel: ${String(
                        channel
                    )}`
                )
            );
        }
        return ipcRenderer.invoke(channel, ...args);
    },
    removeAllListeners: (channel: string) => {
        if (!isApprovedChannel("removeAllListeners", channel, listenChannels)) {
            return;
        }
        ipcRenderer.removeAllListeners(channel);
    },

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
    restart: () => ipcRenderer.send("app:restart"),
});
