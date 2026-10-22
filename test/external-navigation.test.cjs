"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const externalUrl = require("../src/shared/utils/externalUrl");
const originalLoad = Module._load;
let applyNavigationGuards;
try {
    Module._load = function (request, parent, isMain) {
        if (request === "@/shared/utils/externalUrl") return externalUrl;
        return originalLoad.call(this, request, parent, isMain);
    };
    applyNavigationGuards = require("../src/main/navigationGuard").applyNavigationGuards;
} finally {
    Module._load = originalLoad;
}
const { isSafeExternalUrl } = externalUrl;

function fakeContents(currentUrl = "http://localhost:3000/index.html") {
    const captured = { open: null, navigate: null };
    return {
        captured,
        getURL: () => currentUrl,
        setWindowOpenHandler(handler) {
            captured.open = handler;
        },
        on(event, listener) {
            if (event === "will-navigate") captured.navigate = listener;
        },
    };
}

function navigateEvent() {
    return {
        defaultPrevented: false,
        preventDefault() {
            this.defaultPrevented = true;
        },
    };
}

test("safe external URLs are limited to http and https", () => {
    for (const value of [
        "https://kick.com/dashboard",
        "http://127.0.0.1:8888/callback",
        "  https://example.com/a?b=c  ",
    ]) {
        assert.equal(isSafeExternalUrl(value), true, String(value));
    }

    for (const value of [
        "javascript:alert(1)",
        "file:///C:/Windows/System32/cmd.exe",
        "data:text/html,<h1>x</h1>",
        "ms-settings:",
        "vbscript:msgbox(1)",
        "//evil.example.com",
        "http://",
        "https://",
        "not a url",
        "",
        "   ",
        null,
        undefined,
        42,
        {},
        [],
    ]) {
        assert.equal(isSafeExternalUrl(value), false, String(value));
    }
});

test("window.open is denied and valid web URLs open externally", () => {
    const contents = fakeContents();
    const opened = [];
    applyNavigationGuards(contents, { openExternal: (url) => opened.push(url) });

    assert.equal(typeof contents.captured.open, "function");
    assert.deepEqual(contents.captured.open({ url: "https://kick.com/dashboard" }), {
        action: "deny",
    });
    assert.deepEqual(opened, ["https://kick.com/dashboard"]);

    assert.deepEqual(contents.captured.open({ url: "javascript:alert(1)" }), {
        action: "deny",
    });
    assert.deepEqual(contents.captured.open({ url: "file:///C:/Windows/System32/cmd.exe" }), {
        action: "deny",
    });
    assert.deepEqual(opened, ["https://kick.com/dashboard"]);
});

test("in-app navigation is allowed while external navigation opens externally", () => {
    const contents = fakeContents("http://localhost:3000/index.html");
    const opened = [];
    applyNavigationGuards(contents, { openExternal: (url) => opened.push(url) });

    const sameOrigin = navigateEvent();
    contents.captured.navigate(sameOrigin, "http://localhost:3000/settings");
    assert.equal(sameOrigin.defaultPrevented, false);
    assert.deepEqual(opened, []);

    const external = navigateEvent();
    contents.captured.navigate(external, "https://kick.com/");
    assert.equal(external.defaultPrevented, true);
    assert.deepEqual(opened, ["https://kick.com/"]);

    const unsafe = navigateEvent();
    contents.captured.navigate(unsafe, "javascript:alert(1)");
    assert.equal(unsafe.defaultPrevented, true);
    assert.deepEqual(opened, ["https://kick.com/"]);

    const malformed = navigateEvent();
    contents.captured.navigate(malformed, undefined);
    assert.equal(malformed.defaultPrevented, true);
    assert.deepEqual(opened, ["https://kick.com/"]);
});
