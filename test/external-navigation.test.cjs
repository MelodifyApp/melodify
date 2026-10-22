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

const fs = require("node:fs");
const path = require("node:path");
const { isLoopbackHost, loopbackHostForRedirect } = require("../src/shared/utils/loopbackHost");
const {
    KICK_REDIRECT_URI,
    SPOTIFY_REDIRECT_URI,
    TWITCH_REDIRECT_URI,
} = require("../src/shared/constants");

function collectOpenExternalLiterals() {
    const found = new Set();
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
                continue;
            }
            if (!/\.(ts|tsx)$/.test(full)) continue;
            const text = fs.readFileSync(full, "utf8");
            for (const match of text.matchAll(/openExternal\(\s*"([^"]+)"/g)) {
                found.add(match[1]);
            }
        }
    };
    walk(path.join(__dirname, "..", "src"));
    return found;
}

function fakeContents(currentUrl = "http://localhost:3000/index.html") {
    const captured = { open: null, navigate: null, redirect: null, frameNavigate: null };
    return {
        captured,
        getURL: () => currentUrl,
        setWindowOpenHandler(handler) {
            captured.open = handler;
        },
        on(event, listener) {
            if (event === "will-navigate") captured.navigate = listener;
            if (event === "will-redirect") captured.redirect = listener;
            if (event === "will-frame-navigate") captured.frameNavigate = listener;
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

function navigationDetails(url, extra = {}) {
    return {
        url,
        ...extra,
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

test("server redirects are subject to the same navigation policy", () => {
    const contents = fakeContents();
    const opened = [];
    applyNavigationGuards(contents, { openExternal: (url) => opened.push(url) });
    assert.equal(typeof contents.captured.redirect, "function");

    const allowed = navigationDetails("http://localhost:3000/callback");
    contents.captured.redirect(allowed);
    assert.equal(allowed.defaultPrevented, false);

    const external = navigationDetails("https://kick.com/redirected");
    contents.captured.redirect(external);
    assert.equal(external.defaultPrevented, true);
    assert.deepEqual(opened, ["https://kick.com/redirected"]);

    const unsafe = navigationDetails("javascript:alert(1)");
    contents.captured.redirect(unsafe);
    assert.equal(unsafe.defaultPrevented, true);
    assert.deepEqual(opened, ["https://kick.com/redirected"]);
});

test("subframe navigation is denied outside the app origin without opening a browser", () => {
    const contents = fakeContents();
    const opened = [];
    applyNavigationGuards(contents, { openExternal: (url) => opened.push(url) });
    assert.equal(typeof contents.captured.frameNavigate, "function");

    const subframeExternal = navigationDetails("https://evil.example.com/frame", {
        isMainFrame: false,
    });
    contents.captured.frameNavigate(subframeExternal);
    assert.equal(subframeExternal.defaultPrevented, true);
    assert.deepEqual(opened, []);

    const subframeSameOrigin = navigationDetails("http://localhost:3000/frame", {
        isMainFrame: false,
    });
    contents.captured.frameNavigate(subframeSameOrigin);
    assert.equal(subframeSameOrigin.defaultPrevented, false);

    const mainFrame = navigationDetails("https://kick.com/", { isMainFrame: true });
    contents.captured.frameNavigate(mainFrame);
    assert.equal(mainFrame.defaultPrevented, false);
    assert.deepEqual(opened, []);
});

test("file-based windows do not treat arbitrary file paths as same-origin", () => {
    const appUrl =
        "file:///C:/app/resources/app.asar/.webpack/renderer/main_window/index.html";
    const contents = fakeContents(appUrl);
    const opened = [];
    applyNavigationGuards(contents, { openExternal: (url) => opened.push(url) });

    const sibling = navigationDetails(
        "file:///C:/app/resources/app.asar/.webpack/renderer/main_window/other.html"
    );
    contents.captured.navigate(sibling);
    assert.equal(sibling.defaultPrevented, false);

    const escape = navigationDetails("file:///C:/Windows/System32/cmd.exe");
    contents.captured.navigate(escape);
    assert.equal(escape.defaultPrevented, true);
    assert.deepEqual(opened, []);
});

test("embedded credentials are rejected", () => {
    for (const value of [
        "https://user:secret@kick.com/dashboard",
        "https://user@kick.com/dashboard",
        "http://user:secret@localhost:3000/",
        "https://user:secret@127.0.0.1:8888/callback",
        "HTTPS://user:secret@kick.com/",
    ]) {
        assert.equal(isSafeExternalUrl(value), false, String(value));
    }
});

test("plain HTTP is only accepted for loopback hosts", () => {
    for (const value of [
        "http://kick.com/settings/developer",
        "http://dev.twitch.tv/console",
        "http://example.com/",
        "http://127.0.0.2:8888/callback",
        "http://localhost.evil.com/",
    ]) {
        assert.equal(isSafeExternalUrl(value), false, String(value));
    }

    for (const value of [
        "http://localhost:3000/index.html",
        "http://localhost:8889/callback",
        "http://127.0.0.1:8888/callback",
        "http://[::1]:8890/callback",
        "https://kick.com/dashboard",
        "https://dev.twitch.tv/console",
        "https://developer.spotify.com/dashboard",
        "https://[::1]:8890/callback",
    ]) {
        assert.equal(isSafeExternalUrl(value), true, String(value));
    }
});

test("loopback host detection stays strict", () => {
    for (const host of ["localhost", "127.0.0.1", "::1", "[::1]", "LOCALHOST"]) {
        assert.equal(isLoopbackHost(host), true, host);
    }
    for (const host of [
        "localhost.evil.com",
        "evil-localhost",
        "127.0.0.2",
        "::2",
        "example.com",
        "",
        "   ",
        42,
        null,
        undefined,
    ]) {
        assert.equal(isLoopbackHost(host), false, String(host));
    }

    assert.equal(loopbackHostForRedirect("http://127.0.0.1:8888/callback"), "127.0.0.1");
    assert.equal(loopbackHostForRedirect("http://localhost:8889/callback"), "localhost");
    assert.equal(loopbackHostForRedirect("https://[::1]:8890/callback"), "::1");
    assert.equal(loopbackHostForRedirect("https://evil.example.com/callback"), "localhost");
    assert.equal(loopbackHostForRedirect("not a url"), "localhost");
});

test("the app's own loopback redirect URIs remain acceptable", () => {
    for (const uri of [KICK_REDIRECT_URI, SPOTIFY_REDIRECT_URI, TWITCH_REDIRECT_URI]) {
        assert.equal(isSafeExternalUrl(uri), true, uri);
    }
});

test("every external link shipped in the app satisfies the tightened policy", () => {
    const literals = collectOpenExternalLiterals();
    assert.deepEqual([...literals].sort(), [
        "https://dev.twitch.tv/console",
        "https://developer.spotify.com/dashboard",
        "https://kick.com/settings/developer",
    ]);
    for (const url of literals) {
        assert.equal(isSafeExternalUrl(url), true, url);
    }
});
