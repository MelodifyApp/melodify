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

function withCssStub(callback) {
    require.extensions[".css"] = () => {};
    try {
        return callback();
    } finally {
        if (originalCss) require.extensions[".css"] = originalCss;
        else delete require.extensions[".css"];
    }
}

function renderComponent(relativePath, props = {}) {
    return withCssStub(() => {
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
                        t: (key, options) =>
                            options && options.count !== undefined
                                ? `${key}:${options.count}`
                                : key,
                    }),
                };
            }
            return originalLoad.call(this, request, parent, isMain);
        };
        try {
            const resolved = require.resolve(path.join(root, relativePath));
            delete require.cache[resolved];
            const Component = require(resolved).default;
            return renderToStaticMarkup(
                React.createElement(Component, props)
            );
        } finally {
            Module._resolveFilename = originalResolve;
            Module._load = originalLoad;
        }
    });
}

const homeTime = load("src/features/home/homeTime.ts");
const homeConnections = load("src/features/home/homeConnections.ts");
const en = require("../src/core/i18n/locales/en.json");
const tr = require("../src/core/i18n/locales/tr.json");

test("Home time labels use stable units without locale-dependent strings", () => {
    const now = new Date("2026-10-30T12:00:00Z");
    assert.deepEqual(
        homeTime.timeAgoParts(new Date("2026-10-30T11:59:30Z"), now),
        { unit: "now", count: 0 }
    );
    assert.deepEqual(
        homeTime.timeAgoParts(new Date("2026-10-30T11:55:00Z"), now),
        { unit: "minutes", count: 5 }
    );
    assert.deepEqual(
        homeTime.timeAgoParts(new Date("2026-10-30T10:00:00Z"), now),
        { unit: "hours", count: 2 }
    );
    assert.deepEqual(
        homeTime.timeAgoParts(new Date("2026-10-27T12:00:00Z"), now),
        { unit: "days", count: 3 }
    );
    assert.equal(
        homeTime.timeAgoParts(new Date("not-a-date"), now),
        null
    );
});

test("Home connection states derive only from real provider flags", () => {
    const views = homeConnections.deriveHomeConnections({
        spotify: {
            hasSecrets: true,
            authenticated: true,
            hasSession: true,
            error: false,
        },
        kick: {
            hasSecrets: true,
            authenticated: false,
            listening: false,
            error: false,
        },
        twitch: {
            hasSecrets: false,
            authenticated: false,
            listening: false,
            error: false,
        },
    });
    assert.deepEqual(views.spotify, {
        id: "spotify",
        state: "connected",
        tone: "ok",
    });
    assert.deepEqual(views.kick, {
        id: "kick",
        state: "connect",
        tone: "warn",
    });
    assert.deepEqual(views.twitch, {
        id: "twitch",
        state: "setup",
        tone: "warn",
    });
    assert.equal(
        homeConnections.homeConnectionMessageKey(views.spotify),
        "home.connections.ready"
    );
    assert.equal(
        homeConnections.homeConnectionMessageKey({
            id: "kick",
            state: "connected",
            tone: "ok",
        }),
        "home.connections.listening"
    );
    assert.equal(
        homeConnections.homeConnectionMessageKey(views.twitch),
        "home.connections.needsSetup"
    );

    const attention = homeConnections.deriveHomeConnections({
        spotify: {
            hasSecrets: true,
            authenticated: true,
            hasSession: false,
            error: false,
        },
        kick: {
            hasSecrets: true,
            authenticated: true,
            listening: false,
            error: false,
        },
        twitch: {
            hasSecrets: true,
            authenticated: true,
            listening: true,
            error: false,
        },
    });
    assert.equal(attention.spotify.state, "attention");
    assert.equal(attention.kick.state, "attention");
    assert.equal(attention.twitch.state, "connected");

    const guestReader = homeConnections.deriveHomeConnections({
        spotify: {
            hasSecrets: false,
            authenticated: false,
            hasSession: false,
            error: false,
        },
        kick: {
            hasSecrets: false,
            authenticated: false,
            listening: true,
            error: false,
        },
        twitch: {
            hasSecrets: false,
            authenticated: false,
            listening: false,
            error: false,
        },
    });
    assert.equal(guestReader.kick.state, "connected");
    assert.equal(guestReader.spotify.state, "setup");
    assert.equal(guestReader.twitch.state, "setup");

    const loading = homeConnections.deriveHomeConnections(
        homeConnections.emptyHomeConnectionFlags()
    );
    assert.equal(loading.spotify.state, "loading");
    assert.equal(loading.kick.state, "loading");
    assert.equal(loading.twitch.state, "loading");

    const unavailable = homeConnections.deriveHomeConnections({
        spotify: {
            hasSecrets: null,
            authenticated: null,
            hasSession: null,
            error: true,
        },
        kick: {
            hasSecrets: null,
            authenticated: null,
            listening: null,
            error: true,
        },
        twitch: {
            hasSecrets: null,
            authenticated: null,
            listening: null,
            error: true,
        },
    });
    assert.equal(unavailable.spotify.state, "unavailable");
    assert.equal(unavailable.kick.tone, "error");
});

