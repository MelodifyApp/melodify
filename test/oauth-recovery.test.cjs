"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

const root = path.resolve(__dirname, "..");
const originalLoad = Module._load;
const originalResolve = Module._resolveFilename;

function resolveAlias(request) {
    return request.startsWith("@/")
        ? path.join(root, "src", request.slice(2))
        : request;
}

function load(stubs, relativePath) {
    Module._resolveFilename = function (request, ...args) {
        return originalResolve.call(this, resolveAlias(request), ...args);
    };
    Module._load = function (request, parent, isMain) {
        if (Object.prototype.hasOwnProperty.call(stubs, request)) {
            return stubs[request];
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        const resolved = require.resolve(path.join(root, relativePath));
        delete require.cache[resolved];
        return require(resolved);
    } finally {
        Module._resolveFilename = originalResolve;
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

function configStub(values, writes = []) {
    return {
        get: (key) => values[key],
        set(data) {
            writes.push(data);
            Object.assign(values, data);
        },
    };
}

function expressStub(capture) {
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
                    capture.closes = (capture.closes || 0) + 1;
                },
                on(event, handler) {
                    if (event === "error") {
                        capture.errorHandler = handler;
                        if (
                            capture.listenMode === "error" &&
                            !capture.errorScheduled
                        ) {
                            capture.errorScheduled = true;
                            queueMicrotask(() =>
                                handler(new Error("EADDRINUSE"))
                            );
                        }
                    }
                },
            };
            capture.servers.push(server);
            if (capture.listenMode !== "error" && callback) callback();
            return server;
        },
    });
}

