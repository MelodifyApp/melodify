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

function load(relativePath) {
    Module._resolveFilename = function (request, ...args) {
        return originalResolve.call(
            this,
            request.startsWith("@/")
                ? path.join(root, "src", request.slice(2))
                : request,
            ...args
        );
    };
    try {
        const resolved = require.resolve(path.join(root, relativePath));
        delete require.cache[resolved];
        return require(resolved);
    } finally {
        Module._resolveFilename = originalResolve;
    }
}

function readSource(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function renderTitlebar(props = {}) {
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
            return { useTranslation: () => ({ t: (key) => key }) };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        const resolved = require.resolve(
            path.join(root, "src/ui/components/Titlebar.tsx")
        );
        delete require.cache[resolved];
        const Titlebar = require(resolved).default;
        return renderToStaticMarkup(
            React.createElement(Titlebar, {
                onMinimize() {},
                onMaximize() {},
                onClose() {},
                onSettings() {},
                onHome() {},
                onThemeChange() {},
                theme: "graphite",
                ...props,
            })
        );
    } finally {
        Module._resolveFilename = originalResolve;
        Module._load = originalLoad;
        if (originalCss) require.extensions[".css"] = originalCss;
        else delete require.extensions[".css"];
    }
}

const theme = load("src/ui/theme.ts");

test("Studio theme catalogue exposes the eight accepted presets in order", () => {
    assert.deepEqual(
        theme.STUDIO_THEMES.map((option) => option.id),
        [
            "graphite",
            "midnight",
            "plum",
            "forest",
            "deepsea",
            "ember",
            "light",
            "dark",
        ]
    );
    assert.deepEqual(
        theme.STUDIO_THEMES.map((option) => option.label),
        [
            "Graphite",
            "Midnight",
            "Plum",
            "Forest",
            "Deep Sea",
            "Ember",
            "Light",
            "Dark",
        ]
    );
    for (const option of theme.STUDIO_THEMES) {
        assert.match(option.swatch.canvas, /^#[0-9a-f]{6}$/i);
        assert.match(option.swatch.panel, /^#[0-9a-f]{6}$/i);
        assert.match(option.swatch.titlebar, /^#[0-9a-f]{6}$/i);
    }
});

test("theme persistence validates stored values and falls back safely", () => {
    const values = new Map();
    const storage = {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
    };
    assert.equal(theme.readStoredTheme(storage), "graphite");
    theme.persistTheme("ember", storage);
    assert.equal(theme.readStoredTheme(storage), "ember");
    storage.setItem(theme.THEME_STORAGE_KEY, "not-a-theme");
    assert.equal(theme.readStoredTheme(storage), "graphite");
    const broken = {
        getItem() {
            throw new Error("locked");
        },
        setItem() {
            throw new Error("locked");
        },
    };
    assert.equal(theme.readStoredTheme(broken), "graphite");
    assert.doesNotThrow(() => theme.persistTheme("plum", broken));
});

test("Titlebar renders the Studio brand, theme picker and window controls", () => {
    const html = renderTitlebar();
    assert.match(html, /studio-titlebar/);
    assert.match(html, /data-titlebar-brand/);
    assert.match(html, /app\.name/);
    assert.match(html, /titlebar\.chooseTheme/);
    assert.match(html, /titlebar\.theme/);
    assert.match(html, /titlebar\.windowControls/);
    assert.match(html, /titlebar\.minimize/);
    assert.match(html, /titlebar\.maximize/);
    assert.match(html, /titlebar\.close/);
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /aria-pressed="true"/);
    for (const label of [
        "Graphite",
        "Midnight",
        "Plum",
        "Forest",
        "Deep Sea",
        "Ember",
        "Light",
        "Dark",
    ]) {
        assert.match(html, new RegExp(label));
    }
    assert.doesNotMatch(html, /TestTube|Open UI Test Window/);
});

test("Titlebar switches the maximize control to restore when maximized", () => {
    const html = renderTitlebar({ maximized: true });
    assert.match(html, /titlebar\.restore/);
    assert.doesNotMatch(html, /titlebar\.maximize/);
});

test("Titlebar geometry matches the Studio shell", () => {
    const css = readSource("src/ui/components/titlebarStudio.css");
    assert.match(css, /\.studio-titlebar[^}]*height: 38px/);
    assert.match(css, /\.studio-window-btn[^}]*width: 46px/);
    assert.match(css, /-webkit-app-region: drag/);
    assert.match(css, /-webkit-app-region: no-drag/);
});