test("Home connections load only through read channels", async () => {
    const calls = [];
    const bridge = {
        invoke: async (channel) => {
            calls.push(channel);
            switch (channel) {
                case "spotify:hasSecrets":
                    return true;
                case "spotify:checkAuth":
                    return { authenticated: true };
                case "spotify:hasSession":
                    return true;
                case "kick:hasSecrets":
                    return true;
                case "kick:checkAuth":
                    return { authenticated: true };
                case "kick:isListeningToChat":
                    return true;
                case "twitch:hasSecrets":
                    return false;
                case "twitch:checkAuth":
                    return { authenticated: false };
                case "twitch:isListeningToChat":
                    return false;
                default:
                    throw new Error(`unexpected ${channel}`);
            }
        },
    };
    const flags = await homeConnections.loadHomeConnections(bridge);
    assert.deepEqual(flags.spotify, {
        hasSecrets: true,
        authenticated: true,
        hasSession: true,
        error: false,
    });
    assert.deepEqual(flags.twitch, {
        hasSecrets: false,
        authenticated: false,
        listening: false,
        error: false,
    });
    assert.deepEqual(calls.sort(), [
        "kick:checkAuth",
        "kick:hasSecrets",
        "kick:isListeningToChat",
        "spotify:checkAuth",
        "spotify:hasSecrets",
        "spotify:hasSession",
        "twitch:checkAuth",
        "twitch:hasSecrets",
    ]);
    assert.equal(
        calls.some((channel) => /^.*:(send|set|logout|auth)$/.test(channel)),
        false
    );
});

test("Home connections mark a failed provider as unavailable", async () => {
    const bridge = {
        invoke: async (channel) => {
            if (channel === "twitch:hasSecrets") {
                throw new Error("offline");
            }
            if (channel.endsWith("hasSecrets")) return false;
            if (channel.endsWith("checkAuth")) {
                return { authenticated: false };
            }
            return false;
        },
    };
    const flags = await homeConnections.loadHomeConnections(bridge);
    assert.equal(flags.twitch.error, true);
    const views = homeConnections.deriveHomeConnections(flags);
    assert.equal(views.twitch.state, "unavailable");
    assert.equal(views.twitch.tone, "error");
});

test("Home reads Kick guest presence even without an authenticated session", async () => {
    const calls = [];
    const bridge = {
        invoke: async (channel) => {
            calls.push(channel);
            if (channel === "kick:isListeningToChat") return true;
            if (channel.endsWith("hasSecrets")) return false;
            if (channel.endsWith("checkAuth")) {
                return { authenticated: false };
            }
            throw new Error(`unexpected ${channel}`);
        },
    };
    const flags = await homeConnections.loadHomeConnections(bridge);
    assert.deepEqual(calls.sort(), [
        "kick:checkAuth",
        "kick:hasSecrets",
        "kick:isListeningToChat",
        "spotify:checkAuth",
        "spotify:hasSecrets",
        "twitch:checkAuth",
        "twitch:hasSecrets",
    ]);
    assert.equal(flags.spotify.authenticated, false);
    assert.equal(flags.kick.authenticated, false);
    assert.equal(flags.kick.listening, true);
    assert.equal(flags.twitch.listening, false);
    const views = homeConnections.deriveHomeConnections(flags);
    assert.equal(views.kick.state, "connected");
    const html = renderComponent(
        "src/features/home/HomeConnectionsDialog.tsx",
        {
            views,
            onClose() {},
            onRefresh() {},
            onOpenSettings() {},
            onSpotifyAuth() {},
        }
    );
    assert.match(html, /home\.connections\.listening/);
    assert.match(html, /home\.connections\.actionDisconnect/);
});

