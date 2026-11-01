"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function load(relativePath, stubs) {
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (Object.prototype.hasOwnProperty.call(stubs, request)) {
            return stubs[request];
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        const resolved = path.join(root, relativePath);
        delete require.cache[resolved];
        return require(resolved);
    } finally {
        Module._load = originalLoad;
    }
}

function createIpc() {
    return {
        listeners: new Map(),
        handlers: new Map(),
        on(channel, handler) {
            this.listeners.set(channel, handler);
        },
        handle(channel, handler) {
            this.handlers.set(channel, handler);
        },
        removeAllListeners(channel) {
            this.listeners.delete(channel);
        },
    };
}

const logging = {
    logDebug() {},
    logInfo() {},
    logWarn() {},
    logError() {},
};

function configStub(mode) {
    const values = {};
    const writes = [];
    const config = {
        get: (key) => values[key],
        setPersisted(data) {
            if (mode === "write") throw new Error("disk write failed");
            if (mode === "load") {
                throw new Error("Config could not be loaded.");
            }
            writes.push(data);
            Object.assign(values, data);
        },
    };
    return { config, values, writes };
}

async function withSuccessfulFetch(body) {
    const realFetch = global.fetch;
    const fetchCalls = [];
    global.fetch = async (url) => {
        fetchCalls.push(String(url));
        return { ok: true, status: 200 };
    };
    try {
        return await body(fetchCalls);
    } finally {
        global.fetch = realFetch;
    }
}

function electronStub(ipc) {
    return {
        ipcMain: ipc,
        BrowserWindow: {
            fromWebContents: () => ({
                webContents: {},
                isDestroyed: () => false,
                show() {},
                focus() {},
            }),
        },
        shell: { openExternal() {} },
    };
}

function kickHarness(mode) {
    const { config, values, writes } = configStub(mode);
    const ipc = createIpc();
    load("src/features/kick/ipc/handlers.ts", {
        electron: electronStub(ipc),
        "@/core/config": { __esModule: true, default: config },
        "@/core/logging": logging,
        "@/core/logging/utils": { redactSecrets: (value) => value },
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
                hasTokens: () => false,
                clearTokens() {},
                getValidAccessToken: async () => null,
                getChannels: async () => [],
                findChatroom: async () => null,
                sendMessage: async () => {},
            },
        },
        "@/shared/utils/windowSend": {
            sendToWindowIfAlive: () => true,
        },
    });
    return {
        handler: ipc.handlers.get("kick:setSecrets"),
        values,
        writes,
    };
}

function twitchHarness(mode) {
    const { config, values, writes } = configStub(mode);
    const ipc = createIpc();
    load("src/features/twitch/ipc/handlers.ts", {
        electron: electronStub(ipc),
        "@/core/config": { __esModule: true, default: config },
        "@/core/logging": logging,
        "@/core/logging/utils": { redactSecrets: (value) => value },
        "@/features/twitch/auth/server": {
            startTwitchAuthServer: async () => {},
            openTwitchAuthUrl() {},
            stopTwitchAuthServer() {},
        },
        "@/features/twitch/chat/listener": {
            isListening: false,
            listenToChat() {},
            stopListeningToChat() {},
            sendTwitchMessage: async () => {},
        },
        "@/features/twitch/api/client": {
            twitchClient: {
                hasTokens: () => false,
                getValidAccessToken: async () => null,
                clearTokens() {},
            },
        },
        "@/shared/utils/windowSend": {
            sendToWindowIfAlive: () => true,
        },
    });
    return {
        handler: ipc.handlers.get("twitch:setSecrets"),
        values,
        writes,
    };
}

function spotifyHarness(mode) {
    const { config, values, writes } = configStub(mode);
    const ipc = createIpc();
    let resetCalls = 0;
    const player = {
        getSpotifyApi: () => ({}),
        updateSpotifyClientCredentials(clientId, clientSecret) {
            config.setPersisted({
                spotifyClientId: clientId,
                spotifyClientSecret: clientSecret,
            });
            resetCalls += 1;
        },
        checkSpotifyAccessToken: async () => true,
        startSpotifyTokenRefreshInterval: async () => {},
        stopSpotifyTokenAutoRefresh() {},
        startSongFileSaving() {},
        resetSpotifyApi() {},
    };
    load("src/features/spotify/ipc/handlers.ts", {
        electron: electronStub(ipc),
        "ps-list": { __esModule: true, default: async () => [] },
        "child_process": { exec() {} },
        util: { promisify: () => async () => ({ stdout: "" }) },
        "@/core/config": { __esModule: true, default: config },
        "@/core/logging": logging,
        "@/core/logging/utils": { redactSecrets: (value) => value },
        "@/features/spotify/playback/player": player,
        "@/features/spotify/auth/server": {
            startSpotifyAuthServer: async () => "state",
            stopSpotifyAuthServer() {},
        },
    });
    return {
        handler: ipc.handlers.get("spotify:setSecrets"),
        values,
        writes,
        getResetCalls: () => resetCalls,
    };
}

