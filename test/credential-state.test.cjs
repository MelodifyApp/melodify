"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    deriveCredentialStatus,
    statusAfterVerification,
} = require("../src/features/settings/credentialState");

test("credential state distinguishes empty, draft, and stored-unverified fields", () => {
    assert.equal(
        deriveCredentialStatus({ clientId: "", secretDraft: "", stored: false }),
        "needs-credentials"
    );
    assert.equal(
        deriveCredentialStatus({ clientId: "client", secretDraft: "", stored: false }),
        "needs-credentials"
    );
    assert.equal(
        deriveCredentialStatus({ clientId: "client", secretDraft: "secret", stored: false }),
        "unverified"
    );
    assert.equal(
        deriveCredentialStatus({ clientId: "stored-client", secretDraft: "", stored: true, storedClientId: "stored-client" }),
        "unverified"
    );
    assert.equal(
        deriveCredentialStatus({ clientId: "changed-client", secretDraft: "", stored: true, storedClientId: "stored-client" }),
        "needs-credentials"
    );
    assert.equal(
        deriveCredentialStatus({ clientId: "changed-client", secretDraft: "new-secret", stored: true, storedClientId: "stored-client" }),
        "unverified"
    );
});

test("verification results drive the six explicit states without silent success", () => {
    assert.equal(statusAfterVerification({ success: true }), "verified");
    assert.equal(
        statusAfterVerification({ success: false, code: "invalid_credentials" }),
        "verification-failed"
    );
    assert.equal(
        statusAfterVerification({ success: false, code: "verification_unavailable" }),
        "verification-unavailable"
    );
    assert.equal(
        statusAfterVerification({ success: false, code: "missing_credentials" }),
        "needs-credentials"
    );
    assert.equal(
        statusAfterVerification({ success: false, code: "unknown" }),
        "verification-unavailable"
    );
});