test("Home periodic presence reads Kick independently of OAuth", async () => {
    const calls = [];
    const bridge = {
        invoke: async (channel) => {
            calls.push(channel);
            if (channel === "kick:isListeningToChat") return true;
            throw new Error(`unexpected ${channel}`);
        },
    };
    const flags = {
        spotify: {
            hasSecrets: false,
            authenticated: false,
            hasSession: false,
            error: false,
        },
        kick: {
            hasSecrets: true,
            authenticated: false,
            listening: false,
            error: false,
        },
        twitch: {
            hasSecrets: false,
            authenticated: false,
            listening: false,
            error: false,
        },
    };
    const reads = await homeConnections.readHomePresence(bridge, flags);
    assert.deepEqual(reads.kick, { value: true, error: false });
    assert.deepEqual(calls, ["kick:isListeningToChat"]);
});

test("Home surfaces Spotify auth pending, failure, timeout and retry states", () => {
    const flags = {
        spotify: {
            hasSecrets: true,
            authenticated: false,
            hasSession: false,
            error: false,
        },
        kick: {
            hasSecrets: false,
            authenticated: false,
            listening: false,
            error: false,
        },
        twitch: {
            hasSecrets: false,
            authenticated: false,
            listening: false,
            error: false,
        },
    };

    const pending = homeConnections.deriveHomeConnections(flags, {
        state: "pending",
        reason: null,
        canRetry: false,
    });
    assert.equal(pending.spotify.state, "pending");
    assert.equal(
        homeConnections.homeConnectionMessageKey(pending.spotify),
        "home.connections.connecting"
    );

    const failed = homeConnections.deriveHomeConnections(flags, {
        state: "bind-error",
        reason: "bind-failed",
        canRetry: true,
    });
    assert.equal(failed.spotify.state, "auth-error");
    assert.equal(
        homeConnections.homeConnectionMessageKey(failed.spotify),
        "home.connections.authFailed"
    );

    const timeout = homeConnections.deriveHomeConnections(flags, {
        state: "timeout",
        reason: "timeout",
        canRetry: true,
    });
    assert.equal(
        homeConnections.homeConnectionMessageKey(timeout.spotify),
        "home.connections.authTimeout"
    );
    assert.deepEqual(
        homeConnections.readSpotifyAuthState({
            state: "bind-error",
            reason: "bind-failed",
            canRetry: true,
        }),
        {
            state: "bind-error",
            reason: "bind-failed",
            canRetry: true,
        }
    );
    assert.equal(
        homeConnections.readSpotifyAuthState({
            state: "unknown",
            reason: "raw detail",
        }).state,
        "idle"
    );

    const connectedFlags = {
        ...flags,
        spotify: { ...flags.spotify, authenticated: true, hasSession: true },
    };
    assert.equal(
        homeConnections.deriveHomeConnections(connectedFlags, {
            state: "failed",
            reason: "exchange-failed",
            canRetry: true,
        }).spotify.state,
        "connected"
    );

    const html = renderComponent(
        "src/features/home/HomeConnectionsDialog.tsx",
        {
            views: failed,
            onClose() {},
            onRefresh() {},
            onOpenSettings() {},
            onSpotifyAuth() {},
        }
    );
    assert.match(html, /home\.connections\.authFailed/);
    assert.match(html, /home\.connections\.actionRetry/);

    const pendingHtml = renderComponent(
        "src/features/home/HomeConnectionsDialog.tsx",
        {
            views: pending,
            onClose() {},
            onRefresh() {},
            onOpenSettings() {},
            onSpotifyAuth() {},
        }
    );
    assert.match(pendingHtml, /home\.connections\.connecting/);
    assert.match(pendingHtml, /disabled/);
});

test("Home renders a real latest-request summary and a connections rail", () => {
    const html = renderComponent("src/ui/components/HomePage.tsx");
    assert.match(html, /studio-home/);
    assert.match(html, /home\.latestRequest/);
    assert.match(html, /home\.noRequestsYet/);
    assert.match(html, /home\.noRequestsCopy/);
    assert.match(html, /home\.queueTitle/);
    assert.match(html, /home\.queueComingSoon/);
    assert.match(html, /home\.queueComingSoonCopy/);
    assert.doesNotMatch(html, /home\.queueCount|home\.queueEmpty/);
    assert.match(html, /home\.acceptedRequests/);
    assert.match(html, /home\.connections\.title/);
    assert.match(html, /home\.connections\.music/);
    assert.match(html, /home\.connections\.streaming/);
    assert.match(html, /home\.connections\.manage/);
    assert.doesNotMatch(html, /settings-section/);
    assert.doesNotMatch(html, /Midnight City|M83|QUEUE/);
    assert.doesNotMatch(html, /home\.queue\.demo/);
});

