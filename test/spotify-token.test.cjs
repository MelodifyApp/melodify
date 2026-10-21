"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const values = {
    spotifyClientId: "test-client",
    spotifyClientSecret: "test-secret",
    spotifyAccessToken: "saved-access",
    spotifyRefreshToken: "saved-refresh",
    spotifyExpiresAt: Date.now() - 1000,
};
const config = {
    get: (key) => values[key],
    set: (data) => Object.assign(values, data),
};
const logging = {
    logDebug() {},
    logInfo() {},
    logWarn() {},
    logError() {},
};

let refreshCalls = 0;
let refreshImpl = async () => ({
    body: { access_token: "refreshed", expires_in: 3600 },
});

class FakeSpotifyWebApi {
    setAccessToken(token) {
        values.spotifyAccessToken = token;
    }
    setRefreshToken(token) {
        values.spotifyRefreshToken = token;
    }
    async refreshAccessToken() {
        refreshCalls += 1;
        return refreshImpl();
    }
}

const originalLoad = Module._load;
let player;
try {
    Module._load = function (request, parent, isMain) {
        if (request === "spotify-web-api-node") return FakeSpotifyWebApi;
        if (request === "@/core/config") return { __esModule: true, default: config };
        if (request === "@/core/logging") return logging;
        if (request === "@/core/logging/utils") {
            return { redactSecrets: (value) => value };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    player = require("../src/features/spotify/playback/player");
} finally {
    Module._load = originalLoad;
}

const { refreshSpotifyAccessToken, saveTokens } = player;

function deferred() {
    let resolve;
    const promise = new Promise((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

function reset(savedAccessToken = "saved-access") {
    values.spotifyAccessToken = savedAccessToken;
    values.spotifyRefreshToken = "saved-refresh";
    values.spotifyExpiresAt = Date.now() - 1000;
    refreshCalls = 0;
}

test("concurrent Spotify refresh requests share one token refresh", async () => {
    reset();
    const gate = deferred();
    refreshImpl = async () => {
        await gate.promise;
        return { body: { access_token: "refreshed", expires_in: 3600 } };
    };

    const first = refreshSpotifyAccessToken();
    const second = refreshSpotifyAccessToken();
    assert.equal(refreshCalls, 1, "both callers must share the in-flight refresh");

    gate.resolve();
    assert.deepEqual(await Promise.all([first, second]), [true, true]);
    assert.equal(values.spotifyAccessToken, "refreshed");
});

test("a stale in-flight refresh cannot overwrite a newer Spotify login", async () => {
    reset();
    const gate = deferred();
    refreshImpl = async () => {
        await gate.promise;
        return { body: { access_token: "stale-access", expires_in: 3600 } };
    };

    const stale = refreshSpotifyAccessToken();
    saveTokens({
        accessToken: "fresh-access",
        refreshToken: "fresh-refresh",
        expiresIn: 3600,
    });
    gate.resolve();

    assert.equal(await stale, false);
    assert.equal(values.spotifyAccessToken, "fresh-access");
    assert.equal(values.spotifyRefreshToken, "fresh-refresh");
});

test("malformed Spotify refresh data keeps the existing session", async () => {
    reset();
    refreshImpl = async () => ({
        body: { access_token: "", expires_in: -1 },
    });

    assert.equal(await refreshSpotifyAccessToken(), false);
    assert.equal(values.spotifyAccessToken, "saved-access");
    assert.equal(values.spotifyRefreshToken, "saved-refresh");
});

test("a successful Spotify refresh persists the new access token", async () => {
    reset();
    const before = Date.now();
    refreshImpl = async () => ({
        body: { access_token: "new-access", expires_in: 120 },
    });

    assert.equal(await refreshSpotifyAccessToken(), true);
    assert.equal(values.spotifyAccessToken, "new-access");
    assert.equal(values.spotifyRefreshToken, "saved-refresh");
    assert.ok(values.spotifyExpiresAt >= before + 120000);
});
