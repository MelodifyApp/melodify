"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { EventEmitter } = require("node:events");

const root = path.resolve(__dirname, "..");

function loadWithStubs(stubs, relativePath) {
    const originalLoad = Module._load;
    try {
        Module._load = function (request, parent, isMain) {
            if (Object.prototype.hasOwnProperty.call(stubs, request)) {
                return stubs[request];
            }
            return originalLoad.call(this, request, parent, isMain);
        };
        const resolved = require.resolve(path.join(root, relativePath));
        delete require.cache[resolved];
        return require(resolved);
    } finally {
        Module._load = originalLoad;
    }
}

function readSource(relativePath) {
    return require("node:fs").readFileSync(
        path.join(root, relativePath),
        "utf8"
    );
}

function jsonResponse(status, body = {}) {
    return {
        status,
        ok: status >= 200 && status < 300,
        json: async () => body,
    };
}

async function flush() {
    for (let index = 0; index < 10; index += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

function spotifyHandlerHarness() {
    const handlers = new Map();
    const state = {
        api: null,
    };
    const electron = {
        ipcMain: {
            handle(channel, handler) {
                handlers.set(channel, handler);
            },
            on() {},
            emit() {},
        },
        BrowserWindow: {
            fromWebContents: () => ({
                isDestroyed: () => false,
                webContents: {
                    isDestroyed: () => false,
                    send() {},
                },
            }),
        },
        shell: { openExternal() {} },
    };
    const config = {
        get: () => undefined,
        set() {},
    };
    const player = {
        getSpotifyApi: () => state.api,
        updateSpotifyClientCredentials() {},
        checkSpotifyAccessToken: async () => true,
        startSpotifyTokenRefreshInterval: async () => {},
        stopSpotifyTokenAutoRefresh() {},
    };
    const authServer = {
        startSpotifyAuthServer: () => null,
        stopSpotifyAuthServer() {},
    };
    loadWithStubs(
        {
            electron,
            "ps-list": async () => [],
            "@/core/config": { __esModule: true, default: config },
            "@/features/spotify/playback/player": player,
            "@/features/spotify/auth/server": authServer,
            "@/core/logging": {
                logInfo() {},
                logError() {},
                logWarn() {},
                logDebug() {},
            },
            "@/core/logging/utils": { redactSecrets: (value) => value },
        },
        "src/features/spotify/ipc/handlers.ts"
    );
    return {
        state,
        async hasSession() {
            return handlers.get("spotify:hasSession")();
        },
    };
}

test("Spotify hasSession reports provider failure separately from no active device", async () => {
    const harness = spotifyHandlerHarness();

    harness.state.api = {
        getMyDevices: async () => ({ body: { devices: [] } }),
    };
    assert.equal(await harness.hasSession(), false);

    harness.state.api = {
        getMyDevices: async () => ({
            body: { devices: [{ is_active: true }] },
        }),
    };
    assert.equal(await harness.hasSession(), true);

    harness.state.api = {
        getMyDevices: async () => {
            throw new Error("network unavailable");
        },
    };
    assert.equal(await harness.hasSession(), null);

    harness.state.api = null;
    assert.equal(await harness.hasSession(), false);
});

test("Spotify presence ticks stay truthful after ready", async () => {
    const homeConnections = require("../src/features/home/homeConnections");
    assert.equal(
        typeof homeConnections.shouldCheckSpotifyPresence,
        "function"
    );
    assert.equal(
        typeof homeConnections.readHomePresence,
        "function"
    );
    assert.equal(
        typeof homeConnections.applyPresenceReads,
        "function"
    );

    let flags = {
        spotify: {
            hasSecrets: true,
            authenticated: true,
            hasSession: true,
            error: false,
        },
        kick: {
            hasSecrets: true,
            authenticated: false,
            listening: false,
            error: false,
        },
        twitch: {
            hasSecrets: true,
            authenticated: false,
            listening: false,
            error: false,
        },
    };
    assert.equal(
        homeConnections.shouldCheckSpotifyPresence(flags),
        true,
        "a ready session must continue to be checked"
    );

    const providerTicks = [
        false,
        new Error("network unavailable"),
        null,
        true,
    ];
    let providerIndex = 0;
    const bridge = {
        invoke: async (channel) => {
            assert.equal(channel, "spotify:hasSession");
            const result = providerTicks[providerIndex];
            providerIndex += 1;
            if (result instanceof Error) throw result;
            return result;
        },
    };
    const fakeTimer = {
        callback: null,
        setInterval(callback) {
            this.callback = callback;
            return 1;
        },
        clearInterval() {},
        async tick() {
            assert.equal(typeof this.callback, "function");
            await this.callback();
        },
    };

    fakeTimer.setInterval(async () => {
        flags = homeConnections.applyPresenceReads(
            flags,
            await homeConnections.readHomePresence(bridge, flags)
        );
    });

    const expectedStates = [
        "attention",
        "unavailable",
        "unavailable",
        "connected",
    ];
    for (const expectedState of expectedStates) {
        await fakeTimer.tick();
        assert.equal(
            homeConnections.deriveHomeConnections(flags).spotify.state,
            expectedState
        );
        assert.equal(homeConnections.shouldCheckSpotifyPresence(flags), true);
    }

    flags = homeConnections.applyPresenceReads(flags, {
        spotify: { value: false, error: false },
    });
    assert.equal(
        homeConnections.deriveHomeConnections(flags).spotify.state,
        "attention"
    );
    flags.spotify.authenticated = false;
    assert.equal(homeConnections.shouldCheckSpotifyPresence(flags), false);
});

test("Home presence interval does not skip a ready Spotify session", () => {
    const source = readSource("src/features/home/useHomeConnections.ts");
    assert.doesNotMatch(source, /hasSession\s*!==\s*true/);
    assert.match(source, /readHomePresence/);
    assert.match(source, /applyPresenceReads/);
});

function twitchHarness(options = {}) {
    const sockets = [];
    const sent = [];
    const timers = [];
    const fetchCalls = [];
    let subscriptionCount = 0;

    class FakeWebSocket extends EventEmitter {
        constructor(url) {
            super();
            this.url = url;
            this.closeCalls = 0;
            sockets.push(this);
        }

        close() {
            this.closeCalls += 1;
            if (this.closeCalls === 1) {
                this.emit("close");
            }
        }
    }

    const config = {
        twitchUserId: "broadcaster-id",
        twitchBotUserId: "bot-id",
        twitchClientId: "client-id",
        twitchRewardTitle: "Song Request",
    };
    const fetchImpl =
        options.fetchImpl ||
        (async (url, init = {}) => {
            let body = null;
            if (typeof init.body === "string") {
                body = JSON.parse(init.body);
            }
            fetchCalls.push({ url, body });
            if (url.includes("oauth2/validate")) {
                return jsonResponse(200, {});
            }
            if (url.includes("eventsub/subscriptions")) {
                subscriptionCount += 1;
                return jsonResponse(202, {
                    data: [{ id: `subscription-${subscriptionCount}` }],
                });
            }
            throw new Error(`unexpected fetch ${url}`);
        });

    const originalFetch = global.fetch;
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    global.fetch = (...args) => fetchImpl(...args);
    global.setTimeout = (callback, delay) => {
        const timer = { callback, delay, cleared: false, ran: false };
        timers.push(timer);
        return timer;
    };
    global.clearTimeout = (timer) => {
        if (timer && typeof timer === "object") {
            timer.cleared = true;
        }
    };

    const listener = loadWithStubs(
        {
            ws: FakeWebSocket,
            "@/core/config": { __esModule: true, default: { get: (key) => config[key] } },
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
                sendToWindowIfAlive: (_window, channel) => {
                    sent.push(channel);
                    return true;
                },
            },
        },
        "src/features/twitch/chat/listener.ts"
    );

    return {
        listener,
        sockets,
        sent,
        timers,
        fetchCalls,
        window: {},
        emitWelcome(socket, sessionId = "session-1") {
            socket.emit(
                "message",
                Buffer.from(
                    JSON.stringify({
                        metadata: { message_type: "session_welcome" },
                        payload: { session: { id: sessionId } },
                    })
                )
            );
        },
        emitRevocation(socket) {
            socket.emit(
                "message",
                Buffer.from(
                    JSON.stringify({
                        metadata: {
                            message_type: "revocation",
                            subscription_type: "channel.chat.message",
                        },
                        payload: {},
                    })
                )
            );
        },
        runNextTimer() {
            const timer = timers.find(
                (candidate) => !candidate.cleared && !candidate.ran
            );
            assert.ok(timer, "expected a scheduled reconnect timer");
            timer.ran = true;
            timer.callback();
        },
        restore() {
            global.fetch = originalFetch;
            global.setTimeout = originalSetTimeout;
            global.clearTimeout = originalClearTimeout;
        },
    };
}

test("Twitch is not listening until both required subscriptions are accepted", async () => {
    let releaseChatSubscription;
    const chatSubscription = new Promise((resolve) => {
        releaseChatSubscription = resolve;
    });
    const harness = twitchHarness({
        fetchImpl: async (url, init = {}) => {
            if (url.includes("oauth2/validate")) {
                return jsonResponse(200, {});
            }
            if (url.includes("eventsub/subscriptions")) {
                const body =
                    typeof init.body === "string"
                        ? JSON.parse(init.body)
                        : {};
                if (body.type === "channel.chat.message") {
                    return chatSubscription;
                }
                return jsonResponse(202, {
                    data: [{ id: "reward-subscription" }],
                });
            }
            throw new Error(`unexpected fetch ${url}`);
        },
    });

    try {
        await harness.listener.listenToChat(harness.window);
        assert.equal(harness.sockets.length, 1);
        assert.equal(harness.listener.isListening, false);
        assert.equal(
            harness.listener.getTwitchReadinessState(),
            "connecting"
        );

        const socket = harness.sockets[0];
        socket.emit("open");
        assert.equal(harness.listener.isListening, false);
        harness.emitWelcome(socket);
        assert.equal(
            harness.listener.getTwitchReadinessState(),
            "subscribing"
        );
        assert.equal(harness.listener.isListening, false);
        assert.deepEqual(harness.sent, []);

        releaseChatSubscription(
            jsonResponse(202, { data: [{ id: "chat-subscription" }] })
        );
        await flush();

        assert.equal(harness.listener.isListening, true);
        assert.equal(harness.listener.getTwitchReadinessState(), "ready");
        assert.deepEqual(harness.sent, ["twitch:chatConnected"]);
    } finally {
        harness.restore();
    }
});

test("Twitch subscription failure never becomes ready and clears state", async () => {
    const harness = twitchHarness({
        fetchImpl: async (url, init = {}) => {
            if (url.includes("oauth2/validate")) {
                return jsonResponse(200, {});
            }
            if (url.includes("eventsub/subscriptions")) {
                const body =
                    typeof init.body === "string"
                        ? JSON.parse(init.body)
                        : {};
                return body.type === "channel.chat.message"
                    ? jsonResponse(202, {
                          data: [{ id: "chat-subscription" }],
                      })
                    : jsonResponse(403, { message: "denied" });
            }
            throw new Error(`unexpected fetch ${url}`);
        },
    });

    try {
        await harness.listener.listenToChat(harness.window);
        const socket = harness.sockets[0];
        socket.emit("open");
        harness.emitWelcome(socket);
        await flush();

        assert.equal(harness.listener.isListening, false);
        assert.equal(harness.listener.getTwitchReadinessState(), "error");
        assert.deepEqual(harness.sent, ["twitch:chatDisconnected"]);
        assert.equal(socket.closeCalls, 1);
        assert.equal(harness.timers.length, 0);

        const failedSocketCount = harness.sockets.length;
        await harness.listener.listenToChat(harness.window);
        assert.equal(
            harness.sockets.length,
            failedSocketCount,
            "a status refresh must not restart a terminal subscription failure"
        );
        assert.equal(harness.listener.getTwitchReadinessState(), "error");

        harness.listener.stopListeningToChat(harness.window);
        assert.equal(harness.listener.getTwitchReadinessState(), "stopped");
        await harness.listener.listenToChat(harness.window);
        assert.equal(harness.sockets.length, failedSocketCount + 1);
        assert.equal(
            harness.listener.getTwitchReadinessState(),
            "connecting"
        );
    } finally {
        harness.restore();
    }
});

test("Twitch revocation clears listening and does not stay connected", async () => {
    const harness = twitchHarness();
    try {
        await harness.listener.listenToChat(harness.window);
        const socket = harness.sockets[0];
        socket.emit("open");
        harness.emitWelcome(socket);
        await flush();
        assert.equal(harness.listener.isListening, true);
        harness.sent.length = 0;

        harness.emitRevocation(socket);
        assert.equal(harness.listener.isListening, false);
        assert.equal(harness.listener.getTwitchReadinessState(), "error");
        assert.deepEqual(harness.sent, ["twitch:chatDisconnected"]);
        assert.equal(socket.closeCalls, 1);
    } finally {
        harness.restore();
    }
});

test("Twitch stop clears connecting state before subscriptions are ready", async () => {
    let releaseChatSubscription;
    const chatSubscription = new Promise((resolve) => {
        releaseChatSubscription = resolve;
    });
    const harness = twitchHarness({
        fetchImpl: async (url, init = {}) => {
            if (url.includes("oauth2/validate")) {
                return jsonResponse(200, {});
            }
            if (url.includes("eventsub/subscriptions")) {
                const body =
                    typeof init.body === "string"
                        ? JSON.parse(init.body)
                        : {};
                return body.type === "channel.chat.message"
                    ? chatSubscription
                    : jsonResponse(202, {
                          data: [{ id: "reward-subscription" }],
                      });
            }
            throw new Error(`unexpected fetch ${url}`);
        },
    });

    try {
        await harness.listener.listenToChat(harness.window);
        const socket = harness.sockets[0];
        socket.emit("open");
        harness.emitWelcome(socket);
        assert.equal(harness.listener.isListening, false);

        harness.listener.stopListeningToChat(harness.window);
        assert.equal(harness.listener.isListening, false);
        assert.equal(harness.listener.getTwitchReadinessState(), "stopped");

        releaseChatSubscription(
            jsonResponse(202, { data: [{ id: "chat-subscription" }] })
        );
        await flush();
        assert.equal(harness.listener.isListening, false);
        assert.equal(harness.listener.getTwitchReadinessState(), "stopped");
        assert.equal(
            harness.sent.includes("twitch:chatConnected"),
            false
        );
    } finally {
        harness.restore();
    }
});

test("Twitch terminal reconnect state stops reporting ready", async () => {
    const harness = twitchHarness();
    try {
        await harness.listener.listenToChat(harness.window);
        let socket = harness.sockets[0];
        socket.emit("open");
        harness.emitWelcome(socket);
        await flush();
        assert.equal(harness.listener.isListening, true);
        harness.sent.length = 0;

        socket.emit("close");
        assert.equal(harness.listener.isListening, false);
        assert.equal(
            harness.listener.getTwitchReadinessState(),
            "reconnecting"
        );
        assert.deepEqual(harness.sent, ["twitch:chatDisconnected"]);

        for (let attempt = 0; attempt < 5; attempt += 1) {
            harness.runNextTimer();
            socket = harness.sockets[harness.sockets.length - 1];
            socket.emit("close");
            assert.equal(harness.listener.isListening, false);
        }

        assert.equal(harness.listener.getTwitchReadinessState(), "error");
        assert.equal(harness.listener.isListening, false);
        assert.equal(harness.timers.length, 5);
    } finally {
        harness.restore();
    }
});
