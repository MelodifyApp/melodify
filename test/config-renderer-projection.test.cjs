"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const CREDENTIAL_KEYS = [
    "kickAccessToken",
    "kickRefreshToken",
    "spotifyAccessToken",
    "spotifyRefreshToken",
    "twitchAccessToken",
    "twitchRefreshToken",
    "kickClientSecret",
    "spotifyClientSecret",
    "twitchClientSecret",
    "codeVerifier",
    "kickOAuthState",
    "twitchOAuthState",
    "spotifyOAuthState",
];

const SECRET_VALUES = {
    kickAccessToken: "kick-access-secret",
    kickRefreshToken: "kick-refresh-secret",
    spotifyAccessToken: "spotify-access-secret",
    spotifyRefreshToken: "spotify-refresh-secret",
    twitchAccessToken: "twitch-access-secret",
    twitchRefreshToken: "twitch-refresh-secret",
    kickClientSecret: "kick-client-secret",
    spotifyClientSecret: "spotify-client-secret",
    twitchClientSecret: "twitch-client-secret",
    codeVerifier: "pkce-verifier-secret",
    kickOAuthState: "kick-state-secret",
    twitchOAuthState: "twitch-state-secret",
    spotifyOAuthState: "spotify-state-secret",
};

function load(stubs, relativePath) {
    const originalLoad = Module._load;
    try {
        Module._load = function (request, parent, isMain) {
            if (Object.prototype.hasOwnProperty.call(stubs, request)) {
                return stubs[request];
            }
            return originalLoad.call(this, request, parent, isMain);
        };
        const resolved = require.resolve(path.join(__dirname, "..", relativePath));
        delete require.cache[resolved];
        return require(resolved);
    } finally {
        Module._load = originalLoad;
    }
}

const { sanitizeConfigForRenderer } = require("../src/core/config/rendererConfig");

test("renderer projection drops every credential and exposes presence flags", () => {
    const result = sanitizeConfigForRenderer({
        ...SECRET_VALUES,
        language: "en",
        prefix: "!",
        kickClientId: "kick-client-id",
        spotifyClientId: "spotify-client-id",
        kickRedirectUri: "http://localhost:8889/callback",
        canAnyonePlaySong: false,
        requestsEnabled: true,
        minimizeToTray: false,
        allowedBadges: ["og", "vip"],
        commands: { sr: { enabled: true, aliases: ["request"] } },
    });

    for (const key of CREDENTIAL_KEYS) {
        assert.equal(
            Object.prototype.hasOwnProperty.call(result, key),
            false,
            `${key} must not be returned`
        );
        const flag = `has${key.charAt(0).toUpperCase()}${key.slice(1)}`;
        assert.equal(result[flag], true, `${flag} should report presence`);
    }

    const serialized = JSON.stringify(result);
    for (const value of Object.values(SECRET_VALUES)) {
        assert.doesNotMatch(serialized, new RegExp(value), `${value} leaked`);
    }

    assert.equal(result.language, "en");
    assert.equal(result.prefix, "!");
    assert.equal(result.kickClientId, "kick-client-id");
    assert.equal(result.spotifyClientId, "spotify-client-id");
    assert.equal(result.kickRedirectUri, "http://localhost:8889/callback");
    assert.equal(result.canAnyonePlaySong, false);
    assert.equal(result.requestsEnabled, true);
    assert.equal(result.minimizeToTray, false);
    assert.deepEqual(result.allowedBadges, ["og", "vip"]);
    assert.deepEqual(result.commands, { sr: { enabled: true, aliases: ["request"] } });
});

test("renderer projection reports absent credentials as false and never mutates input", () => {
    const input = { language: "tr", kickClientSecret: "" };
    const result = sanitizeConfigForRenderer(input);

    assert.equal(result.hasKickClientSecret, false);
    assert.equal(result.hasSpotifyAccessToken, false);
    assert.equal(result.hasCodeVerifier, false);
    assert.equal(input.kickClientSecret, "");
    assert.equal(
        Object.prototype.hasOwnProperty.call(result, "kickClientSecret"),
        false
    );
});

test("renderer projection tolerates malformed config values and nested credentials", () => {
    for (const malformed of [null, undefined, "nope", 42, [], [{ kickAccessToken: "x" }]]) {
        const result = sanitizeConfigForRenderer(malformed);
        assert.equal(typeof result, "object");
        assert.equal(result.hasKickAccessToken, false);
        assert.equal(JSON.stringify(result).includes("kickAccessToken"), false);
    }

    const nested = sanitizeConfigForRenderer({
        language: "en",
        nested: { accessToken: "nested-secret", safe: 1 },
    });
    assert.equal(JSON.stringify(nested).includes("nested-secret"), false);
    assert.deepEqual(nested.nested, { safe: 1 });
});

test("config:get IPC handler returns the sanitized projection", () => {
    const handlers = new Map();
    const stored = {
        ...SECRET_VALUES,
        language: "en",
        prefix: "!",
        kickClientId: "kick-client-id",
        minimizeToTray: true,
    };
    const rendererConfig = require("../src/core/config/rendererConfig");
    const stubs = {
        electron: {
            app: {
                getPath: () => "C:\\fake",
                getVersion: () => "test",
                on() {},
            },
            ipcMain: {
                on: (name, handler) => handlers.set(name, handler),
                handle: (name, handler) => handlers.set(name, handler),
            },
            shell: { openExternal() {} },
            dialog: {},
            BrowserWindow: { fromWebContents: () => undefined },
        },
        "@/core/config": {
            __esModule: true,
            default: { get: () => stored, set() {} },
        },
        "@/core/logging": {
            logDebug() {},
            logError() {},
            logInfo() {},
            logWarn() {},
            getSongRequestsForDate() {
                return [];
            },
            getSongRequestsForSession() {
                return [];
            },
        },
        "@/core/logging/utils": { redactSecrets: (value) => value },
        "@/core/commands/manager": {
            CommandManager: class {
                register() {}
                handle() {}
            },
        },
        "@/core/commands/registry": { registerAllCommands() {} },
        "@/core/config/rendererConfig": rendererConfig,
        "@/shared/utils/windowSend": { sendToWindowIfAlive: () => true },
        "@/shared/utils/externalUrl": require("../src/shared/utils/externalUrl"),
        "@/features/spotify/playback/player": {
            startSongFileSaving() {},
            stopSongFileSaving() {},
        },
    };
    load(stubs, "src/core/ipc/handlers.ts");

    const handler = handlers.get("config:get");
    assert.equal(typeof handler, "function");
    const result = handler({});
    const serialized = JSON.stringify(result);
    for (const value of Object.values(SECRET_VALUES)) {
        assert.doesNotMatch(serialized, new RegExp(value), `${value} leaked`);
    }
    assert.equal(result.hasKickAccessToken, true);
    assert.equal(result.hasSpotifyClientSecret, true);
    assert.equal(result.language, "en");
    assert.equal(result.prefix, "!");
    assert.equal(result.minimizeToTray, true);
});