function kickServerHarness(flowStore) {
    const values = {
        kickClientId: "client-id",
        kickRedirectUri: "http://localhost:8889/callback",
    };
    const capture = {
        url: null,
        exchange: [],
        sends: [],
        closes: 0,
        servers: [],
        listenCalls: 0,
        emits: [],
    };
    const writes = [];
    const client = {
        exchangeCodeForTokens: async (code, verifier) => {
            capture.exchange.push([code, verifier]);
            return true;
        },
        getChannels: async () => [
            { slug: "sample", broadcaster_user_id: 1 },
        ],
        findChatroom: async () => ({ chatroomId: "123" }),
    };
    const loaded = load(
        {
            express: expressStub(capture),
            electron: {
                BrowserWindow: {},
                shell: {
                    openExternal: (url) => {
                        capture.url = url;
                    },
                },
                ipcMain: {
                    emit: (channel) => capture.emits.push(channel),
                },
            },
            "@/core/config": {
                __esModule: true,
                default: configStub(values, writes),
            },
            "@/core/logging": {
                logInfo() {},
                logError() {},
                logDebug() {},
                logWarn() {},
            },
            "@/core/logging/utils": { redactSecrets: (value) => value },
            "@/shared/utils/pkce": {
                generateCodeVerifier: () => "kick-verifier",
                generateCodeChallenge: () => "kick-challenge",
            },
            "@/shared/utils/oauthFlowStore": {
                oauthFlows: flowStore,
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
        },
        "src/features/kick/auth/server.ts"
    );
    return { ...loaded, capture, values, writes, client };
}

function twitchServerHarness(flowStore, options = {}) {
    const values = {
        twitchClientId: "client-id",
        twitchClientSecret: "client-secret",
        ...(options.values || {}),
    };
    const capture = {
        url: null,
        updates: [],
        sends: [],
        closes: 0,
        servers: [],
        listenCalls: 0,
        fetchCalls: [],
        tokenBodies: [],
        emits: [],
    };
    const writes = [];
    const user = options.user || {
        id: "new-broadcaster-id",
        login: "new-name",
    };
    const realFetch = global.fetch;
    const config = configStub(values, writes);
    global.fetch = async (url, init = {}) => {
        capture.fetchCalls.push(String(url));
        if (String(url).includes("oauth2/token")) {
            if (typeof init.body === "string") {
                capture.tokenBodies.push(JSON.parse(init.body));
            }
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
            json: async () => ({ data: [user] }),
        };
    };
    const loaded = load(
        {
            express: expressStub(capture),
            electron: {
                BrowserWindow: {},
                shell: {
                    openExternal: (url) => {
                        capture.url = url;
                    },
                },
                ipcMain: {
                    emit: (channel) => capture.emits.push(channel),
                },
            },
            "@/core/config": {
                __esModule: true,
                default: config,
            },
            "@/core/logging": {
                logInfo() {},
                logError() {},
                logDebug() {},
                logWarn() {},
            },
            "@/core/logging/utils": { redactSecrets: (value) => value },
            "@/shared/utils/pkce": {
                generateCodeVerifier: () => "twitch-verifier",
                generateCodeChallenge: () => "twitch-challenge",
            },
            "@/shared/utils/oauthFlowStore": {
                oauthFlows: flowStore,
            },
            "@/shared/constants": {
                TWITCH_REDIRECT_URI: "http://localhost:8890/callback",
            },
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
        },
        "src/features/twitch/auth/server.ts"
    );
    return {
        ...loaded,
        capture,
        values,
        writes,
        config,
        restoreFetch: () => {
            global.fetch = realFetch;
        },
    };
}

const flowStoreModule =
    require("../src/shared/utils/oauthFlowStore");

test("provider PKCE flows are isolated, state-bound, single-use and expiring", () => {
    let now = 1000;
    const store = flowStoreModule.createOAuthFlowStore({
        now: () => now,
        defaultTtlMs: 500,
    });
    const kick = store.begin("kick", {
        state: "kick-state",
        codeVerifier: "kick-verifier",
    });
    const twitch = store.begin("twitch", {
        state: "twitch-state",
        codeVerifier: "twitch-verifier",
    });
    assert.notEqual(kick.state, twitch.state);

    assert.equal(store.take("kick", "wrong-state"), "mismatch");
    assert.equal(store.peek("kick").codeVerifier, "kick-verifier");
    assert.deepEqual(store.take("kick", "kick-state"), {
        status: "ok",
        flow: kick,
    });
    assert.equal(store.take("kick", "kick-state"), "missing");
    assert.equal(store.peek("twitch").codeVerifier, "twitch-verifier");
    assert.deepEqual(store.take("twitch", "twitch-state"), {
        status: "ok",
        flow: twitch,
    });

    for (const order of [
        ["kick", "twitch"],
        ["twitch", "kick"],
    ]) {
        const ordered = flowStoreModule.createOAuthFlowStore({
            now: () => now,
            defaultTtlMs: 500,
        });
        const flows = {
            kick: ordered.begin("kick", {
                state: "ordered-kick",
                codeVerifier: "ordered-kick-verifier",
            }),
            twitch: ordered.begin("twitch", {
                state: "ordered-twitch",
                codeVerifier: "ordered-twitch-verifier",
            }),
        };
        for (const provider of order) {
            const result = ordered.take(provider, flows[provider].state);
            assert.equal(result.status, "ok");
            assert.equal(result.flow.codeVerifier, flows[provider].codeVerifier);
        }
    }

    const expiring = store.begin("kick", {
        state: "expiring",
        codeVerifier: "expiring-verifier",
    });
    now += 501;
    assert.equal(store.take("kick", expiring.state), "expired");
    assert.equal(store.peek("kick"), null);

    store.begin("twitch", {
        state: "cancel-me",
        codeVerifier: "cancel-verifier",
    });
    store.cancel("twitch");
    assert.equal(store.peek("twitch"), null);
});

test("Kick and Twitch complete both flow orders with separate verifiers", async () => {
    for (const order of [
        ["kick", "twitch"],
        ["twitch", "kick"],
    ]) {
        const flowStore = flowStoreModule.createOAuthFlowStore();
        const kick = kickServerHarness(flowStore);
        const twitch = twitchServerHarness(flowStore);
        try {
            await kick.startKickAuthServer({});
            await twitch.startTwitchAuthServer({});
            kick.openKickAuthUrl();
            twitch.openTwitchAuthUrl();

            const states = {
                kick: new URL(kick.capture.url).searchParams.get("state"),
                twitch: new URL(twitch.capture.url).searchParams.get("state"),
            };
            assert.ok(states.kick);
            assert.ok(states.twitch);
            assert.notEqual(states.kick, states.twitch);
            assert.equal(
                kick.writes.some((write) =>
                    Object.prototype.hasOwnProperty.call(write, "codeVerifier")
                ),
                false
            );
            assert.equal(
                twitch.writes.some((write) =>
                    Object.prototype.hasOwnProperty.call(write, "codeVerifier")
                ),
                false
            );

            for (const provider of order) {
                const res = response();
                await (provider === "kick"
                    ? kick.capture.handler(
                          { query: { code: "kick-code", state: states.kick } },
                          res
                      )
                    : twitch.capture.handler(
                          {
                              query: {
                                  code: "twitch-code",
                                  state: states.twitch,
                              },
                          },
                          res
                      ));
                assert.equal(res.statusCode, 200, `${provider} should succeed`);
            }

            assert.deepEqual(kick.capture.exchange[0], [
                "kick-code",
                "kick-verifier",
            ]);
            assert.equal(twitch.capture.tokenBodies.length, 1);
            assert.equal(
                twitch.capture.tokenBodies[0].code_verifier,
                "twitch-verifier"
            );
        } finally {
            twitch.restoreFetch();
        }
    }
});

test("wrong and duplicate OAuth states do not destroy the valid pending flow", async () => {
    const flowStore = flowStoreModule.createOAuthFlowStore();
    const kick = kickServerHarness(flowStore);
    const twitch = twitchServerHarness(flowStore);
    try {
        await kick.startKickAuthServer({});
        await twitch.startTwitchAuthServer({});
        kick.openKickAuthUrl();
        twitch.openTwitchAuthUrl();
        const kickState = new URL(kick.capture.url).searchParams.get("state");
        const twitchState = new URL(twitch.capture.url).searchParams.get("state");

        const wrongKick = response();
        await kick.capture.handler(
            { query: { code: "bad", state: "attacker" } },
            wrongKick
        );
        assert.equal(wrongKick.statusCode, 400);
        assert.equal(kick.capture.exchange.length, 0);
        assert.ok(flowStore.peek("kick"));

        const wrongTwitch = response();
        await twitch.capture.handler(
            { query: { code: "bad", state: "attacker" } },
            wrongTwitch
        );
        assert.equal(wrongTwitch.statusCode, 400);
        assert.equal(twitch.capture.tokenBodies.length, 0);
        assert.ok(flowStore.peek("twitch"));

        const kickOk = response();
        await kick.capture.handler(
            { query: { code: "good", state: kickState } },
            kickOk
        );
        assert.equal(kickOk.statusCode, 200);
        assert.equal(kick.capture.exchange.length, 1);

        const duplicateKick = response();
        await kick.capture.handler(
            { query: { code: "duplicate", state: kickState } },
            duplicateKick
        );
        assert.equal(duplicateKick.statusCode, 400);
        assert.equal(kick.capture.exchange.length, 1);

        const twitchOk = response();
        await twitch.capture.handler(
            { query: { code: "good", state: twitchState } },
            twitchOk
        );
        assert.equal(twitchOk.statusCode, 200);
        assert.equal(twitch.capture.updates.length, 1);
    } finally {
        twitch.restoreFetch();
    }
});

function spotifyServerHarness(options = {}) {
    const capture = {
        grants: [],
        saves: 0,
        sends: [],
        closes: 0,
        servers: [],
        listenCalls: 0,
        listenMode: options.listenMode || "callback",
        timers: [],
    };
    const values = {
        spotifyClientId: "client-id",
        spotifyClientSecret: "client-secret",
    };
    const api = {
        authorizationCodeGrant: async (code) => {
            capture.grants.push(code);
            return {
                body: {
                    access_token: "access",
                    refresh_token: "refresh",
                    expires_in: 3600,
                },
            };
        },
        setAccessToken() {},
        setRefreshToken() {},
        getMe: async () => ({ body: { display_name: "sample" } }),
    };
    const realSetTimeout = global.setTimeout;
    const realClearTimeout = global.clearTimeout;
    global.setTimeout = (callback, delay) => {
        const timer = { callback, delay, cleared: false };
        capture.timers.push(timer);
        return timer;
    };
    global.clearTimeout = (timer) => {
        if (timer) timer.cleared = true;
    };
    const loaded = load(
        {
            express: expressStub(capture),
            electron: { BrowserWindow: {} },
            "@/core/config": {
                __esModule: true,
                default: configStub(values),
            },
            "@/core/logging": {
                logInfo() {},
                logError() {},
                logWarn() {},
                logDebug() {},
            },
            "@/core/logging/utils": { redactSecrets: (value) => value },
            "@/shared/constants": {
                SPOTIFY_REDIRECT_URI: "http://127.0.0.1:8888/callback",
            },
            "@/shared/utils/loopbackHost": require("../src/shared/utils/loopbackHost"),
            "@/features/spotify/playback/player": {
                getSpotifyApi: () => api,
                saveTokens() {
                    capture.saves += 1;
                },
                startSongFileSaving() {},
            },
            "@/shared/utils/windowSend": {
                sendToWindowIfAlive: (...args) => {
                    capture.sends.push(args);
                    return true;
                },
            },
        },
        "src/features/spotify/auth/server.ts"
    );
    return {
        ...loaded,
        capture,
        values,
        restoreTimers() {
            global.setTimeout = realSetTimeout;
            global.clearTimeout = realClearTimeout;
        },
    };
}

test("Spotify waits for its callback server and rejects a bind failure", async () => {
    const h = spotifyServerHarness({ listenMode: "error" });
    try {
        await assert.rejects(h.startSpotifyAuthServer({}));
        assert.equal(h.getSpotifyAuthState().state, "bind-error");
        assert.equal(h.getSpotifyAuthState().canRetry, true);

        h.capture.listenMode = "callback";
        h.capture.errorScheduled = false;
        const state = await h.startSpotifyAuthServer({});
        assert.equal(typeof state, "string");
        assert.equal(h.getSpotifyAuthState().state, "pending");
        h.stopSpotifyAuthServer();
    } finally {
        h.restoreTimers();
    }
});

test("Spotify timeout and cancellation close the server and allow retry", async () => {
    const h = spotifyServerHarness();
    try {
        await h.startSpotifyAuthServer({});
        const timeout = h.capture.timers.find(
            (timer) => timer.delay === 5 * 60 * 1000
        );
        assert.ok(timeout);
        timeout.callback();
        assert.equal(h.getSpotifyAuthState().state, "timeout");
        assert.equal(h.getSpotifyAuthState().canRetry, true);
        assert.ok(h.capture.closes >= 1);

        await h.startSpotifyAuthServer({});
        assert.equal(h.getSpotifyAuthState().state, "pending");
        h.stopSpotifyAuthServer();
        assert.equal(h.getSpotifyAuthState().state, "cancelled");
    } finally {
        h.restoreTimers();
    }
});

test("invalid Spotify callbacks preserve the pending flow; valid callbacks consume it", async () => {
    const h = spotifyServerHarness();
    try {
        const state = await h.startSpotifyAuthServer({});
        assert.equal(typeof state, "string");
        assert.equal(h.getSpotifyAuthState().state, "pending");

        const wrong = response();
        await h.capture.handler(
            { query: { code: "bad", state: "attacker" } },
            wrong
        );
        assert.equal(wrong.statusCode, 400);
        assert.equal(h.capture.grants.length, 0);
        assert.equal(h.getSpotifyAuthState().state, "pending");
        assert.equal(h.capture.closes, 0);

        const valid = response();
        await h.capture.handler({ query: { code: "good", state } }, valid);
        assert.equal(valid.statusCode, 200);
        assert.equal(h.capture.grants.length, 1);
        assert.equal(h.getSpotifyAuthState().state, "success");

        const duplicate = response();
        await h.capture.handler({ query: { code: "again", state } }, duplicate);
        assert.equal(duplicate.statusCode, 400);
        assert.equal(h.capture.grants.length, 1);
    } finally {
        h.restoreTimers();
    }
});

test("Spotify access denial is a retryable cancellation", async () => {
    const h = spotifyServerHarness();
    try {
        const state = await h.startSpotifyAuthServer({});
        assert.equal(typeof state, "string");

        const denied = response();
        await h.capture.handler(
            { query: { state, error: "access_denied" } },
            denied
        );
        assert.equal(denied.statusCode, 400);
        assert.equal(h.getSpotifyAuthState().state, "cancelled");
        assert.equal(h.getSpotifyAuthState().canRetry, true);

        h.capture.listenMode = "callback";
        assert.equal(typeof (await h.startSpotifyAuthServer({})), "string");
        h.stopSpotifyAuthServer();
    } finally {
        h.restoreTimers();
    }
});

function spotifyIpcHarness(startPromise) {
    const handlers = new Map();
    const openCalls = [];
    const api = {
        createAuthorizeURL: () => "https://accounts.spotify.com/authorize",
    };
    const stubs = {
        electron: {
            ipcMain: {
                on: (name, handler) => handlers.set(name, handler),
                handle: (name, handler) => handlers.set(name, handler),
            },
            BrowserWindow: {
                fromWebContents: () => ({ id: 1 }),
            },
            shell: {
                openExternal: (url) => openCalls.push(url),
            },
        },
        "ps-list": { __esModule: true, default: async () => [] },
        "child_process": { exec() {} },
        util: { promisify: () => async () => ({ stdout: "" }) },
        "@/core/config": {
            __esModule: true,
            default: configStub({
                spotifyClientId: "client-id",
                spotifyClientSecret: "client-secret",
            }),
        },
        "@/core/logging": {
            logInfo() {},
            logError() {},
            logWarn() {},
            logDebug() {},
        },
        "@/core/logging/utils": { redactSecrets: (value) => value },
        "@/shared/utils/credentialVerification": require("../src/shared/utils/credentialVerification"),
        "@/features/spotify/playback/player": {
            getSpotifyApi: () => api,
            updateSpotifyClientCredentials() {},
            checkSpotifyAccessToken: async () => true,
            startSpotifyTokenRefreshInterval: async () => {},
            stopSpotifyTokenAutoRefresh() {},
        },
        "@/features/spotify/auth/server": {
            startSpotifyAuthServer: () => startPromise.promise,
            stopSpotifyAuthServer() {},
        },
        "@/shared/utils/windowSend": { sendToWindowIfAlive: () => true },
    };
    load(stubs, "src/features/spotify/ipc/handlers.ts");
    return { handlers, openCalls };
}

test("Spotify IPC does not open the browser until the callback listener is ready", async () => {
    const gate = deferred();
    const h = spotifyIpcHarness(gate);
    const auth = h.handlers.get("spotify:auth");
    const pending = auth({ sender: {} });
    assert.deepEqual(h.openCalls, []);

    gate.resolve("state");
    await pending;
    assert.deepEqual(h.openCalls, [
        "https://accounts.spotify.com/authorize",
    ]);
});

function loadRewardSelector(values) {
    const calls = [];
    const rewards = load(
        {
            "@/core/config": {
                __esModule: true,
                default: configStub(values),
            },
            "@/core/logging": {
                logWarn() {},
            },
            "@/features/twitch/api/client": {
                twitchClient: {
                    hasTokens: () => true,
                    getValidAccessToken: async () => "access-token",
                },
            },
            "node-fetch": {
                __esModule: true,
                default: async (url) => {
                    calls.push(String(url));
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({ data: [{ title: "Song" }] }),
                    };
                },
            },
        },
        "src/features/twitch/rewards.ts"
    );
    return { rewards, calls };
}

