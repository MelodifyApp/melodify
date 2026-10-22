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

test("renderer projection strips credentials inside arrays and nested arrays", () => {
    const result = sanitizeConfigForRenderer({
        languages: ["en", "tr"],
        sessions: [{ accessToken: "array-access-secret", safe: 1 }],
        matrix: [[{ clientSecret: "nested-array-secret", ok: true }]],
    });

    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /array-access-secret/);
    assert.doesNotMatch(serialized, /nested-array-secret/);
    assert.deepEqual(result.languages, ["en", "tr"]);
    assert.equal(result.sessions[0].accessToken, undefined);
    assert.equal(result.sessions[0].safe, 1);
    assert.equal(result.matrix[0][0].clientSecret, undefined);
    assert.equal(result.matrix[0][0].ok, true);
});

test("renderer projection strips credentials at any object depth", () => {
    const deep = {
        level1: {
            level2: {
                level3: {
                    level4: {
                        level5: {
                            level6: {
                                codeVerifier: "deep-verifier-secret",
                                safe: "kept",
                            },
                        },
                    },
                },
            },
        },
    };

    const result = sanitizeConfigForRenderer(deep);
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /deep-verifier-secret/);
    assert.equal(
        result.level1.level2.level3.level4.level5.level6.codeVerifier,
        undefined
    );
    assert.equal(result.level1.level2.level3.level4.level5.level6.safe, "kept");
});

test("renderer projection survives circular references without leaking", () => {
    const node = { safe: 1, kickRefreshToken: "cycle-secret" };
    node.self = node;

    const result = sanitizeConfigForRenderer({ node });
    assert.equal(result.node.kickRefreshToken, undefined);
    assert.equal(result.node.safe, 1);
    assert.doesNotThrow(() => JSON.stringify(result));
    assert.doesNotMatch(JSON.stringify(result), /cycle-secret/);
});

test("config:get IPC handler returns the sanitized projection", () => {
    const handlers = new Map();
    const stored = {
        ...SECRET_VALUES,
        nestedList: [{ twitchClientSecret: "twitch-array-secret" }],
        deep: {
            a: { b: { c: { d: { e: { spotifyRefreshToken: "deep-refresh-secret" } } } } },
        },
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
    assert.doesNotMatch(serialized, /twitch-array-secret|deep-refresh-secret/);
    assert.equal(result.hasKickAccessToken, true);
    assert.equal(result.hasSpotifyClientSecret, true);
    assert.equal(result.language, "en");
    assert.equal(result.prefix, "!");
    assert.equal(result.minimizeToTray, true);
});