test("Connections dialog presents real status rows and is modal", () => {
    const views = homeConnections.deriveHomeConnections(
        homeConnections.emptyHomeConnectionFlags()
    );
    const html = renderComponent(
        "src/features/home/HomeConnectionsDialog.tsx",
        {
            views,
            onClose() {},
            onRefresh() {},
            onOpenSettings() {},
        }
    );
    assert.match(html, /role="dialog"/);
    assert.match(html, /aria-modal="true"/);
    assert.match(html, /home\.connections\.title/);
    assert.match(html, /Spotify/);
    assert.match(html, /Kick/);
    assert.match(html, /Twitch/);
    assert.match(html, /common\.close/);
    assert.match(html, /home\.connections\.refreshStatus/);
    assert.doesNotMatch(html, /studio-provider-card/);
});

test("Home keeps real song-request and update sources and omits demo queue rows", () => {
    const source = readSource("src/ui/components/HomePage.tsx");
    const dialog = readSource(
        "src/features/home/HomeConnectionsDialog.tsx"
    );
    const store = readSource("src/features/home/useHomeConnections.ts");
    assert.match(source, /songRequest:getCount/);
    assert.match(source, /songRequest:completed/);
    assert.match(source, /useUpdateStatus/);
    assert.match(source, /StudioTheme/);
    assert.match(source, /HomeConnectionsDialog/);
    assert.match(source, /onSpotifyAuth/);
    assert.match(dialog, /:auth/);
    assert.match(dialog, /:logout/);
    assert.match(dialog, /onSpotifyAuth/);
    assert.match(dialog, /kick:retryChat/);
    assert.match(dialog, /twitch:stopListening/);
    assert.match(store, /spotify:authState/);
    assert.match(store, /beginSpotifyAuth/);
    assert.match(store, /spotifyAuthRef\.current\.state === "starting"/);
    assert.match(store, /spotifyAuthRef\.current\.state === "pending"/);
    assert.doesNotMatch(source, /Midnight City|M83|QUEUE/);
    assert.doesNotMatch(dialog, /Midnight City|M83/);
});

test("Home connection labels exist in English and Turkish", () => {
    const keys = [
        "home.latestRequest",
        "home.noRequestsYet",
        "home.noRequestsCopy",
        "home.acceptedRequest",
        "home.acceptedRequests",
        "home.requestSummary",
        "home.queueTitle",
        "home.queueComingSoon",
        "home.queueComingSoonCopy",
        "home.acceptedRequestsLabel",
        "home.lastRequest",
        "home.requestSource",
        "home.connections.title",
        "home.connections.music",
        "home.connections.streaming",
        "home.connections.spotifyRole",
        "home.connections.kickRole",
        "home.connections.twitchRole",
        "home.connections.manage",
        "home.connections.setUp",
        "home.connections.checking",
        "home.connections.connecting",
        "home.connections.authFailed",
        "home.connections.authTimeout",
        "home.connections.ready",
        "home.connections.listening",
        "home.connections.openSpotify",
        "home.connections.connectChat",
        "home.connections.connect",
        "home.connections.needsSetup",
        "home.connections.unavailable",
        "home.connections.notConnected",
        "home.connections.actionSetUp",
        "home.connections.actionConnect",
        "home.connections.actionDisconnect",
        "home.connections.actionReconnect",
        "home.connections.actionRefresh",
        "home.connections.actionRetry",
        "home.connections.refreshStatus",
        "home.timeNow",
        "home.timeMinutes",
        "home.timeHours",
        "home.timeDays",
        "home.updateAvailable",
    ];
    const read = (locale, key) =>
        key
            .split(".")
            .reduce(
                (node, part) =>
                    node && typeof node === "object" ? node[part] : undefined,
                locale
            );
    for (const key of keys) {
        assert.equal(typeof read(en, key), "string", `en missing ${key}`);
        assert.equal(typeof read(tr, key), "string", `tr missing ${key}`);
    }
});

test("Home queue presents a localized Coming soon state without a fake count", () => {
    assert.equal(en.home.queueComingSoon, "Coming soon");
    assert.equal(tr.home.queueComingSoon, "Yakında");
    assert.match(en.home.queueComingSoonCopy, /future update/i);
    assert.match(tr.home.queueComingSoonCopy, /gelecekteki bir güncellemeyle/i);
    assert.equal("queueCount" in en.home, false);
    assert.equal("queueEmpty" in en.home, false);
});
