"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    deriveCredentialStatus,
    statusAfterVerification,
    canVerifyCredentials,
    canSaveCredentials,
    credentialStatusMessageKey,
    toChipStatus,
} = require("../src/features/settings/credentialState");
const en = require("../src/core/i18n/locales/en.json");
const tr = require("../src/core/i18n/locales/tr.json");

function lookup(locale, dottedKey) {
    return dottedKey
        .split(".")
        .reduce((node, part) => (node == null ? undefined : node[part]), locale);
}

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

test("Save is gated on Verified and a new secret; editing invalidates Verified", () => {
    assert.equal(
        canSaveCredentials("verified", { secretDraft: "new-secret" }),
        true
    );
    assert.equal(
        canSaveCredentials("verified", { secretDraft: "" }),
        false,
        "stored credentials do not need a redundant save"
    );
    for (const status of [
        "needs-credentials",
        "unverified",
        "verifying",
        "verification-failed",
        "verification-unavailable",
    ]) {
        assert.equal(
            canSaveCredentials(status, { secretDraft: "new-secret" }),
            false,
            status
        );
    }
    assert.equal(
        deriveCredentialStatus({ clientId: "client", secretDraft: "edited", stored: true }),
        "unverified"
    );
});

test("verification accepts a stored secret only for the stored client ID", () => {
    const fields = (overrides) => ({
        clientId: "client",
        secretDraft: "",
        stored: true,
        storedClientId: "client",
        ...overrides,
    });
    assert.equal(canVerifyCredentials("unverified", fields({})), true);
    assert.equal(
        canVerifyCredentials("unverified", fields({ clientId: "changed" })),
        false
    );
    assert.equal(
        canVerifyCredentials("unverified", fields({ clientId: "changed", secretDraft: "new" })),
        true
    );
    assert.equal(
        canVerifyCredentials("verified", fields({ secretDraft: "new" })),
        false,
        "do not verify while already verified without an edit"
    );
    assert.equal(
        canVerifyCredentials("verification-failed", fields({ secretDraft: "retry" })),
        true
    );
});

test("status labels have English and Turkish translations and map to chips", () => {
    const expected = {
        "needs-credentials": "common.needsCredentials",
        unverified: "common.unverified",
        verifying: "common.verifying",
        verified: "common.verified",
        "verification-failed": "common.verificationFailed",
        "verification-unavailable": "common.verificationUnavailableStatus",
    };
    for (const [status, key] of Object.entries(expected)) {
        assert.equal(credentialStatusMessageKey(status), key);
        assert.equal(typeof lookup(en, key), "string", `en missing ${key}`);
        assert.equal(typeof lookup(tr, key), "string", `tr missing ${key}`);
    }
    assert.equal(toChipStatus("needs-credentials"), "needed");
    assert.equal(toChipStatus("verification-failed"), "failed");
    assert.equal(toChipStatus("verification-unavailable"), "unavailable");
    assert.equal(toChipStatus("verified"), "verified");
});
