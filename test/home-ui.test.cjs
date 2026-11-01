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

function renderComponent(relativePath, props = {}, translator) {
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
                        t:
                            translator ||
                            ((key, options) =>
                                options && options.count !== undefined
                                    ? `${key}:${options.count}`
                                    : key),
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

function translatorFor(locale) {
    return (key, options = {}) => {
        let value = locale;
        for (const part of key.split(".")) {
            if (!value || typeof value !== "object") return key;
            value = value[part];
        }
        if (typeof value !== "string") return key;
        return value.replace(/\{\{(\w+)\}\}/g, (_match, name) =>
            options[name] === undefined ? `{{${name}}}` : String(options[name])
        );
    };
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

test("Home renders now-playing and local queue loading states with a connections rail", () => {
    const html = renderComponent("src/ui/components/HomePage.tsx");
    assert.match(html, /studio-home/);
    assert.match(html, /home\.nowPlaying/);
    assert.match(html, /home\.nowPlayingLoading/);
    assert.match(html, /home\.queueTitle/);
    assert.match(html, /home\.queueLoading/);
    assert.doesNotMatch(html, /home\.latestRequest|home\.noRequestsYet/);
    assert.doesNotMatch(html, /home\.queueComingSoon|home\.queueComingSoonCopy/);
    assert.doesNotMatch(html, /home\.acceptedRequest|home\.acceptedRequests/);
    assert.match(html, /home\.connections\.title/);
    assert.match(html, /home\.connections\.music/);
    assert.match(html, /home\.connections\.streaming/);
    assert.match(html, /home\.connections\.manage/);
    assert.doesNotMatch(html, /settings-section/);
    assert.doesNotMatch(html, /Midnight City|M83|QUEUE/);
    assert.doesNotMatch(html, /home\.queue\.demo/);
});

test("HomeSessionView renders playing, idle, loading and error states truthfully", () => {
    const playing = {
        revision: 1,
        current: {
            status: "playing",
            title: "Current Song",
            artist: "Current Artist",
            artworkUrl: "https://images.example/current.jpg",
            error: null,
        },
        queue: [],
        queueScope: "session",
    };
    const playingHtml = renderComponent(
        "src/features/home/HomeSessionView.tsx",
        { session: playing, loading: false, error: false, now: 1000 },
        translatorFor(en)
    );
    assert.match(playingHtml, /Now playing/);
    assert.match(playingHtml, /Current Song/);
    assert.match(playingHtml, /by Current Artist/);
    assert.match(playingHtml, /https:\/\/images\.example\/current\.jpg/);
    assert.match(playingHtml, /No requests waiting/);
    assert.doesNotMatch(playingHtml, /Session queue/);
    assert.doesNotMatch(playingHtml, /Coming soon/);
    assert.doesNotMatch(playingHtml, /Latest request/);

    const idle = {
        ...playing,
        current: {
            status: "idle",
            title: null,
            artist: null,
            artworkUrl: null,
            error: null,
        },
    };
    const idleHtml = renderComponent(
        "src/features/home/HomeSessionView.tsx",
        { session: idle, loading: false, error: false, now: 1000 },
        translatorFor(en)
    );
    assert.match(idleHtml, /Nothing playing/);
    assert.doesNotMatch(idleHtml, /Current Song/);

    const loadingHtml = renderComponent(
        "src/features/home/HomeSessionView.tsx",
        { session: null, loading: true, error: false, now: 1000 },
        translatorFor(en)
    );
    assert.match(loadingHtml, /Loading now playing/);
    assert.match(loadingHtml, /Loading queue/);

    const errorHtml = renderComponent(
        "src/features/home/HomeSessionView.tsx",
        { session: null, loading: false, error: true, now: 1000 },
        translatorFor(en)
    );
    assert.match(errorHtml, /Playback unavailable/);
    assert.match(errorHtml, /Queue unavailable/);
    assert.match(errorHtml, /role="alert"/);
});

test("HomeSessionView renders local queue entries with position, requester and platform", () => {
    const session = {
        revision: 3,
        current: {
            status: "playing",
            title: "Current",
            artist: "Artist",
            artworkUrl: null,
            error: null,
        },
        queue: [
            {
                id: "queue-1",
                title: "Waiting One",
                artist: "Artist One",
                requester: "viewer-a",
                platform: "kick",
                acceptedAt: 1000,
                position: 1,
                artworkUrl: "https://images.example/queue-1.jpg",
            },
            {
                id: "queue-2",
                title: "Waiting Two",
                artist: "Artist Two",
                requester: "viewer-b",
                platform: "twitch",
                acceptedAt: 2000,
                position: 2,
                artworkUrl: null,
            },
        ],
        queueScope: "session",
    };
    const html = renderComponent(
        "src/features/home/HomeSessionView.tsx",
        { session, loading: false, error: false, now: 121000 },
        translatorFor(en)
    );
    assert.match(html, /https:\/\/images\.example\/queue-1\.jpg/);
    assert.match(html, /studio-home-queue-art/);
    assert.doesNotMatch(html, /#1|#2/);
    assert.match(html, /Waiting One/);
    assert.match(html, /Waiting Two/);
    assert.match(html, /viewer-a · Kick/);
    assert.match(html, /viewer-b · Twitch/);
    assert.match(html, /2m ago/);
    assert.match(html, /<ol/);
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

test("connection actions expose localized provider-plus-action names", () => {
    const views = homeConnections.deriveHomeConnections({
        spotify: {
            hasSecrets: true,
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
            hasSecrets: true,
            authenticated: false,
            listening: false,
            error: false,
        },
    });
    const props = {
        views,
        onClose() {},
        onRefresh() {},
        onOpenSettings() {},
        onSpotifyAuth() {},
    };
    const enHtml = renderComponent(
        "src/features/home/HomeConnectionsDialog.tsx",
        props,
        translatorFor(en)
    );
    for (const service of ["Spotify", "Kick", "Twitch"]) {
        assert.match(enHtml, new RegExp(`aria-label="Connect ${service}"`));
    }
    assert.equal((enHtml.match(/>Connect</g) || []).length, 3);

    const trHtml = renderComponent(
        "src/features/home/HomeConnectionsDialog.tsx",
        props,
        translatorFor(tr)
    );
    for (const service of ["Spotify", "Kick", "Twitch"]) {
        assert.match(
            trHtml,
            new RegExp(`aria-label="${service} — Bağlan"`)
        );
    }
    assert.equal((trHtml.match(/>Bağlan</g) || []).length, 3);
});

test("Home keeps the main-owned session source and omits demo queue rows", () => {
    const source = readSource("src/ui/components/HomePage.tsx");
    const session = readSource("src/features/home/useHomeSession.ts");
    const dialog = readSource(
        "src/features/home/HomeConnectionsDialog.tsx"
    );
    const store = readSource("src/features/home/useHomeConnections.ts");
    assert.match(source, /useHomeSession/);
    assert.match(source, /HomeSessionView/);
    assert.match(source, /useUpdateStatus/);
    assert.match(source, /StudioTheme/);
    assert.match(source, /HomeConnectionsDialog/);
    assert.match(source, /onSpotifyAuth/);
    assert.doesNotMatch(source, /songRequest:getCount|songRequest:completed/);
    assert.match(session, /home:getSession/);
    assert.match(session, /home:sessionUpdated/);
    assert.match(session, /removeListener/);
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
        "home.byArtist",
        "home.nowPlaying",
        "home.nowPlayingLoading",
        "home.nothingPlaying",
        "home.nothingPlayingCopy",
        "home.playbackUnavailable",
        "home.playbackUnavailableCopy",
        "home.queueTitle",
        "home.queueEmpty",
        "home.queueEmptyCopy",
        "home.queueLoading",
        "home.queueUnavailable",
        "home.queueUnavailableCopy",
        "home.queueRequester",
        "home.queueSessionNote",
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
        "home.connections.actionForService",
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

test("Home queue presents a localized empty session state without fake counts", () => {
    assert.equal(en.home.queueEmpty, "No requests waiting");
    assert.equal(tr.home.queueEmpty, "Bekleyen istek yok");
    assert.match(en.home.queueSessionNote, /session queue/i);
    assert.match(tr.home.queueSessionNote, /oturum kuyruğu/i);
    assert.equal("queueComingSoon" in en.home, false);
    assert.equal("queueComingSoon" in tr.home, false);
    assert.equal("queueCount" in en.home, false);
    assert.equal("acceptedRequests" in en.home, false);
});