const HARNESSES = {
    kick: {
        create: kickHarness,
        payload: {
            kickClientId: "dummy-kick-id",
            kickClientSecret: "dummy-kick-secret",
        },
        keys: ["kickClientId", "kickClientSecret"],
    },
    twitch: {
        create: twitchHarness,
        payload: {
            twitchClientId: "dummy-twitch-id",
            twitchClientSecret: "dummy-twitch-secret",
        },
        keys: ["twitchClientId", "twitchClientSecret"],
    },
    spotify: {
        create: spotifyHarness,
        payload: {
            spotifyClientId: "dummy-spotify-id",
            spotifyClientSecret: "dummy-spotify-secret",
        },
        keys: ["spotifyClientId", "spotifyClientSecret"],
    },
};

for (const mode of ["write", "load"]) {
    for (const [provider, fixture] of Object.entries(HARNESSES)) {
        test(`${provider}:setSecrets returns persistence_failed on ${mode} failure`, async () => {
            await withSuccessfulFetch(async (fetchCalls) => {
                const harness = fixture.create(mode);
                const result = await harness.handler({}, fixture.payload);

                assert.deepEqual(result, {
                    success: false,
                    code: "persistence_failed",
                });
                assert.equal(fetchCalls.length, 1, "verification must succeed first");
                assert.deepEqual(harness.writes, []);
                for (const key of fixture.keys) {
                    assert.equal(harness.values[key], undefined);
                }
                if (provider === "spotify") {
                    assert.equal(
                        harness.getResetCalls(),
                        0,
                        "the old Spotify client must not be discarded on persistence failure"
                    );
                }
                assert.doesNotMatch(
                    JSON.stringify(result),
                    /disk write failed|Config could not be loaded|dummy-|secret/i
                );
            });
        });
    }
}

for (const [provider, fixture] of Object.entries(HARNESSES)) {
    test(`${provider}:setSecrets acknowledges only durable persistence`, async () => {
        await withSuccessfulFetch(async (fetchCalls) => {
            const harness = fixture.create("ok");
            const result = await harness.handler({}, fixture.payload);

            assert.deepEqual(result, { success: true });
            assert.equal(fetchCalls.length, 1, "verification must run before writing");
            assert.equal(harness.writes.length, 1);
            for (const key of fixture.keys) {
                assert.equal(harness.values[key], fixture.payload[key]);
            }
            if (provider === "spotify") {
                assert.equal(harness.getResetCalls(), 1);
            }
        });
    });
}

test("persistence_failed is a stable generic save error for the renderer", () => {
    const { credentialFailureMessageKey } = require("../src/shared/utils/credentialFailure");
    assert.equal(
        credentialFailureMessageKey("persistence_failed"),
        "common.secretsSaveError"
    );
});

test("failed credential persistence retains every renderer draft", async () => {
    const {
        saveServiceSecrets,
    } = require("../src/features/settings/secretsSave");
    for (const [provider, fixture] of Object.entries(HARNESSES)) {
        const config = { [fixture.keys[0]]: fixture.payload[fixture.keys[0]] };
        const drafts = { [fixture.keys[1]]: fixture.payload[fixture.keys[1]] };
        const result = await saveServiceSecrets(provider, config, drafts, {
            invoke: async () => ({
                success: false,
                code: "persistence_failed",
            }),
        });
        assert.equal(result.ok, false);
        assert.equal(result.error, "persistence");
        assert.deepEqual(result.drafts, drafts);
        assert.doesNotMatch(
            JSON.stringify({ ok: result.ok, error: result.error }),
            /disk write failed|Config could not be loaded|dummy-/i
        );
    }
});
