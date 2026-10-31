"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
const originalCss = require.extensions[".css"];
const tr = require("../src/core/i18n/locales/tr.json");

function lookup(source, key) {
    return key.split(".").reduce((value, part) => {
        if (!value || typeof value !== "object") return undefined;
        return value[part];
    }, source);
}

function interpolate(value, options = {}) {
    return String(value).replace(/\{\{(\w+)\}\}/g, (match, key) =>
        options[key] === undefined ? match : String(options[key])
    );
}

function trT(key, options) {
    const value = lookup(tr, key);
    return typeof value === "string" ? interpolate(value, options) : key;
}

function withModules(callback) {
    require.extensions[".css"] = () => {};
    const originalLoad = Module._load;
    Module._resolveFilename = function (request, ...args) {
        return originalResolve.call(
            this,
            request.startsWith("@/")
                ? path.join(root, "src", request.slice(2))
                : request,
            ...args
        );
    };
    Module._load = function (request, parent, isMain) {
        if (request === "react-i18next") {
            return {
                useTranslation: () => ({
                    t: trT,
                    i18n: { language: "tr", changeLanguage() {} },
                }),
            };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        return callback();
    } finally {
        Module._resolveFilename = originalResolve;
        Module._load = originalLoad;
        if (originalCss) require.extensions[".css"] = originalCss;
        else delete require.extensions[".css"];
    }
}

function loadModule(relativePath) {
    const resolved = require.resolve(path.join(root, relativePath));
    delete require.cache[resolved];
    return require(resolved);
}

function render(relativePath, props = {}) {
    return renderNamed(relativePath, "default", props);
}

function renderNamed(relativePath, exportName, props = {}) {
    return withModules(() => {
        const module = loadModule(relativePath);
        const Component =
            exportName === "default" ? module.default : module[exportName];
        assert.ok(Component);
        return renderToStaticMarkup(React.createElement(Component, props));
    });
}

test("Home renders a polite Turkish live region and Turkish connection status", () => {
    const html = render("src/ui/components/HomePage.tsx");
    assert.match(html, /data-home-connection-announcement/);
    assert.match(html, /role="status"/);
    assert.match(html, /aria-live="polite"/);
    assert.match(html, /aria-atomic="true"/);
    assert.match(html, /Kontrol ediliyor/);
});

test("SaveDock's Turkish render has no hard-coded English state or actions", () => {
    const html = renderNamed(
        "src/ui/components/studio/SaveDock.tsx",
        "SaveDock",
        {
            dirty: true,
            onSave() {},
            onDiscard() {},
        }
    );
    assert.match(html, /Kaydedilmemiş değişiklikler/);
    assert.match(html, /Kaydet/);
    assert.match(html, /Vazgeç/);
    assert.doesNotMatch(html, /Unsaved changes/);
    assert.doesNotMatch(html, /Save settings/);
    assert.doesNotMatch(html, /Discard/);
});

test("ErrorBoundary fallback uses Turkish strings", () => {
    withModules(() => {
        const { ErrorBoundary } = loadModule(
            "src/ui/components/ErrorBoundary.tsx"
        );
        const instance = new ErrorBoundary({ children: null });
        instance.state = { hasError: true };
        const html = renderToStaticMarkup(instance.render());
        assert.match(html, /Bir sorun oluştu/);
        assert.match(html, /Uygulamayı yeniden yükle/);
        assert.doesNotMatch(html, /Something went wrong/);
    });
});

test("validation errors translate while isolated callers keep English fallback", () => {
    const validation = loadModule(
        "src/features/settings/components/validation.ts"
    );
    assert.equal(
        validation.validateClientId("short", trT),
        "Client ID çok kısa görünüyor"
    );
    assert.equal(
        validation.validateClientId("short"),
        "Client ID appears to be too short"
    );
});

test("connection announcements only include changed services and use Turkish", () => {
    const home = loadModule("src/features/home/homeConnections.ts");
    const previous = {
        spotify: "loading",
        kick: "loading",
        twitch: "loading",
    };
    const views = home.deriveHomeConnections({
        spotify: {
            hasSecrets: true,
            authenticated: true,
            hasSession: true,
            error: false,
        },
        kick: {
            hasSecrets: true,
            authenticated: true,
            listening: true,
            error: false,
        },
        twitch: {
            hasSecrets: true,
            authenticated: true,
            listening: true,
            error: false,
        },
    });
    const changed = home.changedHomeConnectionIds(previous, views);
    assert.deepEqual(changed, ["spotify", "kick", "twitch"]);
    const announcement = home.buildHomeConnectionAnnouncement(
        changed,
        views,
        trT
    );
    assert.match(announcement, /Spotify durumu: Hazır/);
    assert.match(announcement, /Kick durumu: Dinliyor/);
    assert.match(announcement, /Twitch durumu: Dinliyor/);

    const current = home.homeConnectionStateMap(views);
    assert.deepEqual(home.changedHomeConnectionIds(current, views), []);
});
