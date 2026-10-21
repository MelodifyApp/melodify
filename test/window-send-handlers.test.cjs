"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const {
    sendToWindowIfAlive,
} = require("../src/shared/utils/windowSend");

function destroyedWindow() {
    return {
        isDestroyed: () => true,
        get webContents() {
            throw new Error("Object has been destroyed");
        },
    };
}

function liveWindow() {
    const sent = [];
    return {
        sent,
        isDestroyed: () => false,
        webContents: {
            isDestroyed: () => false,
            send: (...args) => sent.push(args),
        },
    };
}

function loadWith(stubs, modulePath) {
    const originalLoad = Module._load;
    try {
        Module._load = function (request, parent, isMain) {
            if (Object.prototype.hasOwnProperty.call(stubs, request)) {
                return stubs[request];
            }
            return originalLoad.call(this, request, parent, isMain);
        };
        const resolved = require.resolve(modulePath);
        delete require.cache[resolved];
        return require(resolved);
    } finally {
        Module._load = originalLoad;
    }
}

function kickHandlers(window) {
    const handlers = new Map();
    loadWith(
        {
            electron: {
                ipcMain: {
                    on: (name, handler) => handlers.set(name, handler),
                    handle: (name, handler) => handlers.set(name, handler),
                },
                BrowserWindow: { fromWebContents: () => window },
            },
            "@/core/config": {
                __esModule: true,
                default: { get: () => undefined, set() {} },
            },
            "@/core/logging": {
                logInfo() {},
                logError() {},
                logWarn() {},
                logDebug() {},
            },
            "@/core/logging/utils": { redactSecrets: (value) => value },
            "@/shared/utils/windowSend": { sendToWindowIfAlive },
            "@/features/kick/auth/server": {
                startKickAuthServer: async () => {},
                openKickAuthUrl() {},
                stopKickAuthServer() {},
            },
            "@/features/kick/chat/listener": {
                isListening: false,
                listenToChat() {},
                stopListeningToChat() {},
                sendKickMessage: async () => {},
                startKickTokenAutoRefresh() {},
                stopKickTokenAutoRefresh() {},
            },
            "@/features/kick/api/client": {
                kickClient: {
                    hasTokens: () => true,
                    clearTokens() {},
                    getValidAccessToken: async () => "token",
                    getChannels: async () => [],
                    findChatroom: async () => null,
                    sendMessage: async () => {},
                },
            },
        },
        "../src/features/kick/ipc/handlers"
    );
    return handlers;
}

function twitchHandlers(window) {
    const handlers = new Map();
    loadWith(
        {
            electron: {
                ipcMain: {
                    on: (name, handler) => handlers.set(name, handler),
                    handle: (name, handler) => handlers.set(name, handler),
                },
                BrowserWindow: { fromWebContents: () => window },
            },
            "@/core/config": {
                __esModule: true,
                default: { get: () => undefined, set() {} },
            },
            "@/core/logging": {
                logInfo() {},
                logError() {},
                logWarn() {},
                logDebug() {},
            },
            "@/core/logging/utils": { redactSecrets: (value) => value },
            "@/shared/utils/windowSend": { sendToWindowIfAlive },
            "@/features/twitch/auth/server": {
                startTwitchAuthServer: async () => {},
                openTwitchAuthUrl() {},
                stopTwitchAuthServer() {},
            },
            "@/features/twitch/chat/listener": {
                isListening: false,
                listenToChat() {},
                stopListeningToChat() {},
                sendTwitchMessage: async () => {
                    throw new Error("chat send failed");
                },
            },
            "@/features/twitch/api/client": {
                twitchClient: {
                    hasTokens: () => true,
                    getValidAccessToken: async () => "token",
                    clearTokens() {},
                },
            },
        },
        "../src/features/twitch/ipc/handlers"
    );
    return handlers;
}

test("kick:logout does not throw when its window is already destroyed", () => {
    const handlers = kickHandlers(destroyedWindow());
    assert.doesNotThrow(() => handlers.get("kick:logout")({ sender: {} }));
});

test("kick:logout still notifies a live window exactly once", () => {
    const window = liveWindow();
    const handlers = kickHandlers(window);
    handlers.get("kick:logout")({ sender: {} });
    assert.deepEqual(window.sent, [["kick:authenticationFailed"]]);
});

test("twitch:sendMessage error notification is skipped for a destroyed window", async () => {
    const handlers = twitchHandlers(destroyedWindow());
    await assert.doesNotReject(handlers.get("twitch:sendMessage")({ sender: {} }, "hello"));
});

test("twitch:sendMessage error notification reaches a live window", async () => {
    const window = liveWindow();
    const handlers = twitchHandlers(window);
    await handlers.get("twitch:sendMessage")({ sender: {} }, "hello");
    assert.equal(window.sent.length, 1);
    assert.equal(window.sent[0][0], "twitch:sendMessageError");
});
