"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    spotifyCredentialMessageKey,
} = require("../src/features/spotify/components/spotifyCredentialView");

test("maps stable failure codes to translated message keys", () => {
    assert.equal(
        spotifyCredentialMessageKey({ success: false, code: "invalid_credentials" }),
        "common.invalidCredentials"
    );
    assert.equal(
        spotifyCredentialMessageKey({
            success: false,
            code: "verification_unavailable",
        }),
        "common.verificationUnavailable"
    );
    assert.equal(
        spotifyCredentialMessageKey({ success: false, code: "missing_credentials" }),
        "common.secretsRequired"
    );
});

test("never surfaces raw service text or unknown payloads", () => {
    assert.equal(
        spotifyCredentialMessageKey({
            success: false,
            error: "Invalid client ID or secret.",
            message: "raw detail",
        }),
        null
    );
    assert.equal(spotifyCredentialMessageKey({ success: false }), null);
    assert.equal(spotifyCredentialMessageKey({ success: false, code: "unknown" }), null);
    assert.equal(spotifyCredentialMessageKey(null), null);
    assert.equal(spotifyCredentialMessageKey(undefined), null);
});
