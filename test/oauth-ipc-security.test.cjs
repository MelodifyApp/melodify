"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

function load(stubs, relativePath) {
    const originalLoad = Module._load;
    try {
        Module._load = function (request, parent, isMain) {
            if (Object.prototype.hasOwnProperty.call(stubs, request)) {
                return stubs[request];
            }
            return originalLoad.call(this, request, parent, isMain);
        };
        const resolved = require.resolve(path.join(__dirname, "..", relativePath));
        delete require.cache[resolved];
        return require(resolved);
    } finally {
        Module._load = originalLoad;
    }
}

function response() {
    return {
        statusCode: 200,
        body: "",
        status(code) {
            this.statusCode = code;
            return this;
        },
        send(body) {
            this.body = body;
            return this;
        },
    };
}

function deferred() {
    let resolve;
    const promise = new Promise((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

function expressStub(capture, { invokeListenCallback = true } = {}) {
    return () => ({
        get(route, handler) {
            capture.handler = handler;
        },
        listen(port, host, callback) {
            if (typeof host === "function") {
                callback = host;
                host = undefined;
            }
            capture.listenCalls = (capture.listenCalls || 0) + 1;
            capture.hosts = capture.hosts || [];
            capture.hosts.push(host);
            const server = {
                close() {
                    capture.closes += 1;
                },
                on() {},
            };
            capture.servers.push(server);
            if (invokeListenCallback && callback) callback();
            return server;
        },
    });
}

function configStub(values, writes = []) {
    return {
        get: (key) => values[key],
        set: (data) => {
            writes.push(data);
            Object.assign(values, data);
        },
    };
}

function kickAuthHarness() {
    const values = {
        kickClientId: "client-id",
        kickRedirectUri: "http://localhost:8889/callback",
        codeVerifier: "verifier",
    };
    const capture = {
        url: null,
        exchange: [],
        sends: [],
        closes: 0,
        servers: [],
        listenCalls: 0,
    };
    const writes = [];
    const client = {
        exchangeCodeForTokens: async (...args) => {
            capture.exchange.push(args);
            return true;
        },
        getChannels: async () => [{ slug: "sample", broadcaster_user_id: 1 }],
        findChatroom: async () => ({ chatroomId: "123" }),
    };
    const stubs = {
        express: expressStub(capture),
        electron: {
            BrowserWindow: {},
            shell: { openExternal: (url) => { capture.url = url; } },
            ipcMain: { emit() {} },
        },
        "@/core/config": { __esModule: true, default: configStub(values, writes) },
        "@/core/logging": { logInfo() {}, logError() {}, logDebug() {} },
        "@/core/logging/utils": { redactSecrets: (value) => value },
        "@/shared/utils/pkce": {
            generateCodeVerifier: () => "verifier",
            generateCodeChallenge: () => "challenge",
        },
        "@/shared/utils/loopbackHost": require("../src/shared/utils/loopbackHost"),
        "@/features/kick/chat/listener": { listenToChat() {} },
        "@/features/kick/api/client": { kickClient: client },
        "@/shared/utils/windowSend": {
            sendToWindowIfAlive: (...args) => {
                capture.sends.push(args);
                return true;
            },
        },
    };
    return { ...load(stubs, "src/features/kick/auth/server.ts"), capture, values, writes, client };
}

function twitchAuthHarness(options = {}) {
    const values = {
        twitchClientId: "client-id",
        twitchClientSecret: "client-secret",
        codeVerifier: "verifier",
    };
    const capture = {
        url: null,
        updates: [],
        sends: [],
        closes: 0,
        servers: [],
        listenCalls: 0,
        fetchCalls: [],
    };
    const realFetch = global.fetch;
    global.fetch = async (url, init) => {
        capture.fetchCalls.push(String(url));
        if (String(url).includes("oauth2/token")) {
            if (options.tokenGate) await options.tokenGate.promise;
            return {
                ok: true,
                json: async () => ({
                    access_token: "access",
                    refresh_token: "refresh",
                    expires_in: 3600,
                }),
            };
        }
        return {
            ok: true,
            json: async () => ({ data: [{ id: "bot-id", login: "sample" }] }),
        };
    };
    const stubs = {
        express: expressStub(capture),
        electron: {
            BrowserWindow: {},
            shell: { openExternal: (url) => { capture.url = url; } },
            ipcMain: { emit() {} },
        },
        "@/core/config": { __esModule: true, default: configStub(values) },
        "@/core/logging": { logInfo() {}, logError() {}, logDebug() {} },
        "@/core/logging/utils": { redactSecrets: (value) => value },
        "@/shared/utils/pkce": {
            generateCodeVerifier: () => "verifier",
            generateCodeChallenge: () => "challenge",
        },
        "@/shared/constants": { TWITCH_REDIRECT_URI: "http://localhost:8890/callback" },
        "@/shared/utils/loopbackHost": require("../src/shared/utils/loopbackHost"),
        "@/features/twitch/chat/listener": { listenToChat() {} },
        "@/features/twitch/api/client": {
            twitchClient: {
                updateTokens(tokens) {
                    capture.updates.push(tokens);
                },
            },
        },
        "@/shared/utils/windowSend": {
            sendToWindowIfAlive: (...args) => {
                capture.sends.push(args);
                return true;
            },
        },
    };
    const loaded = load(stubs, "src/features/twitch/auth/server.ts");
    return { ...loaded, capture, values, restoreFetch: () => { global.fetch = realFetch; } };
}

function spotifyAuthHarness(options = {}) {
    const values = {
        spotifyClientId: "client-id",
        spotifyClientSecret: "client-secret",
    };
    const capture = {
        grants: [],
        saves: 0,
        sends: [],
        closes: 0,
        servers: [],
        listenCalls: 0,
    };
    const api = {
        authorizationCodeGrant: async (code) => {
            capture.grants.push(code);
            if (options.grantGate) await options.grantGate.promise;
            return {
                body: { access_token: "access", refresh_token: "refresh", expires_in: 3600 },
            };
        },
        setAccessToken() {},
        setRefreshToken() {},
        getMe: async () => ({ body: { display_name: "sample" } }),
    };
    const stubs = {
        express: expressStub(capture, { invokeListenCallback: false }),
        electron: { BrowserWindow: {} },
        "@/core/config": { __esModule: true, default: configStub(values) },
        "@/core/logging": { logInfo() {}, logError() {}, logWarn() {}, logDebug() {} },
        "@/core/logging/utils": { redactSecrets: (value) => value },
        "@/shared/constants": { SPOTIFY_REDIRECT_URI: "http://127.0.0.1:8888/callback" },
        "@/shared/utils/loopbackHost": require("../src/shared/utils/loopbackHost"),
        "@/features/spotify/playback/player": {
            getSpotifyApi: () => api,
            saveTokens() {
                capture.saves += 1;
            },
        },
        "@/shared/utils/windowSend": {
            sendToWindowIfAlive: (...args) => {
                capture.sends.push(args);
                return true;
            },
        },
    };
    return { ...load(stubs, "src/features/spotify/auth/server.ts"), capture, values, api };
}

test("Kick callback rejects a mismatched OAuth state before exchanging the code", async () => {
    const harness = kickAuthHarness();
    await harness.startKickAuthServer({});
    harness.openKickAuthUrl();
    const state = new URL(harness.capture.url).searchParams.get("state");
    assert.ok(state, "authorization URL must include a state");

    const res = response();
    await harness.capture.handler(
        { query: { code: "code", state: "attacker-state" } },
        res
    );
    assert.equal(res.statusCode, 400);
    assert.equal(harness.capture.exchange.length, 0);
});

test("Kick callback accepts the matching OAuth state", async () => {
    const harness = kickAuthHarness();
    await harness.startKickAuthServer({});
    harness.openKickAuthUrl();
    const state = new URL(harness.capture.url).searchParams.get("state");

    const res = response();
    await harness.capture.handler({ query: { code: "code", state } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(harness.capture.exchange.length, 1);
});

test("Twitch callback rejects a mismatched OAuth state before token exchange", async () => {
    const harness = twitchAuthHarness();
    try {
        await harness.startTwitchAuthServer({});
        harness.openTwitchAuthUrl();
        const state = new URL(harness.capture.url).searchParams.get("state");
        assert.ok(state);

        const res = response();
        await harness.capture.handler(
            { query: { code: "code", state: "attacker-state" } },
            res
        );
        assert.equal(res.statusCode, 400);
        assert.equal(harness.capture.fetchCalls.length, 0);
    } finally {
        harness.restoreFetch();
    }
});

test("Twitch callback accepts the matching OAuth state", async () => {
    const harness = twitchAuthHarness();
    try {
        await harness.startTwitchAuthServer({});
        harness.openTwitchAuthUrl();
        const state = new URL(harness.capture.url).searchParams.get("state");

        const res = response();
        await harness.capture.handler({ query: { code: "code", state } }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(harness.capture.updates.length, 1);
    } finally {
        harness.restoreFetch();
    }
});

test("Spotify callback rejects a mismatched OAuth state before the grant", () => {
    const harness = spotifyAuthHarness();
    const state = harness.startSpotifyAuthServer({});
    assert.equal(typeof state, "string", "server must return the expected state");

    const res = response();
    return harness.capture.handler(
        { query: { code: "code", state: "attacker-state" } },
        res
    ).then(() => {
        assert.equal(res.statusCode, 400);
        assert.equal(harness.capture.grants.length, 0);
    });
});

test("Spotify auth start is idempotent while a server is already running", () => {
    const harness = spotifyAuthHarness();
    harness.startSpotifyAuthServer({});
    harness.startSpotifyAuthServer({});
    assert.equal(harness.capture.listenCalls, 1);
});

test("callback servers bind to the loopback host from their redirect URI", async () => {
    const kick = kickAuthHarness();
    await kick.startKickAuthServer({});
    assert.equal(kick.capture.hosts[0], "localhost");

    const twitch = twitchAuthHarness();
    try {
        await twitch.startTwitchAuthServer({});
        assert.equal(twitch.capture.hosts[0], "localhost");
    } finally {
        twitch.restoreFetch();
    }

    const spotify = spotifyAuthHarness();
    spotify.startSpotifyAuthServer({});
    assert.equal(spotify.capture.hosts[0], "127.0.0.1");
});

test("Kick callback completing after logout cannot announce authentication", async () => {
    let releaseExchange;
    const harness = kickAuthHarness();
    harness.client.exchangeCodeForTokens = async () => {
        await new Promise((resolve) => {
            releaseExchange = resolve;
        });
        return true;
    };

    await harness.startKickAuthServer({});
    harness.openKickAuthUrl();
    const state = new URL(harness.capture.url).searchParams.get("state");

    const res = response();
    const callback = harness.capture.handler(
        { query: { code: "code", state } },
        res
    );
    harness.stopKickAuthServer();
    releaseExchange();
    await callback;

    assert.equal(res.statusCode, 409);
    assert.equal(
        harness.capture.sends.some((args) => args[1] === "kick:authenticated"),
        false
    );
});

test("Twitch callback completing after logout cannot save or announce authentication", async () => {
    const gate = deferred();
    const harness = twitchAuthHarness({ tokenGate: gate });
    try {
        await harness.startTwitchAuthServer({});
        harness.openTwitchAuthUrl();
        const state = new URL(harness.capture.url).searchParams.get("state");

        const res = response();
        const callback = harness.capture.handler(
            { query: { code: "code", state } },
            res
        );
        harness.stopTwitchAuthServer();
        gate.resolve();
        await callback;

        assert.equal(res.statusCode, 409);
        assert.equal(harness.capture.updates.length, 0);
        assert.equal(
            harness.capture.sends.some((args) => args[1] === "twitch:authenticated"),
            false
        );
    } finally {
        harness.restoreFetch();
    }
});

test("Spotify callback completing after logout cannot save or announce authentication", async () => {
    const gate = deferred();
    const harness = spotifyAuthHarness({ grantGate: gate });
    const state = harness.startSpotifyAuthServer({});

    const res = response();
    const callback = harness.capture.handler(
        { query: { code: "code", state } },
        res
    );
    harness.stopSpotifyAuthServer();
    gate.resolve();
    await callback;

    assert.equal(res.statusCode, 409);
    assert.equal(harness.capture.saves, 0);
    assert.equal(
        harness.capture.sends.some((args) => args[1] === "spotify:authenticated"),
        false
    );
});

function kickIpcHarness() {
    const handlers = new Map();
    const writes = [];
    const stops = { auth: 0 };
    const stubs = {
        electron: {
            ipcMain: {
                on: (name, handler) => handlers.set(name, handler),
                handle: (name, handler) => handlers.set(name, handler),
            },
            BrowserWindow: { fromWebContents: () => undefined },
        },
        "@/core/config": {
            __esModule: true,
            default: configStub({}, writes),
        },
        "@/core/logging": { logInfo() {}, logError() {}, logWarn() {}, logDebug() {} },
        "@/core/logging/utils": { redactSecrets: (value) => value },
        "@/features/kick/auth/server": {
            startKickAuthServer: async () => {},
            openKickAuthUrl() {},
            stopKickAuthServer() {
                stops.auth += 1;
            },
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
        "@/shared/utils/windowSend": { sendToWindowIfAlive: () => true },
    };
    load(stubs, "src/features/kick/ipc/handlers.ts");
    return { handlers, writes, stops };
}

function twitchIpcHarness() {
    const handlers = new Map();
    const writes = [];
    const stops = { auth: 0 };
    const stubs = {
        electron: {
            ipcMain: {
                on: (name, handler) => handlers.set(name, handler),
                handle: (name, handler) => handlers.set(name, handler),
            },
            BrowserWindow: { fromWebContents: () => undefined },
        },
        "@/core/config": { __esModule: true, default: configStub({}, writes) },
        "@/core/logging": { logInfo() {}, logError() {}, logWarn() {}, logDebug() {} },
        "@/core/logging/utils": { redactSecrets: (value) => value },
        "@/features/twitch/auth/server": {
            startTwitchAuthServer: async () => {},
            openTwitchAuthUrl() {},
            stopTwitchAuthServer() {
                stops.auth += 1;
            },
        },
        "@/features/twitch/chat/listener": {
            isListening: false,
            listenToChat() {},
            stopListeningToChat() {},
            sendTwitchMessage: async () => {},
        },
        "@/features/twitch/api/client": {
            twitchClient: {
                hasTokens: () => true,
                getValidAccessToken: async () => "token",
                clearTokens() {},
            },
        },
        "@/shared/utils/windowSend": { sendToWindowIfAlive: () => true },
    };
    load(stubs, "src/features/twitch/ipc/handlers.ts");
    return { handlers, writes, stops };
}

function spotifyIpcHarness() {
    const handlers = new Map();
    const writes = [];
    const stops = { auth: 0 };
    const credentials = [];
    const api = { setAccessToken() {}, setRefreshToken() {} };
    const realFetch = global.fetch;
    const fetchCalls = [];
    global.fetch = async (url) => {
        fetchCalls.push(String(url));
        return { ok: true, json: async () => ({ access_token: "token" }) };
    };
    const stubs = {
        electron: {
            ipcMain: {
                on: (name, handler) => handlers.set(name, handler),
                handle: (name, handler) => handlers.set(name, handler),
            },
            BrowserWindow: { fromWebContents: () => undefined },
            shell: { openExternal() {} },
        },
        "ps-list": { __esModule: true, default: async () => [] },
        "child_process": { exec() {} },
        util: { promisify: () => async () => ({ stdout: "" }) },
        "@/core/config": { __esModule: true, default: configStub({}, writes) },
        "@/core/logging": { logInfo() {}, logError() {}, logWarn() {}, logDebug() {} },
        "@/core/logging/utils": { redactSecrets: (value) => value },
        "@/features/spotify/playback/player": {
            getSpotifyApi: () => api,
            updateSpotifyClientCredentials: (id, secret) => credentials.push([id, secret]),
            checkSpotifyAccessToken: async () => true,
            startSpotifyTokenRefreshInterval: async () => {},
            stopSpotifyTokenAutoRefresh() {},
        },
        "@/features/spotify/auth/server": {
            startSpotifyAuthServer: () => "state",
            stopSpotifyAuthServer() {
                stops.auth += 1;
            },
        },
        "@/shared/utils/windowSend": { sendToWindowIfAlive: () => true },
    };
    load(stubs, "src/features/spotify/ipc/handlers.ts");
    return {
        handlers,
        writes,
        stops,
        credentials,
        fetchCalls,
        restoreFetch: () => {
            global.fetch = realFetch;
        },
    };
}

test("kick:setSecrets ignores malformed payloads and writes only credentials", async () => {
    const harness = kickIpcHarness();
    const handler = harness.handlers.get("kick:setSecrets");
    await assert.doesNotReject(async () => handler({}, null));
    await assert.doesNotReject(async () =>
        handler({}, { kickClientId: " id ", kickClientSecret: " secret ", canAnyonePlaySong: true })
    );
    assert.deepEqual(harness.writes, [
        { kickClientId: "id", kickClientSecret: "secret" },
    ]);
});

test("twitch:setSecrets ignores malformed payloads and writes only credentials", async () => {
    const harness = twitchIpcHarness();
    const handler = harness.handlers.get("twitch:setSecrets");
    await assert.doesNotReject(async () => handler({}, null));
    await assert.doesNotReject(async () =>
        handler({}, { twitchClientId: " id ", twitchClientSecret: " secret ", canAnyonePlaySong: true })
    );
    assert.deepEqual(harness.writes, [
        { twitchClientId: "id", twitchClientSecret: "secret" },
    ]);
});

test("spotify:setSecrets rejects malformed payloads without throwing", async () => {
    const harness = spotifyIpcHarness();
    try {
        const handler = harness.handlers.get("spotify:setSecrets");
        const malformed = await handler({}, null);
        assert.deepEqual(malformed, {
            success: false,
            error: "Missing client ID or secret.",
        });
        assert.equal(harness.fetchCalls.length, 0);

        const valid = await handler(
            {},
            { spotifyClientId: " id ", spotifyClientSecret: " secret " }
        );
        assert.deepEqual(valid, { success: true });
        assert.deepEqual(harness.credentials, [["id", "secret"]]);
    } finally {
        harness.restoreFetch();
    }
});

test("logout stops any pending OAuth callback server", async () => {
    const kick = kickIpcHarness();
    await kick.handlers.get("kick:logout")({ sender: {} });
    assert.equal(kick.stops.auth, 1);

    const twitch = twitchIpcHarness();
    await twitch.handlers.get("twitch:logout")({ sender: {} });
    assert.equal(twitch.stops.auth, 1);

    const spotify = spotifyIpcHarness();
    try {
        await spotify.handlers.get("spotify:logout")({ sender: {} });
        assert.equal(spotify.stops.auth, 1);
    } finally {
        spotify.restoreFetch();
    }
});
