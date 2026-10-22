"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const { sanitizeConfigUpdate, RENDERER_SETTABLE_KEYS } = require("../src/core/config/rendererConfig");

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

function harness() {
    const handlers = new Map();
    const state = {
        language: "en",
        startOnStartup: false,
        saveCurrentSongToFile: false,
        globalCooldownSeconds: "30",
        commands: {},
    };
    const writes = [];
    const loginItems = [];
    const saving = { started: 0, stopped: 0 };
    const stubs = {
        electron: {
            app: {
                getPath: () => "C:\\user-data",
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
                getPath: () => "C:\\user-data",
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
    load(stubs, "src/core/ipc/handlers.ts");
    return { handlers, state, writes, loginItems, saving };
}

const BOOLEAN_KEYS = [
    "autoFollowLanguageDefaults",
    "canAnyonePlaySong",
    "replyOnSongRequest",
    "replyOnSongRequestError",
    "replyOnVolumeChange",
    "replyOnVolumeError",
    "replyOnVolumeGet",
    "globalCooldownEnabled",
    "perUserCooldownEnabled",
    "replyOnCooldown",
    "saveCurrentSongToFile",
    "autoUpdateEnabled",
    "startOnStartup",
    "minimizeToTray",
];

test("boolean settings only accept real booleans", () => {
    for (const key of BOOLEAN_KEYS) {
        assert.equal(sanitizeConfigUpdate({ [key]: true })[key], true, key);
        assert.equal(sanitizeConfigUpdate({ [key]: false })[key], false, key);
        for (const bad of ["true", "false", 1, 0, {}, [], null]) {
            const patch = sanitizeConfigUpdate({ [key]: bad });
            assert.equal(
                Object.prototype.hasOwnProperty.call(patch, key),
                false,
                `${key} must reject ${JSON.stringify(bad)}`
            );
        }
    }
});

test("cooldown seconds accept only in-range integers", () => {
    for (const key of ["globalCooldownSeconds", "perUserCooldownSeconds"]) {
        assert.equal(sanitizeConfigUpdate({ [key]: "30" })[key], "30", key);
        assert.equal(sanitizeConfigUpdate({ [key]: "1" })[key], "1", key);
        assert.equal(sanitizeConfigUpdate({ [key]: "86400" })[key], "86400", key);
        assert.equal(sanitizeConfigUpdate({ [key]: 45 })[key], "45", key);
        for (const bad of [
            "0",
            "-5",
            "100000",
            "1e3",
            "3.5",
            "30s",
            "",
            " ",
            {},
            [],
            true,
        ]) {
            const patch = sanitizeConfigUpdate({ [key]: bad });
            assert.equal(
                Object.prototype.hasOwnProperty.call(patch, key),
                false,
                `${key} must reject ${JSON.stringify(bad)}`
            );
        }
    }
});

test("badge and moderator arrays reject non-strings and oversized lists", () => {
    assert.deepEqual(sanitizeConfigUpdate({ allowedBadges: ["og", "vip"] }), {
        allowedBadges: ["og", "vip"],
    });
    assert.deepEqual(sanitizeConfigUpdate({ allowedBadges: [] }), {
        allowedBadges: [],
    });
    assert.deepEqual(sanitizeConfigUpdate({ customModerators: ["Mod", "Helper"] }), {
        customModerators: ["Mod", "Helper"],
    });

    for (const key of ["allowedBadges", "customModerators"]) {
        assert.equal(
            Object.prototype.hasOwnProperty.call(
                sanitizeConfigUpdate({ [key]: "og,vip" }),
                key
            ),
            false,
            `${key} must reject a string`
        );
        assert.equal(
            Object.prototype.hasOwnProperty.call(
                sanitizeConfigUpdate({ [key]: ["ok", 42] }),
                key
            ),
            false,
            `${key} must reject non-string items`
        );
        assert.equal(
            Object.prototype.hasOwnProperty.call(
                sanitizeConfigUpdate({ [key]: ["x".repeat(51)] }),
                key
            ),
            false,
            `${key} must reject over-long items`
        );
        assert.equal(
            Object.prototype.hasOwnProperty.call(
                sanitizeConfigUpdate({ [key]: new Array(201).fill("ok") }),
                key
            ),
            false,
            `${key} must reject oversized lists`
        );
    }
});

test("string settings are type-checked and length-bounded", () => {
    assert.equal(sanitizeConfigUpdate({ prefix: "!" }).prefix, "!");
    assert.equal(sanitizeConfigUpdate({ prefix: "" }).prefix, undefined);
    assert.equal(sanitizeConfigUpdate({ prefix: "x".repeat(11) }).prefix, undefined);
    assert.equal(sanitizeConfigUpdate({ prefix: 5 }).prefix, undefined);

    for (const key of [
        "songRequestReplyTemplate",
        "songRequestErrorTemplate",
        "volumeChangeReplyTemplate",
        "volumeErrorTemplate",
        "volumeGetReplyTemplate",
        "cooldownMessageTemplate",
        "currentSongFormat",
    ]) {
        assert.equal(sanitizeConfigUpdate({ [key]: "" })[key], "", key);
        assert.equal(
            sanitizeConfigUpdate({ [key]: "x".repeat(500) })[key],
            "x".repeat(500),
            key
        );
        assert.equal(
            Object.prototype.hasOwnProperty.call(
                sanitizeConfigUpdate({ [key]: "x".repeat(501) }),
                key
            ),
            false,
            `${key} must reject over-long templates`
        );
        assert.equal(
            Object.prototype.hasOwnProperty.call(
                sanitizeConfigUpdate({ [key]: { template: "x" } }),
                key
            ),
            false,
            `${key} must reject non-strings`
        );
    }

    for (const key of ["rewardTitle", "twitchRewardTitle"]) {
        assert.equal(sanitizeConfigUpdate({ [key]: "Song Request" })[key], "Song Request");
        assert.equal(
            Object.prototype.hasOwnProperty.call(
                sanitizeConfigUpdate({ [key]: "x".repeat(101) }),
                key
            ),
            false,
            `${key} must reject over-long titles`
        );
    }

    for (const key of ["kickClientId", "spotifyClientId", "twitchClientId"]) {
        assert.equal(sanitizeConfigUpdate({ [key]: "" })[key], "", key);
        assert.equal(
            sanitizeConfigUpdate({ [key]: "client-id_123" })[key],
            "client-id_123",
            key
        );
        assert.equal(
            Object.prototype.hasOwnProperty.call(
                sanitizeConfigUpdate({ [key]: "x".repeat(201) }),
                key
            ),
            false,
            `${key} must reject over-long ids`
        );
        assert.equal(
            Object.prototype.hasOwnProperty.call(sanitizeConfigUpdate({ [key]: 42 }), key),
            false,
            `${key} must reject non-strings`
        );
    }
});

test("redirect URIs must be loopback http(s) URLs", () => {
    for (const key of ["kickRedirectUri", "spotifyRedirectUri"]) {
        assert.equal(
            sanitizeConfigUpdate({ [key]: "http://localhost:8889/callback" })[key],
            "http://localhost:8889/callback",
            key
        );
        assert.equal(
            sanitizeConfigUpdate({ [key]: "http://127.0.0.1:8888/callback" })[key],
            "http://127.0.0.1:8888/callback",
            key
        );
        assert.equal(
            sanitizeConfigUpdate({ [key]: "https://[::1]:8888/callback" })[key],
            "https://[::1]:8888/callback",
            key
        );
        for (const bad of [
            "https://evil.example.com/callback",
            "http://192.168.1.10:8888/callback",
            "ftp://localhost:8889/callback",
            "not a url",
            "localhost:8889/callback",
            "",
            {},
            42,
        ]) {
            const patch = sanitizeConfigUpdate({ [key]: bad });
            assert.equal(
                Object.prototype.hasOwnProperty.call(patch, key),
                false,
                `${key} must reject ${JSON.stringify(bad)}`
            );
        }
    }
});

test("language must be a supported code", () => {
    assert.equal(sanitizeConfigUpdate({ language: "tr" }).language, "tr");
    assert.equal(sanitizeConfigUpdate({ defaultsLanguage: "en" }).defaultsLanguage, "en");
    for (const bad of ["es", "de", "xx", "EN", "", {}, 42]) {
        for (const key of ["language", "defaultsLanguage"]) {
            const patch = sanitizeConfigUpdate({ [key]: bad });
            assert.equal(
                Object.prototype.hasOwnProperty.call(patch, key),
                false,
                `${key} must reject ${JSON.stringify(bad)}`
            );
        }
    }
});

test("command config keeps only well-formed entries", () => {
    const good = {
        sr: { enabled: false, aliases: ["request", "songrequest"] },
    };
    assert.deepEqual(sanitizeConfigUpdate({ commands: good }), { commands: good });

    const patch = sanitizeConfigUpdate({
        commands: {
            sr: { enabled: "yes", aliases: [1, "request", ""] },
            volume: { aliases: new Array(11).fill(0).map((_, i) => `alias${i}`) },
            bad: { unknown: true },
            "__proto__": { enabled: true },
            "not valid!": { enabled: true },
            junk: "nope",
        },
    });
    assert.deepEqual(patch.commands, {
        sr: { aliases: ["request"] },
        volume: {
            aliases: new Array(10).fill(0).map((_, i) => `alias${i}`),
        },
    });
    assert.equal(Object.prototype.hasOwnProperty.call(patch.commands, "bad"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(patch.commands, "__proto__"), false);
    assert.equal({}.polluted, undefined);

    for (const bad of [["sr"], "sr", 42, null, true]) {
        const invalid = sanitizeConfigUpdate({ commands: bad });
        assert.equal(
            Object.prototype.hasOwnProperty.call(invalid, "commands"),
            false,
            `commands must reject ${JSON.stringify(bad)}`
        );
    }
});

test("invalid values are dropped without mutating the payload", () => {
    const payload = {
        language: "xx",
        canAnyonePlaySong: "yes",
        globalCooldownSeconds: "abc",
        commands: { sr: { enabled: "yes", aliases: ["ok"] } },
        kickRedirectUri: "https://evil.example.com/cb",
    };
    const snapshot = JSON.stringify(payload);

    const patch = sanitizeConfigUpdate(payload);

    assert.deepEqual(patch, { commands: { sr: { aliases: ["ok"] } } });
    assert.equal(JSON.stringify(payload), snapshot);
});

test("config:set persists only valid values and keeps side effects", () => {
    const h = harness();
    const handler = h.handlers.get("config:set");

    handler({}, {
        startOnStartup: true,
        saveCurrentSongToFile: "true",
        globalCooldownSeconds: "abc",
        language: "xx",
        prefix: "?",
    });

    assert.deepEqual(h.writes, [
        { startOnStartup: true, prefix: "?" },
    ]);
    assert.deepEqual(h.loginItems, [{ openAtLogin: true, openAsHidden: true }]);
    assert.equal(h.saving.started, 0);
    assert.equal(h.state.globalCooldownSeconds, "30");
    assert.equal(h.state.language, "en");
});

test("config:set ignores payloads whose values are all invalid", () => {
    const h = harness();
    const handler = h.handlers.get("config:set");

    handler({}, {
        canAnyonePlaySong: "yes",
        globalCooldownSeconds: "abc",
        kickRedirectUri: "https://evil.example.com/cb",
    });

    assert.deepEqual(h.writes, []);
    assert.deepEqual(h.loginItems, []);
});

const VALID_SAMPLE = {
    language: "en",
    defaultsLanguage: "tr",
    autoFollowLanguageDefaults: true,
    prefix: "!",
    commands: { sr: { enabled: true, aliases: ["request"] } },
    allowedBadges: ["vip"],
    customModerators: ["Mod"],
    canAnyonePlaySong: true,
    rewardTitle: "Song Request",
    twitchRewardTitle: "Song Request",
    replyOnSongRequest: true,
    songRequestReplyTemplate: "{title}",
    replyOnSongRequestError: true,
    songRequestErrorTemplate: "{error}",
    replyOnVolumeChange: true,
    volumeChangeReplyTemplate: "{volume}",
    replyOnVolumeError: true,
    volumeErrorTemplate: "{error}",
    replyOnVolumeGet: true,
    volumeGetReplyTemplate: "{volume}",
    globalCooldownEnabled: true,
    globalCooldownSeconds: "30",
    perUserCooldownEnabled: true,
    perUserCooldownSeconds: "60",
    replyOnCooldown: true,
    cooldownMessageTemplate: "Wait {time}",
    currentSongFormat: "{title} - {artist}",
    saveCurrentSongToFile: true,
    autoUpdateEnabled: true,
    startOnStartup: true,
    minimizeToTray: true,
    kickRedirectUri: "http://localhost:8889/callback",
    spotifyRedirectUri: "http://127.0.0.1:8888/callback",
    kickClientId: "kick-client",
    spotifyClientId: "spotify-client",
    twitchClientId: "twitch-client",
};

test("every allowlisted key has a validator that accepts a legitimate value", () => {
    for (const key of RENDERER_SETTABLE_KEYS) {
        assert.ok(
            Object.prototype.hasOwnProperty.call(VALID_SAMPLE, key),
            `missing valid sample for allowlisted key ${key}`
        );
        assert.deepEqual(
            sanitizeConfigUpdate({ [key]: VALID_SAMPLE[key] }),
            { [key]: VALID_SAMPLE[key] },
            `${key} should accept its legitimate value`
        );
    }
    assert.deepEqual(
        sanitizeConfigUpdate(VALID_SAMPLE),
        VALID_SAMPLE,
        "a full legitimate payload should survive intact"
    );
});
