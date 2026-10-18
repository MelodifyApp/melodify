"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

let isSpotifyAppAvailable;
try {
    ({ isSpotifyAppAvailable } = require("../src/features/spotify/components/spotifyStatusView"));
} catch {
    // Keep the missing implementation as an assertion failure in the RED run.
}

test("Spotify app indicator is green for a local app or an active remote session", () => {
    assert.equal(typeof isSpotifyAppAvailable, "function");
    assert.equal(isSpotifyAppAvailable(true, false), true);
    assert.equal(isSpotifyAppAvailable(false, true), true);
    assert.equal(isSpotifyAppAvailable(false, false), false);
});