test("window maximize IPC is allowlisted and wired through preload and main", () => {
    const {
        SEND_CHANNELS,
        INVOKE_CHANNELS,
        LISTEN_CHANNELS,
    } = require("../src/shared/ipcChannels");
    assert.ok(SEND_CHANNELS.includes("window:maximize"));
    assert.ok(INVOKE_CHANNELS.includes("window:isMaximized"));
    assert.ok(LISTEN_CHANNELS.includes("window:maximized"));
    const preload = readSource("src/main/preload.ts");
    assert.match(preload, /maximize: \(\) => ipcRenderer\.send\("window:maximize"\)/);
    assert.match(preload, /isMaximized: \(\) => ipcRenderer\.invoke\("window:isMaximized"\)/);
    const main = readSource("src/main/index.ts");
    assert.match(main, /ipcMain\.on\("window:maximize"/);
    assert.match(main, /ipcMain\.handle\("window:isMaximized"/);
    assert.match(main, /"window:maximized"/);
    assert.match(main, /resizable: true/);
    assert.match(main, /maximizable: true/);
});

test("every Studio theme defines shell surfaces and titlebar tokens", () => {
    const tokens = readSource("src/ui/components/studio/tokens.css");
    for (const id of [
        "midnight",
        "plum",
        "forest",
        "deepsea",
        "ember",
        "light",
        "dark",
    ]) {
        assert.match(
            tokens,
            new RegExp(`data-studio-theme="${id}"`),
            id
        );
    }
    assert.match(tokens, /--studio-titlebar:/);
    assert.match(tokens, /--studio-surface:/);
    assert.match(tokens, /--studio-rail:/);
    assert.match(tokens, /--studio-dialog:/);
});

test("App applies the theme to the shell and passes it to Home and Settings", () => {
    const app = readSource("src/renderer/App.tsx");
    assert.match(app, /readStoredTheme/);
    assert.match(app, /persistTheme/);
    assert.match(app, /StudioTheme theme=\{theme\} className="studio-app"/);
    assert.match(app, /onThemeChange=\{handleThemeChange\}/);
    assert.match(app, /onMaximize=\{handleMaximize\}/);
    assert.match(app, /theme=\{theme\}/);
    assert.match(app, /<HomePage/);
    assert.match(app, /onOpenSettings=\{handleOpenApiKeys\}/);
    assert.match(app, /window:maximized/);
    assert.match(app, /handleOpenApiKeys/);
    assert.match(app, /requestedSection=\{requestedSection/);
    assert.match(app, /onRequestedSectionHandled/);
});

test("Settings sections all use Studio surfaces instead of legacy sections", () => {
    for (const file of [
        "src/features/settings/components/sections/Commands.tsx",
        "src/features/settings/components/sections/Logs.tsx",
        "src/features/settings/components/sections/Debug.tsx",
    ]) {
        const source = readSource(file);
        assert.match(source, /@\/ui\/components\/studio/, file);
        assert.doesNotMatch(source, /settings-section/, file);
        assert.doesNotMatch(source, /@\/ui\/components\/Input/, file);
    }
    assert.match(
        readSource(
            "src/features/settings/components/sections/Commands.tsx"
        ),
        /studio-command-card/
    );
    assert.match(
        readSource("src/features/settings/components/sections/Logs.tsx"),
        /studio-logs-list/
    );
    assert.match(
        readSource("src/features/settings/components/sections/Debug.tsx"),
        /studio-debug-grid/
    );
});

test("Home uses the main-owned now-playing queue composition and themed actions", () => {
    const home = readSource("src/ui/components/HomePage.tsx");
    const sessionView = readSource(
        "src/features/home/HomeSessionView.tsx"
    );
    const dialog = readSource(
        "src/features/home/HomeConnectionsDialog.tsx"
    );
    const homeCss = readSource("src/ui/components/homeStudio.css");
    assert.match(home, /HomeSessionView/);
    assert.match(home, /useHomeSession/);
    assert.match(sessionView, /home\.nowPlaying/);
    assert.match(sessionView, /home\.queueTitle/);
    assert.match(sessionView, /home\.queueEmpty/);
    assert.doesNotMatch(sessionView, /home\.queueComingSoon|home\.queueCount/);
    assert.doesNotMatch(home, /home\.queueComingSoon|home\.queueCount/);
    assert.match(home, /home\.connections\.title/);
    assert.match(home, /HomeConnectionsDialog/);
    assert.match(homeCss, /studio-home-queue/);
    assert.match(homeCss, /studio-home-queue-list/);
    assert.match(dialog, /home\.connections\.actionSetUp/);
    assert.match(dialog, /:auth/);
    assert.match(dialog, /:logout/);
    assert.doesNotMatch(dialog, /SpotifyCard|KickCard|TwitchCard/);
    assert.doesNotMatch(home, /Midnight City|M83|QUEUE/);
});

test("Settings uses one visible page title and Studio group/nav typography", () => {
    const settings = readSource(
        "src/features/settings/components/Settings.tsx"
    );
    const nav = readSource(
        "src/ui/components/studio/SectionNav.tsx"
    );
    const css = readSource("src/ui/components/studio/studio.css");
    assert.match(settings, /className="studio-settings-title"/);
    assert.match(settings, /navTitle=\{t\("settings\.title"\)\}/);
    assert.match(settings, /setActiveSection\(requestedSection\)/);
    assert.match(nav, /studio-nav-title/);
    assert.match(css, /\.studio-nav-label[^}]*text-transform: uppercase/);
    assert.match(css, /\.studio-nav-item[^}]*font: 500 13\.5px/);
});

test("Studio shell geometry and overlays use the 38px titlebar inset", () => {
    const settings = readSource(
        "src/features/settings/components/settingsStudio.css"
    );
    const home = readSource("src/ui/components/homeStudio.css");
    assert.match(settings, /inset: 38px 0 0/);
    assert.match(home, /inset: 38px 0 0/);
    assert.match(settings, /width: min\(960px, 100%\)/);
});
