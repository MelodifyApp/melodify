"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;

function withStubs(stubs, body) {
    Module._resolveFilename = function (request, ...args) {
        return originalResolve.call(
            this,
            request.startsWith("@/")
                ? path.join(root, "src", request.slice(2))
                : request,
            ...args
        );
    };
    Module._load = function (request, parent, isMain) {
        if (Object.prototype.hasOwnProperty.call(stubs, request)) {
            return stubs[request];
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    return Promise.resolve()
        .then(body)
        .finally(() => {
            Module._resolveFilename = originalResolve;
            Module._load = originalLoad;
        });
}

function load(relativePath) {
    const resolved = require.resolve(path.join(root, relativePath));
    delete require.cache[resolved];
    return require(resolved);
}

function deferred() {
    let resolve;
    const promise = new Promise((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

async function waitFor(predicate, description, timeoutMs = 3000) {
    const started = Date.now();
    while (!predicate()) {
        if (Date.now() - started > timeoutMs) {
            throw new Error(`Timed out waiting for ${description}`);
        }
        await new Promise((resolve) => setImmediate(resolve));
    }
}

test("kick:checkAuth cannot restore identity or services after kick:logout", async () => {
    const values = {
        kickClientId: "dummy-client-id",
        kickClientSecret: "dummy-client-secret",
        kickAccessToken: "dummy-access",
        kickRefreshToken: "dummy-refresh",
        kickExpiresAt: Date.now() + 3600000,
        username: "dummy-old-channel",
        userId: "100",
        chatroomId: "dummy-old-room",
    };
    const effects = {
        listening: 0,
        stopped: 0,
        refreshStarts: 0,
        refreshStops: 0,
        channelsCalls: 0,
        chatroomCalls: 0,
        profileCalls: 0,
    };
    let hasTokens = true;
    let channelsGate = null;
    let chatroomGate = null;
    let profileGate = null;
    let channelsResponse = [];
    let chatroomResponse = null;
    let profileResponse = null;

    const config = {
        get: (key) => values[key],
        set: (patch) => Object.assign(values, patch),
    };
    const logging = {
        logDebug() {},
        logInfo() {},
        logWarn() {},
        logError() {},
    };
    const kickClient = {
        hasTokens: () => hasTokens,
        getValidAccessToken: async () => true,
        async getChannels() {
            effects.channelsCalls += 1;
            return channelsGate ? channelsGate.promise : channelsResponse;
        },
        async findChatroom() {
            effects.chatroomCalls += 1;
            return chatroomGate ? chatroomGate.promise : chatroomResponse;
        },
        async getUserProfile() {
            effects.profileCalls += 1;
            return profileGate ? profileGate.promise : profileResponse;
        },
        clearTokens() {
            hasTokens = false;
            for (const key of [
                "kickAccessToken",
                "kickRefreshToken",
                "kickExpiresAt",
                "username",
                "userId",
                "chatroomId",
            ]) {
                delete values[key];
            }
        },
    };
    const listener = {
        isListening: false,
        listenToChat() {
            effects.listening += 1;
        },
        stopListeningToChat() {
            effects.stopped += 1;
        },
        sendKickMessage: async () => {},
        startKickTokenAutoRefresh() {
            effects.refreshStarts += 1;
        },
        stopKickTokenAutoRefresh() {
            effects.refreshStops += 1;
        },
    };
    const ipc = {
        listeners: new Map(),
        handlers: new Map(),
        on(channel, fn) {
            const list = this.listeners.get(channel) || [];
            list.push(fn);
            this.listeners.set(channel, list);
        },
        handle(channel, fn) {
            this.handlers.set(channel, fn);
        },
        removeAllListeners(channel) {
            this.listeners.delete(channel);
        },
    };
    const electron = {
        ipcMain: ipc,
        BrowserWindow: {
            fromWebContents: () => ({
                webContents: {},
                isDestroyed: () => false,
                show() {},
                focus() {},
            }),
        },
    };
    const stubs = {
        electron,
        "@/core/config": { __esModule: true, default: config },
        "@/core/logging": logging,
        "@/core/logging/utils": { redactSecrets: (value) => value },
        "@/features/kick/auth/server": {
            startKickAuthServer: async () => {},
            openKickAuthUrl() {},
            stopKickAuthServer() {},
        },
        "@/features/kick/chat/listener": listener,
        "@/features/kick/api/client": { kickClient },
        "@/shared/utils/windowSend": {
            sendToWindowIfAlive() {
                return true;
            },
        },
    };

    await withStubs(stubs, async () => {
        load("src/features/kick/ipc/handlers.ts");
        const checkAuth = ipc.handlers.get("kick:checkAuth");
        const logout = (ipc.listeners.get("kick:logout") || [])[0];
        assert.equal(typeof checkAuth, "function");
        assert.equal(typeof logout, "function");

        channelsGate = deferred();
        const statusPromise = checkAuth({ sender: {} });
        await waitFor(
            () => effects.channelsCalls === 1,
            "checkAuth to await getChannels"
        );

        logout({ sender: {} });
        assert.equal(values.kickAccessToken, undefined);
        assert.equal(values.username, undefined);
        assert.equal(values.chatroomId, undefined);

        channelsGate.resolve([
            { slug: "dummy-late-channel", broadcaster_user_id: 4242 },
        ]);
        const result = await statusPromise;

        assert.equal(values.username, undefined);
        assert.equal(values.userId, undefined);
        assert.equal(values.chatroomId, undefined);
        assert.equal(effects.listening, 0);
        assert.equal(effects.refreshStarts, 0);
        assert.notEqual(result?.authenticated, true);
    });
});

test("kick:findChatroom cannot write a late identity after kick:logout", async () => {
    const values = {
        kickClientId: "dummy-client-id",
        kickClientSecret: "dummy-client-secret",
    };
    const effects = {
        chatroomCalls: 0,
        profileCalls: 0,
    };
    let hasTokens = true;
    const findGate = deferred();
    const profileGate = deferred();
    const config = {
        get: (key) => values[key],
        set: (patch) => Object.assign(values, patch),
    };
    const logging = {
        logDebug() {},
        logInfo() {},
        logWarn() {},
        logError() {},
    };
    const kickClient = {
        hasTokens: () => hasTokens,
        getValidAccessToken: async () => true,
        async getChannels() {
            return [{ slug: "unused", broadcaster_user_id: 1 }];
        },
        async findChatroom() {
            effects.chatroomCalls += 1;
            return findGate.promise;
        },
        async getUserProfile() {
            effects.profileCalls += 1;
            return profileGate.promise;
        },
        clearTokens() {
            hasTokens = false;
            for (const key of [
                "kickAccessToken",
                "kickRefreshToken",
                "kickExpiresAt",
                "username",
                "userId",
                "chatroomId",
            ]) {
                delete values[key];
            }
        },
    };
    const listener = {
        isListening: false,
        listenToChat() {},
        stopListeningToChat() {},
        sendKickMessage: async () => {},
        startKickTokenAutoRefresh() {},
        stopKickTokenAutoRefresh() {},
    };
    const ipc = {
        listeners: new Map(),
        handlers: new Map(),
        on(channel, fn) {
            const list = this.listeners.get(channel) || [];
            list.push(fn);
            this.listeners.set(channel, list);
        },
        handle(channel, fn) {
            this.handlers.set(channel, fn);
        },
        removeAllListeners(channel) {
            this.listeners.delete(channel);
        },
    };
    const electron = {
        ipcMain: ipc,
        BrowserWindow: {
            fromWebContents: () => ({
                webContents: {},
                isDestroyed: () => false,
                show() {},
                focus() {},
            }),
        },
    };
    const stubs = {
        electron,
        "@/core/config": { __esModule: true, default: config },
        "@/core/logging": logging,
        "@/core/logging/utils": { redactSecrets: (value) => value },
        "@/features/kick/auth/server": {
            startKickAuthServer: async () => {},
            openKickAuthUrl() {},
            stopKickAuthServer() {},
        },
        "@/features/kick/chat/listener": listener,
        "@/features/kick/api/client": { kickClient },
        "@/shared/utils/windowSend": {
            sendToWindowIfAlive() {
                return true;
            },
        },
    };

    await withStubs(stubs, async () => {
        load("src/features/kick/ipc/handlers.ts");
        const findChatroom = ipc.handlers.get("kick:findChatroom");
        const logout = (ipc.listeners.get("kick:logout") || [])[0];
        assert.equal(typeof findChatroom, "function");
        assert.equal(typeof logout, "function");

        const resultPromise = findChatroom(
            { sender: {} },
            { username: "dummy-late-channel" }
        );
        await waitFor(
            () => effects.chatroomCalls === 1,
            "findChatroom to await the chatroom lookup"
        );
        findGate.resolve({ chatroomId: "dummy-new-room" });
        await waitFor(
            () => effects.profileCalls === 1,
            "findChatroom to await the profile lookup"
        );

        logout({ sender: {} });
        profileGate.resolve({ broadcaster_user_id: 4242 });
        const result = await resultPromise;

        assert.equal(result, null);
        assert.equal(values.username, undefined);
        assert.equal(values.userId, undefined);
        assert.equal(values.chatroomId, undefined);
    });
});

test("kick:checkAuth still succeeds normally when no logout occurs", async () => {
    const values = {
        kickClientId: "dummy-client-id",
        kickClientSecret: "dummy-client-secret",
        kickAccessToken: "dummy-access",
        kickRefreshToken: "dummy-refresh",
        kickExpiresAt: Date.now() + 3600000,
    };
    const effects = {
        listening: 0,
        refreshStarts: 0,
    };
    const config = {
        get: (key) => values[key],
        set: (patch) => Object.assign(values, patch),
    };
    const logging = {
        logDebug() {},
        logInfo() {},
        logWarn() {},
        logError() {},
    };
    const kickClient = {
        hasTokens: () => true,
        getValidAccessToken: async () => true,
        async getChannels() {
            return [{ slug: "normal-channel", broadcaster_user_id: 123 }];
        },
        async findChatroom() {
            return { chatroomId: "normal-room" };
        },
        async getUserProfile() {
            return { broadcaster_user_id: 123 };
        },
        clearTokens() {},
    };
    const listener = {
        isListening: false,
        listenToChat() {
            effects.listening += 1;
        },
        stopListeningToChat() {},
        sendKickMessage: async () => {},
        startKickTokenAutoRefresh() {
            effects.refreshStarts += 1;
        },
        stopKickTokenAutoRefresh() {},
    };
    const ipc = {
        listeners: new Map(),
        handlers: new Map(),
        on(channel, fn) {
            const list = this.listeners.get(channel) || [];
            list.push(fn);
            this.listeners.set(channel, list);
        },
        handle(channel, fn) {
            this.handlers.set(channel, fn);
        },
        removeAllListeners(channel) {
            this.listeners.delete(channel);
        },
    };
    const electron = {
        ipcMain: ipc,
        BrowserWindow: {
            fromWebContents: () => ({
                webContents: {},
                isDestroyed: () => false,
                show() {},
                focus() {},
            }),
        },
    };
    const stubs = {
        electron,
        "@/core/config": { __esModule: true, default: config },
        "@/core/logging": logging,
        "@/core/logging/utils": { redactSecrets: (value) => value },
        "@/features/kick/auth/server": {
            startKickAuthServer: async () => {},
            openKickAuthUrl() {},
            stopKickAuthServer() {},
        },
        "@/features/kick/chat/listener": listener,
        "@/features/kick/api/client": { kickClient },
        "@/shared/utils/windowSend": {
            sendToWindowIfAlive() {
                return true;
            },
        },
    };

    await withStubs(stubs, async () => {
        load("src/features/kick/ipc/handlers.ts");
        const checkAuth = ipc.handlers.get("kick:checkAuth");
        assert.equal(typeof checkAuth, "function");

        const result = await checkAuth({ sender: {} });

        assert.equal(result.authenticated, true);
        assert.equal(result.username, "normal-channel");
        assert.equal(values.username, "normal-channel");
        assert.equal(values.userId, "123");
        assert.equal(values.chatroomId, "normal-room");
        assert.equal(effects.listening, 1);
        assert.equal(effects.refreshStarts, 1);
    });
});
