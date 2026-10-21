"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

let catalog;
let advanceMockDownloadProgress;
try {
    catalog = require("../src/ui/components/uiTestCatalog");
    ({ advanceMockDownloadProgress } = catalog);
} catch {
    // The missing production catalog should fail with an assertion below.
}

test("UI state lab catalog covers application screens and platform states", () => {
    assert.ok(catalog, "the UI test catalog should exist");
    assert.deepEqual(catalog.UI_TEST_ROUTES.map(({ id }) => id), [
        "home",
        "settings",
    ]);
    assert.deepEqual(catalog.UI_TEST_SETTINGS_SECTIONS, [
        "general",
        "secrets",
        "requests",
        "commands",
        "logs",
        "debug",
    ]);
    assert.deepEqual(catalog.UI_TEST_CONNECTION_STATES.spotify, [
        "loading",
        "no-secrets",
        "credentials-only",
        "auth-in-progress",
        "auth-error",
        "connected-no-device",
        "active-local",
        "active-remote",
    ]);
    assert.deepEqual(catalog.UI_TEST_CONNECTION_STATES.kick, [
        "loading",
        "no-secrets",
        "credentials-only",
        "auth-in-progress",
        "oauth-failed-reader-active",
        "chat-connecting",
        "chat-connected",
        "chat-disconnected",
    ]);
    assert.deepEqual(catalog.UI_TEST_CONNECTION_STATES.twitch, [
        "loading",
        "no-secrets",
        "credentials-only",
        "auth-in-progress",
        "listener-started-unverified",
        "chat-connected",
        "subscription-error",
        "auth-expired",
    ]);
    assert.deepEqual(catalog.UI_TEST_UPDATE_STATES, [
        "idle",
        "checking",
        "available",
        "downloading",
        "downloaded",
        "error",
    ]);
    assert.deepEqual(catalog.UI_TEST_CREDENTIAL_FORM_STATES, [
        "empty",
        "validation-error",
        "saving",
        "server-error",
    ]);
    assert.deepEqual(Object.keys(catalog.UI_TEST_SETTINGS_STATES), [
        "general",
        "secrets",
        "requests",
        "commands",
        "logs",
        "debug",
    ]);
    assert.deepEqual(catalog.UI_TEST_SETTINGS_STATES.secrets, [
        "empty",
        "configured",
        "validation-error",
    ]);
    assert.ok(catalog.UI_TEST_PRESETS.some((preset) => preset.id === "kick-partial"));
    assert.ok(catalog.UI_TEST_PRESETS.some((preset) => preset.id === "twitch-unverified"));
});

test("mock download progress advances and stops at complete", () => {
    assert.equal(typeof advanceMockDownloadProgress, "function");
    assert.deepEqual(advanceMockDownloadProgress(0), { percent: 20, complete: false });
    assert.deepEqual(advanceMockDownloadProgress(85), { percent: 100, complete: true });
    assert.deepEqual(advanceMockDownloadProgress(100), { percent: 100, complete: true });
});
