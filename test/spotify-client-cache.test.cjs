"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const config = {
    values: {
        spotifyClientId: "old-client-id",
        spotifyClientSecret: "old-client-secret",
        spotifyRedirectUri: "http://127.0.0.1:8888/callback",
    },
    get(key) { return this.values[key]; },
    set(values) { Object.assign(this.values, values); },
};
const logger = { debug() {}, info() {}, warn() {}, error() {} };
class FakeSpotifyWebApi {
    constructor(options) { this.options = options; }
}

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === "spotify-web-api-node") return FakeSpotifyWebApi;
    if (request === "@/core/config") return { __esModule: true, default: config };
    if (request === "@/core/logging") return logger;
    if (request === "@/core/logging/utils") return { redactSecrets: (value) => value };
    return originalLoad.call(this, request, parent, isMain);
};
let player;
try {
    player = require("../src/features/spotify/playback/player");
} finally {
    Module._load = originalLoad;
}

test("changing Spotify credentials rebuilds the cached API client", () => {
    const oldClient = player.getSpotifyApi();
    assert.equal(oldClient.options.clientId, "old-client-id");
    assert.equal(oldClient.options.clientSecret, "old-client-secret");

    if (typeof player.updateSpotifyClientCredentials === "function") {
        player.updateSpotifyClientCredentials("new-client-id", "new-client-secret");
    } else {
        // Mirror the existing IPC persistence path, which updates config but
        // leaves getSpotifyApi()'s cached client alive.
        config.set({
            spotifyClientId: "new-client-id",
            spotifyClientSecret: "new-client-secret",
        });
    }

    const newClient = player.getSpotifyApi();
    assert.notStrictEqual(newClient, oldClient);
    assert.equal(newClient.options.clientId, "new-client-id");
    assert.equal(newClient.options.clientSecret, "new-client-secret");
});
