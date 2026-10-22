"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const {
    sanitizeConfigUpdate,
    sanitizeConfigForRenderer,
} = require("../src/core/config/rendererConfig");

const VALID_SETTINGS = {
    language: "tr",
    defaultsLanguage: "tr",
    autoFollowLanguageDefaults: false,
    prefix: "?",
    commands: { sr: { enabled: false, aliases: ["request"] } },
    allowedBadges: ["vip"],
    customModerators: ["Mod"],
    canAnyonePlaySong: true,
    rewardTitle: "Song Request",
    twitchRewardTitle: "Song Request",
    replyOnSongRequest: false,
    songRequestReplyTemplate: "Added {title}",
    replyOnSongRequestError: false,
    songRequestErrorTemplate: "Nope",
    replyOnVolumeChange: false,
    volumeChangeReplyTemplate: "Vol {volume}",
    replyOnVolumeError: false,
    volumeErrorTemplate: "Vol fail",
    replyOnVolumeGet: false,
    volumeGetReplyTemplate: "Vol is {volume}",
    globalCooldownEnabled: false,
    globalCooldownSeconds: "10",
    perUserCooldownEnabled: false,
    perUserCooldownSeconds: "20",
    replyOnCooldown: false,
    cooldownMessageTemplate: "Wait {time}",
    currentSongFormat: "{title}",
    saveCurrentSongToFile: true,
    autoUpdateEnabled: false,
    startOnStartup: true,
    minimizeToTray: true,
    kickRedirectUri: "http://localhost:8889/callback",
    spotifyRedirectUri: "http://127.0.0.1:8888/callback",
    spotifyClientId: "spotify-client-id",
    kickClientId: "kick-client-id",
    twitchClientId: "twitch-client-id",
};

test("config update keeps settable fields and drops credentials, flags and unknown keys", () => {
    const patch = sanitizeConfigUpdate({
        ...VALID_SETTINGS,
        kickAccessToken: "kick-access-secret",
        spotifyRefreshToken: "spotify-refresh-secret",
        twitchClientSecret: "twitch-client-secret",
        codeVerifier: "verifier-secret",
        hasKickAccessToken: true,
        hasSpotifyClientSecret: true,
        unknownKey: "nope",
        __proto__: { polluted: true },
        constructor: "nope",
        prototype: "nope",
        username: "someone",
        userId: "42",
        currentSongFilePath: "C:\\attacker\\target.txt",
    });

    for (const [key, value] of Object.entries(VALID_SETTINGS)) {
        assert.deepEqual(patch[key], value, `${key} should be kept`);
    }

    const serialized = JSON.stringify(patch);
    assert.doesNotMatch(serialized, /kick-access-secret|spotify-refresh-secret|twitch-client-secret|verifier-secret/);
    for (const key of [
        "kickAccessToken",
        "spotifyRefreshToken",
        "twitchClientSecret",
        "codeVerifier",
        "hasKickAccessToken",
        "hasSpotifyClientSecret",
        "unknownKey",
        "username",
        "userId",
        "currentSongFilePath",
    ]) {
        assert.equal(
            Object.prototype.hasOwnProperty.call(patch, key),
            false,
            `${key} must be dropped`
        );
    }
    assert.equal({}.polluted, undefined);
    assert.equal(Object.prototype.polluted, undefined);
});

test("config update safely rejects malformed payloads without mutating input", () => {
    for (const malformed of [null, undefined, "nope", 42, [], [1, 2], true]) {
        const patch = sanitizeConfigUpdate(malformed);
        assert.equal(typeof patch, "object");
        assert.deepEqual(patch, {});
    }

    const input = { language: "en", kickClientSecret: "secret" };
    const patch = sanitizeConfigUpdate(input);
    assert.deepEqual(patch, { language: "en" });
    assert.equal(input.kickClientSecret, "secret");
});

