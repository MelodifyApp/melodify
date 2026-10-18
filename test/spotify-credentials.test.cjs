"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spotifyCredentialErrorMessage } = require("../src/features/spotify/components/spotifyCredentialView");

test("shows the server credential error instead of an undefined message", () => {
    assert.equal(
        spotifyCredentialErrorMessage(
            { success: false, error: "Invalid client ID or secret." },
            "Could not save credentials."
        ),
        "Invalid client ID or secret."
    );
});

test("uses the fallback when a credential error response has no message", () => {
    assert.equal(
        spotifyCredentialErrorMessage({ success: false }, "Could not save credentials."),
        "Could not save credentials."
    );
});
