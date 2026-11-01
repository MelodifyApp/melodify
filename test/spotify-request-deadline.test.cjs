"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;

const track = {
    uri: "spotify:track:deadline-track",
    name: "Deadline track",
    artists: [{ name: "Deadline artist" }],
};

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
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

async function flush() {
    for (let index = 0; index < 10; index += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

async function waitFor(predicate, description, timeoutMs = 2000) {
    const started = Date.now();
    while (!predicate()) {
        if (Date.now() - started > timeoutMs) {
            throw new Error(`Timed out waiting for ${description}`);
        }
        await new Promise((resolve) => setImmediate(resolve));
    }
}

function fakeTimers() {
    const timers = [];
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    global.setTimeout = (callback, delay) => {
        const timer = {
            callback,
            delay,
            cleared: false,
            fired: false,
        };
        timers.push(timer);
        return timer;
    };
    global.clearTimeout = (timer) => {
        if (timer) timer.cleared = true;
    };
    return {
        timers,
        active() {
            return timers.filter((timer) => !timer.cleared && !timer.fired);
        },
        fire(timer) {
            assert.ok(timer, "expected a deadline timer");
            timer.fired = true;
            timer.callback();
        },
        restore() {
            global.setTimeout = originalSetTimeout;
            global.clearTimeout = originalClearTimeout;
        },
    };
}

function createHarness() {
    const originalFetch = global.fetch;
    const values = {
        spotifyClientId: "test-client",
        spotifyClientSecret: "test-secret",
        spotifyAccessToken: "saved-access",
        spotifyRefreshToken: "saved-refresh",
        spotifyExpiresAt: Date.now() + 3_600_000,
        canAnyonePlaySong: true,
        globalCooldownEnabled: true,
        globalCooldownSeconds: "30",
        perUserCooldownEnabled: true,
        perUserCooldownSeconds: "60",
        replyOnSongRequest: false,
        replyOnSongRequestError: false,
        replyOnCooldown: false,
    };
    const state = {
        accessToken: "saved-access",
        searchCalls: 0,
        refreshCalls: 0,
        queueCalls: 0,
        queueUris: [],
        sdkQueueCalls: 0,
        count: 0,
        searchImpl: null,
        refreshImpl: null,
        queueImpl: null,
        queueAborted: false,
        queueAbortSignal: null,
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
        logSongRequest() {},
    };
    class FakeSpotifyWebApi {
        setAccessToken(token) {
            state.accessToken = token;
        }
        setRefreshToken() {}
        getAccessToken() {
            return state.accessToken;
        }
        async searchTracks(query) {
            state.searchCalls += 1;
            if (state.searchImpl) return state.searchImpl(query);
            return { body: { tracks: { total: 1, items: [track] } } };
        }
        async getTrack() {
            return { body: track };
        }
        async addToQueue() {
            state.sdkQueueCalls += 1;
        }
        async refreshAccessToken() {
            state.refreshCalls += 1;
            if (state.refreshImpl) return state.refreshImpl();
            state.accessToken = "refreshed-access";
            return {
                body: { access_token: "refreshed-access", expires_in: 3600 },
            };
        }
    }
    const stubs = {
        "spotify-web-api-node": FakeSpotifyWebApi,
        "@/core/config": { __esModule: true, default: config },
        "@/core/logging": logging,
        "@/core/logging/utils": { redactSecrets: (value) => value },
        "@/core/ipc/handlers": {
            incrementSongRequestCount() {
                state.count += 1;
            },
        },
    };

    global.fetch = async (url, init = {}) => {
        state.queueCalls += 1;
        const uri = new URL(String(url)).searchParams.get("uri");
        state.queueUris.push(uri);
        state.queueAbortSignal = init.signal || null;
        if (state.queueImpl) return state.queueImpl(uri, init);
        return { ok: true, status: 204 };
    };

    return {
        values,
        state,
        stubs,
        async load() {
            const player = load("src/features/spotify/playback/player.ts");
            const { CommandManager } = load("src/core/commands/manager.ts");
            const { executeSongRequest } = load("src/core/commands/songRequest.ts");
            return { player, CommandManager, executeSongRequest };
        },
        restore() {
            global.fetch = originalFetch;
        },
    };
}

async function runRequest(h, executeSongRequest, manager, options = {}) {
    const outcomes = [];
    const success = await executeSongRequest(
        {
            username: "dummy-viewer",
            message: "!sr dummy",
            badges: [],
            platform: "kick",
        },
        options.query || "sample song",
        manager,
        {
            sendReply: async () => {},
            onOutcome: (outcome) => outcomes.push(outcome),
            ...options.requestOptions,
        }
    );
    return { success, outcomes };
}

function countedManager(CommandManager) {
    const manager = new CommandManager();
    const originalReserve = manager.reserveSongRequestAdmission.bind(manager);
    let releaseCalls = 0;
    let commitCalls = 0;
    manager.reserveSongRequestAdmission = (username) => {
        const admission = originalReserve(username);
        return {
            ...admission,
            commit: () => {
                if (admission.admitted) commitCalls += 1;
                admission.commit();
            },
            release: () => {
                if (admission.admitted) releaseCalls += 1;
                admission.release();
            },
        };
    };
    return {
        manager,
        get releaseCalls() {
            return releaseCalls;
        },
        get commitCalls() {
            return commitCalls;
        },
    };
}

test(
    "a stalled provider deadline releases admission once and suppresses the late queue",
    { timeout: 4000 },
    async () => {
        const h = createHarness();
        const timers = fakeTimers();
        const lateSearch = deferred();
        h.state.searchImpl = () => lateSearch.promise;
        try {
            await withStubs(h.stubs, async () => {
                const { player, CommandManager, executeSongRequest } =
                    await h.load();
                const counted = countedManager(CommandManager);
                const request = runRequest(
                    h,
                    executeSongRequest,
                    counted.manager
                );
                await waitFor(
                    () => h.state.searchCalls === 1,
                    "the stalled provider call to start"
                );
                const deadlineTimer = timers
                    .active()
                    .find(
                        (timer) =>
                            timer.delay ===
                            player.SPOTIFY_PLAYBACK_DEADLINE_MS
                    );
                assert.ok(deadlineTimer, "expected an application deadline");
                timers.fire(deadlineTimer);

                const result = await request;
                assert.equal(result.success, false);
                assert.equal(result.outcomes[0].reason, "cancelled");
                assert.equal(counted.releaseCalls, 1);
                assert.equal(counted.commitCalls, 0);
                assert.equal(h.state.count, 0);
                assert.equal(h.state.queueCalls, 0);
                assert.equal(timers.active().length, 0);

                const next = counted.manager.reserveSongRequestAdmission(
                    "dummy-viewer"
                );
                assert.equal(next.admitted, true);
                next.release();

                lateSearch.resolve({
                    body: { tracks: { total: 1, items: [track] } },
                });
                await flush();
                assert.equal(h.state.queueCalls, 0);
                assert.equal(h.state.count, 0);
            });
        } finally {
            timers.restore();
            h.restore();
        }
    }
);

test(
    "a stalled queue write is aborted without a retry or success",
    { timeout: 4000 },
    async () => {
        const h = createHarness();
        const timers = fakeTimers();
        h.state.queueImpl = (_uri, init) =>
            new Promise((_resolve, reject) => {
                const abort = () => {
                    h.state.queueAborted = true;
                    const error = new Error("request aborted");
                    error.name = "AbortError";
                    reject(error);
                };
                if (init.signal?.aborted) abort();
                else init.signal?.addEventListener("abort", abort, { once: true });
            });
        try {
            await withStubs(h.stubs, async () => {
                const { player, CommandManager, executeSongRequest } =
                    await h.load();
                const counted = countedManager(CommandManager);
                const request = runRequest(
                    h,
                    executeSongRequest,
                    counted.manager
                );
                await waitFor(
                    () => h.state.queueCalls === 1,
                    "the queue write to start"
                );
                const deadlineTimer = timers
                    .active()
                    .find(
                        (timer) =>
                            timer.delay ===
                            player.SPOTIFY_PLAYBACK_DEADLINE_MS
                    );
                assert.ok(deadlineTimer, "expected an application deadline");
                timers.fire(deadlineTimer);

                const result = await request;
                assert.equal(result.success, false);
                assert.equal(result.outcomes[0].reason, "cancelled");
                assert.equal(h.state.queueAborted, true);
                assert.equal(h.state.refreshCalls, 0);
                assert.equal(h.state.queueCalls, 1);
                assert.equal(counted.releaseCalls, 1);
                assert.equal(counted.commitCalls, 0);
                assert.equal(h.state.count, 0);
                assert.equal(timers.active().length, 0);
            });
        } finally {
            timers.restore();
            h.restore();
        }
    }
);

test("an expired token is refreshed before provider calls", async () => {
    const h = createHarness();
    const timers = fakeTimers();
    h.values.spotifyExpiresAt = Date.now() - 1000;
    try {
        await withStubs(h.stubs, async () => {
            const { executeSongRequest } = await h.load();
            const result = await runRequest(h, executeSongRequest, undefined);
            assert.equal(result.success, true);
            assert.equal(h.state.refreshCalls, 1);
            assert.equal(h.state.searchCalls, 1);
            assert.equal(h.state.queueCalls, 1);
            assert.equal(h.state.accessToken, "refreshed-access");
            assert.equal(timers.active().length, 0);
        });
    } finally {
        timers.restore();
        h.restore();
    }
});

test("a login during expiry preflight wins over the stale refresh result", async () => {
    const h = createHarness();
    const timers = fakeTimers();
    h.values.spotifyExpiresAt = Date.now() - 1000;
    try {
        await withStubs(h.stubs, async () => {
            const { player, executeSongRequest } = await h.load();
            h.state.refreshImpl = async () => {
                player.saveTokens({
                    accessToken: "preflight-login-access",
                    refreshToken: "preflight-login-refresh",
                    expiresIn: 3600,
                });
                return {
                    body: {
                        access_token: "stale-preflight-access",
                        expires_in: 3600,
                    },
                };
            };
            const result = await runRequest(h, executeSongRequest, undefined);
            assert.equal(result.success, true);
            assert.equal(h.state.refreshCalls, 1);
            assert.equal(h.state.searchCalls, 1);
            assert.equal(h.state.queueCalls, 1);
            assert.equal(
                h.values.spotifyAccessToken,
                "preflight-login-access"
            );
            assert.equal(
                h.values.spotifyRefreshToken,
                "preflight-login-refresh"
            );
            assert.equal(timers.active().length, 0);
        });
    } finally {
        timers.restore();
        h.restore();
    }
});

test("a definitive 401 refreshes once and retries the failed call", async () => {
    const h = createHarness();
    const timers = fakeTimers();
    let firstSearch = true;
    h.state.searchImpl = async () => {
        if (firstSearch) {
            firstSearch = false;
            const error = new Error("unauthorized");
            error.statusCode = 401;
            throw error;
        }
        return { body: { tracks: { total: 1, items: [track] } } };
    };
    try {
        await withStubs(h.stubs, async () => {
            const { executeSongRequest } = await h.load();
            const result = await runRequest(h, executeSongRequest, undefined);
            assert.equal(result.success, true);
            assert.equal(h.state.refreshCalls, 1);
            assert.equal(h.state.searchCalls, 2);
            assert.equal(h.state.queueCalls, 1);
            assert.equal(h.state.accessToken, "refreshed-access");
            assert.equal(timers.active().length, 0);
        });
    } finally {
        timers.restore();
        h.restore();
    }
});

test("a retry that also receives 401 stops after one bounded attempt", async () => {
    const h = createHarness();
    const timers = fakeTimers();
    h.state.searchImpl = async () => {
        const error = new Error("unauthorized");
        error.statusCode = 401;
        throw error;
    };
    try {
        await withStubs(h.stubs, async () => {
            const { executeSongRequest } = await h.load();
            const result = await runRequest(h, executeSongRequest, undefined);
            assert.equal(result.success, false);
            assert.equal(result.outcomes[0].reason, "auth-error");
            assert.equal(h.state.refreshCalls, 1);
            assert.equal(h.state.searchCalls, 2);
            assert.equal(h.state.queueCalls, 0);
            assert.equal(timers.active().length, 0);
        });
    } finally {
        timers.restore();
        h.restore();
    }
});

test("403 is not retried or refreshed", async () => {
    const h = createHarness();
    const timers = fakeTimers();
    h.state.searchImpl = async () => {
        const error = new Error("forbidden");
        error.statusCode = 403;
        throw error;
    };
    try {
        await withStubs(h.stubs, async () => {
            const { executeSongRequest } = await h.load();
            const result = await runRequest(h, executeSongRequest, undefined);
            assert.equal(result.success, false);
            assert.equal(result.outcomes[0].reason, "auth-error");
            assert.equal(h.state.refreshCalls, 0);
            assert.equal(h.state.searchCalls, 1);
            assert.equal(h.state.queueCalls, 0);
            assert.equal(timers.active().length, 0);
        });
    } finally {
        timers.restore();
        h.restore();
    }
});

test("a 401 queue rejection gets one refresh and one retry", async () => {
    const h = createHarness();
    const timers = fakeTimers();
    let queueAttempts = 0;
    h.state.queueImpl = async () => {
        queueAttempts += 1;
        return queueAttempts === 1
            ? { ok: false, status: 401 }
            : { ok: true, status: 204 };
    };
    try {
        await withStubs(h.stubs, async () => {
            const { executeSongRequest } = await h.load();
            const result = await runRequest(h, executeSongRequest, undefined);
            assert.equal(result.success, true);
            assert.equal(h.state.refreshCalls, 1);
            assert.equal(h.state.queueCalls, 2);
            assert.equal(h.state.searchCalls, 1);
            assert.equal(timers.active().length, 0);
        });
    } finally {
        timers.restore();
        h.restore();
    }
});

test("an ambiguous queue write failure is not retried", async () => {
    const h = createHarness();
    const timers = fakeTimers();
    h.state.queueImpl = async () => ({ ok: false, status: 503 });
    try {
        await withStubs(h.stubs, async () => {
            const { executeSongRequest } = await h.load();
            const result = await runRequest(h, executeSongRequest, undefined);
            assert.equal(result.success, false);
            assert.equal(h.state.refreshCalls, 0);
            assert.equal(h.state.queueCalls, 1);
            assert.equal(timers.active().length, 0);
        });
    } finally {
        timers.restore();
        h.restore();
    }
});

test("a login during 401 recovery wins over the stale refresh result", async () => {
    const h = createHarness();
    const timers = fakeTimers();
    let firstSearch = true;
    h.state.searchImpl = async () => {
        if (firstSearch) {
            firstSearch = false;
            const error = new Error("unauthorized");
            error.statusCode = 401;
            throw error;
        }
        return { body: { tracks: { total: 1, items: [track] } } };
    };
    try {
        await withStubs(h.stubs, async () => {
            const { player, executeSongRequest } = await h.load();
            h.state.refreshImpl = async () => {
                player.saveTokens({
                    accessToken: "new-login-access",
                    refreshToken: "new-login-refresh",
                    expiresIn: 3600,
                });
                return {
                    body: {
                        access_token: "stale-refresh-access",
                        expires_in: 3600,
                    },
                };
            };
            const result = await runRequest(h, executeSongRequest, undefined);
            assert.equal(result.success, true);
            assert.equal(h.state.refreshCalls, 1);
            assert.equal(h.state.searchCalls, 2);
            assert.equal(h.values.spotifyAccessToken, "new-login-access");
            assert.equal(h.values.spotifyRefreshToken, "new-login-refresh");
            assert.equal(timers.active().length, 0);
        });
    } finally {
        timers.restore();
        h.restore();
    }
});