test("config update skips undefined values but keeps false and empty strings", () => {
    const patch = sanitizeConfigUpdate({
        language: undefined,
        minimizeToTray: false,
        songRequestReplyTemplate: "",
    });
    assert.equal(
        Object.prototype.hasOwnProperty.call(patch, "language"),
        false
    );
    assert.equal(patch.minimizeToTray, false);
    assert.equal(patch.songRequestReplyTemplate, "");
});

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

function configSetHarness() {
    const handlers = new Map();
    const state = {
        language: "en",
        startOnStartup: false,
        saveCurrentSongToFile: false,
        commands: {},
    };
    const writes = [];
    const loginItems = [];
    const saving = { started: 0, stopped: 0 };
    const manager = {
        updateCommandAliases() {
            return true;
        },
        reloadCommandAliasesFromConfig() {},
    };
    const stubs = {
        electron: {
            app: {
                getPath: () => "C:\\fake",
                getVersion: () => "test",
                on() {},
                setLoginItemSettings: (settings) => loginItems.push(settings),
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
            default: {
                get: (key) => (key === undefined ? { ...state } : state[key]),
                set: (patch) => {
                    writes.push(patch);
                    Object.assign(state, patch);
                },
            },
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
                updateCommandAliases() {
                    return true;
                }
                reloadCommandAliasesFromConfig() {}
            },
        },
        "@/core/commands/registry": { registerAllCommands() {} },
        "@/core/config/rendererConfig": require("../src/core/config/rendererConfig"),
        "@/shared/utils/windowSend": { sendToWindowIfAlive: () => true },
        "@/shared/utils/externalUrl": require("../src/shared/utils/externalUrl"),
        "@/features/spotify/playback/player": {
            startSongFileSaving() {
                saving.started += 1;
            },
            stopSongFileSaving() {
                saving.stopped += 1;
            },
        },
    };
    const loaded = load(stubs, "src/core/ipc/handlers.ts");
    return { handlers, state, writes, loginItems, saving, manager, loaded };
}

test("config:set persists only allowlisted fields and keeps side effects", () => {
    const harness = configSetHarness();
    const handler = harness.handlers.get("config:set");
    assert.equal(typeof handler, "function");

    handler({}, {
        language: "tr",
        startOnStartup: true,
        saveCurrentSongToFile: true,
        kickClientSecret: "kick-client-secret",
        hasKickAccessToken: true,
        unknownKey: "nope",
    });

    assert.deepEqual(harness.writes, [
        {
            language: "tr",
            startOnStartup: true,
            saveCurrentSongToFile: true,
        },
    ]);
    assert.deepEqual(harness.loginItems, [
        { openAtLogin: true, openAsHidden: true },
    ]);
    assert.equal(harness.saving.started, 1);
    assert.equal(harness.saving.stopped, 0);
});

test("config:set ignores credential-only, flag-only and malformed payloads", () => {
    const harness = configSetHarness();
    const handler = harness.handlers.get("config:set");

    assert.doesNotThrow(() => handler({}, null));
    assert.doesNotThrow(() =>
        handler({}, { kickAccessToken: "secret", spotifyClientSecret: "secret" })
    );
    assert.doesNotThrow(() => handler({}, { hasSpotifyAccessToken: true }));
    assert.doesNotThrow(() => handler({}, "not-an-object"));

    assert.deepEqual(harness.writes, []);
    assert.deepEqual(harness.loginItems, []);
    assert.equal(harness.saving.started, 0);
    assert.equal(harness.saving.stopped, 0);
});

test("config:set cannot pollute prototypes", () => {
    const harness = configSetHarness();
    const handler = harness.handlers.get("config:set");

    const payload = JSON.parse(
        '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"language":"en"}'
    );
    handler({}, payload);

    assert.deepEqual(harness.writes, [{ language: "en" }]);
    assert.equal({}.polluted, undefined);
    assert.equal(Object.prototype.polluted, undefined);
});

test("config:get response stays sanitized for the renderer", () => {
    const projection = sanitizeConfigForRenderer({
        language: "en",
        kickAccessToken: "kick-access-secret",
    });
    assert.equal(projection.language, "en");
    assert.equal(projection.hasKickAccessToken, true);
    assert.equal(projection.kickAccessToken, undefined);
});
