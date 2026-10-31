"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

const root = path.resolve(__dirname, "..");
const originalLoad = Module._load;
const originalResolve = Module._resolveFilename;

function loadPlayer(configValues, state) {
    class FakeSpotifyWebApi {
        constructor() {}
        setAccessToken() {}
        setRefreshToken() {}
        async getMyCurrentPlaybackState() {
            if (state.authError) {
                const error = new Error("unauthorized");
                error.statusCode = 401;
                throw error;
            }
            return { body: state.playback };
        }
        async refreshAccessToken() {
            if (state.refreshFails) throw new Error("refresh unavailable");
            return {
                body: {
                    access_token: "refreshed",
                    expires_in: 3600,
                },
            };
        }
    }
    const writes = [];
    const fsStub = {
        existsSync: () => true,
        mkdirSync() {},
        writeFileSync: (filePath, content) => {
            writes.push({ filePath, content });
        },
    };
    const logging = {
        logDebug() {},
        logInfo() {},
        logWarn() {},
        logError() {},
    };
    const stubs = {
        "spotify-web-api-node": FakeSpotifyWebApi,
        "@/core/config": {
            __esModule: true,
            default: {
                get: (key) => configValues[key],
                set: (patch) => Object.assign(configValues, patch),
            },
        },
        "@/core/logging": logging,
        "@/core/logging/utils": { redactSecrets: (value) => value },
        fs: fsStub,
        path: require("node:path"),
    };
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
    try {
        const resolved = require.resolve(
            path.join(root, "src/features/spotify/playback/player.ts")
        );
        delete require.cache[resolved];
        return { player: require(resolved), writes };
    } finally {
        Module._resolveFilename = originalResolve;
        Module._load = originalLoad;
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
            type: "timeout",
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
        fireNext() {
            const timer = this.active()[0];
            assert.ok(timer, "expected an active overlay timer");
            timer.fired = true;
            timer.callback();
        },
        restore() {
            global.setTimeout = originalSetTimeout;
            global.clearTimeout = originalClearTimeout;
        },
    };
}

async function flush() {
    for (let i = 0; i < 8; i += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

function playback(title, artist = "Artist", duration = 180000) {
    return {
        is_playing: true,
        item: {
            type: "track",
            name: title,
            duration_ms: duration,
            artists: [{ name: artist }],
        },
    };
}

function baseConfig(overrides = {}) {
    return {
        spotifyClientId: "client-id",
        spotifyClientSecret: "client-secret",
        spotifyAccessToken: "access",
        spotifyRefreshToken: "refresh",
        spotifyExpiresAt: Date.now() + 3600000,
        saveCurrentSongToFile: true,
        currentSongFilePath: "C:\\dummy\\overlay.txt",
        currentSongFormat: "{artist} // {title}",
        ...overrides,
    };
}

test("one overlay scheduler writes changes, stops fully, and does not leave a timer", async () => {
    const config = baseConfig();
    const state = { playback: playback("Song A") };
    const timers = fakeTimers();
    try {
        const { player, writes } = loadPlayer(config, state);
        player.startSongFileSaving();
        await flush();
        assert.deepEqual(writes, [
            {
                filePath: config.currentSongFilePath,
                content: "Artist // Song A",
            },
        ]);
        assert.equal(timers.active().length, 1);

        state.playback = playback("Song B");
        timers.fireNext();
        await flush();
        assert.deepEqual(writes[1], {
            filePath: config.currentSongFilePath,
            content: "Artist // Song B",
        });
        assert.equal(timers.active().length, 1);

        const timerAtStop = timers.active()[0];
        player.stopSongFileSaving();
        assert.equal(timers.active().length, 0);
        timerAtStop.fired = true;
        timerAtStop.callback();
        await flush();
        assert.equal(writes.length, 2, "a stale timer must not write after stop");

        player.startSongFileSaving();
        await flush();
        player.stopSongFileSaving();
        assert.equal(timers.active().length, 0);
    } finally {
        timers.restore();
    }
});

test("disabled overlay starts no timer and auth failure stops all owned timers", async () => {
    const disabledConfig = baseConfig({ saveCurrentSongToFile: false });
    const disabledState = { playback: playback("Song A") };
    const disabledTimers = fakeTimers();
    try {
        const { player, writes } = loadPlayer(disabledConfig, disabledState);
        player.startSongFileSaving();
        await flush();
        assert.equal(disabledTimers.active().length, 0);
        assert.deepEqual(writes, []);
        player.stopSongFileSaving();
    } finally {
        disabledTimers.restore();
    }

    const config = baseConfig();
    const state = { playback: playback("Song A"), refreshFails: true };
    const timers = fakeTimers();
    try {
        const { player, writes } = loadPlayer(config, state);
        player.startSongFileSaving();
        await flush();
        assert.equal(writes.length, 1);
        assert.equal(timers.active().length, 1);

        config.spotifyExpiresAt = Date.now() - 1000;
        state.refreshFails = true;
        timers.fireNext();
        await flush();
        assert.equal(timers.active().length, 0);
        const writeCount = writes.length;

        config.spotifyExpiresAt = Date.now() + 3600000;
        state.refreshFails = false;
        state.playback = playback("Song C");
        player.startSongFileSaving();
        await flush();
        assert.equal(writes.length, writeCount + 1);
        assert.equal(writes[writes.length - 1].content, "Artist // Song C");
        assert.equal(timers.active().length, 1);
        player.stopSongFileSaving();
    } finally {
        timers.restore();
    }
});

test("overlay polling stops on an API auth failure and resumes after recovery", async () => {
    const config = baseConfig();
    const state = { playback: playback("Song A") };
    const timers = fakeTimers();
    try {
        const { player, writes } = loadPlayer(config, state);
        player.startSongFileSaving();
        await flush();
        assert.equal(writes.length, 1);
        assert.equal(timers.active().length, 1);

        state.authError = true;
        timers.fireNext();
        await flush();
        assert.equal(timers.active().length, 0);

        state.authError = false;
        state.playback = playback("Song B");
        player.startSongFileSaving();
        await flush();
        assert.equal(writes[writes.length - 1].content, "Artist // Song B");
        player.stopSongFileSaving();
    } finally {
        timers.restore();
    }
});
