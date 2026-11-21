"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    isTrustedRendererUrl,
    isTrustedIpcSender,
    isConfirmedClearPayload,
} = require("../src/shared/utils/ipcSender.ts");

test("accepts packaged and local development renderer URLs", () => {
    assert.equal(
        isTrustedRendererUrl(
            "file:///C:/Program%20Files/Melodify/resources/app.asar/.webpack/renderer/main_window/index.html"
        ),
        true
    );
    assert.equal(isTrustedRendererUrl("http://localhost:3000/main_window"), true);
    assert.equal(isTrustedRendererUrl("http://127.0.0.1:3000/index.html"), true);
});

test("rejects arbitrary files and remote pages", () => {
    assert.equal(isTrustedRendererUrl("file:///C:/Windows/System32/index.html"), false);
    assert.equal(isTrustedRendererUrl("https://example.com/index.html"), false);
    assert.equal(isTrustedRendererUrl(""), false);
    assert.equal(isTrustedRendererUrl(undefined), false);
});

test("rejects a subframe sender", () => {
    const mainFrame = {};
    const subFrame = {};
    assert.equal(
        isTrustedIpcSender({
            senderFrame: { url: "http://localhost:3000/index.html" },
            sender: { mainFrame },
        }),
        false
    );
    assert.equal(
        isTrustedIpcSender({
            senderFrame: { url: "http://localhost:3000/index.html" },
            sender: { mainFrame: subFrame },
        }),
        false
    );
    const trustedFrame = { url: "http://localhost:3000/index.html" };
    assert.equal(
        isTrustedIpcSender({
            senderFrame: trustedFrame,
            sender: { mainFrame: trustedFrame },
        }),
        true
    );
});

test("requires an explicit confirmed clear payload", () => {
    assert.equal(isConfirmedClearPayload({ confirmed: true }), true);
    assert.equal(isConfirmedClearPayload({ confirmed: false }), false);
    assert.equal(isConfirmedClearPayload({}), false);
    assert.equal(isConfirmedClearPayload(null), false);
});