function loadReplySelector(values) {
    const calls = [];
    const previousFetch = global.fetch;
    global.fetch = async (url, init = {}) => {
        calls.push({
            url: String(url),
            body:
                typeof init.body === "string"
                    ? JSON.parse(init.body)
                    : null,
        });
        return { status: 200, ok: true, json: async () => ({}) };
    };
    const listener = load(
        {
            ws: class FakeWebSocket {},
            "@/core/config": {
                __esModule: true,
                default: configStub(values),
            },
            "@/core/logging": {
                logInfo() {},
                logError() {},
                logWarn() {},
                logDebug() {},
            },
            "@/core/logging/utils": { redactSecrets: (value) => value },
            "@/core/commands/manager": {},
            "@/core/ipc/handlers": {
                commandManager: { handle: async () => {} },
            },
            "@/features/twitch/api/client": {
                twitchClient: {
                    getValidAccessToken: async () => "access-token",
                },
            },
            "@/core/commands/songRequest": {
                executeSongRequest: async () => {},
            },
            "@/shared/utils/windowSend": {
                sendToWindowIfAlive: () => true,
            },
        },
        "src/features/twitch/chat/listener.ts"
    );
    return {
        listener,
        calls,
        restore() {
            global.fetch = previousFetch;
        },
    };
}

