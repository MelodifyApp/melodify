"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

let resolveUserDataDirectory;
try {
    ({ resolveUserDataDirectory } = require("../src/core/config/userDataDirectory"));
} catch {
    // Assert the missing production helper during the RED run.
}

test("development preview data uses the explicit isolated directory", () => {
    assert.equal(typeof resolveUserDataDirectory, "function");
    assert.equal(
        resolveUserDataDirectory("C:\\Users\\owner\\Roaming\\melodify", "C:\\Temp\\melodify-preview", true),
        "C:\\Temp\\melodify-preview"
    );
});

test("production data path ignores the preview override", () => {
    assert.equal(typeof resolveUserDataDirectory, "function");
    assert.equal(
        resolveUserDataDirectory("C:\\Users\\owner\\Roaming\\melodify", "C:\\Temp\\melodify-preview", false),
        "C:\\Users\\owner\\Roaming\\melodify"
    );
});

test("empty preview path keeps the default development path", () => {
    assert.equal(typeof resolveUserDataDirectory, "function");
    assert.equal(
        resolveUserDataDirectory("C:\\Users\\owner\\Roaming\\melodify", "  ", true),
        "C:\\Users\\owner\\Roaming\\melodify"
    );
});

test("detects a silently ignored preview request", () => {
    const { previewOverrideIgnored } = require("../src/core/config/userDataDirectory");
    assert.equal(typeof previewOverrideIgnored, "function");
    // Requested but not a development build: the real profile would be used.
    assert.equal(previewOverrideIgnored("C:\\real", "C:\\preview", false), true);
    // Honored preview: not ignored.
    assert.equal(previewOverrideIgnored("C:\\real", "C:\\preview", true), false);
    // No preview requested: nothing to warn about.
    assert.equal(previewOverrideIgnored("C:\\real", "   ", false), false);
    assert.equal(previewOverrideIgnored("C:\\real", undefined, true), false);
});