test("new Twitch login replaces stale identity for reward and reply selectors", async () => {
    const flowStore = flowStoreModule.createOAuthFlowStore();
    const h = twitchServerHarness(flowStore, {
        values: {
            twitchUserId: "old-broadcaster-id",
            twitchBotUserId: "old-bot-id",
            twitchUsername: "old-name",
        },
        user: {
            id: "new-broadcaster-id",
            login: "new-name",
        },
    });
    try {
        await h.startTwitchAuthServer({});
        h.openTwitchAuthUrl();
        const state = new URL(h.capture.url).searchParams.get("state");
        const res = response();
        await h.capture.handler({ query: { code: "code", state } }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(h.values.twitchUserId, "new-broadcaster-id");
        assert.equal(h.values.twitchBotUserId, "new-broadcaster-id");
        assert.equal(h.values.twitchUsername, "new-name");

        h.restoreFetch();

        const rewards = loadRewardSelector(h.values);
        const rewardResult = await rewards.rewards.listTwitchRewardTitles();
        assert.equal(rewardResult.status, "ok");
        assert.match(
            rewards.calls[0],
            /broadcaster_id=new-broadcaster-id/
        );
        assert.doesNotMatch(rewards.calls[0], /old-broadcaster-id/);

        const replies = loadReplySelector(h.values);
        try {
            await replies.listener.sendTwitchMessage("hello");
        } finally {
            replies.restore();
        }
        assert.equal(replies.calls.length, 1);
        assert.equal(
            replies.calls[0].body.broadcaster_id,
            "new-broadcaster-id"
        );
        assert.equal(replies.calls[0].body.sender_id, "new-broadcaster-id");
    } finally {
        h.restoreFetch();
    }
});
