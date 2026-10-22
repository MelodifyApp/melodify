"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const validation = require("../src/core/ipc/payloadValidation");

const {
    isPlainObject,
    readBoolean,
    readBoundedString,
    readChatMessage,
    readCommandName,
    readCommandAliases,
    readRendererLogPayload,
} = validation;

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

test("isPlainObject accepts objects only", () => {
    assert.equal(isPlainObject({}), true);
    for (const value of [null, undefined, [], "x", 42, true, () => {}]) {
        assert.equal(isPlainObject(value), false, JSON.stringify(value));
    }
});

test("readBoolean accepts only real booleans", () => {
    assert.equal(readBoolean(true), true);
    assert.equal(readBoolean(false), false);
    for (const value of ["true", "false", 1, 0, null, undefined, {}, []]) {
        assert.equal(readBoolean(value), undefined, JSON.stringify(value));
    }
});

test("readBoundedString trims and enforces a length window", () => {
    assert.equal(readBoundedString("  hello  ", 20), "hello");
    assert.equal(readBoundedString("x".repeat(50), 50), "x".repeat(50));
    for (const value of ["", "   ", "x".repeat(51), 42, null, undefined, {}, []]) {
        assert.equal(readBoundedString(value, 50), undefined, JSON.stringify(value));
    }
});

test("readChatMessage bounds chat messages", () => {
    assert.equal(readChatMessage("  hi there  "), "hi there");
    assert.equal(readChatMessage("x".repeat(2000)), "x".repeat(2000));
    for (const value of ["", "   ", "x".repeat(2001), 42, {}, [], null, undefined]) {
        assert.equal(readChatMessage(value), undefined, JSON.stringify(value));
    }
});

test("readCommandName enforces a safe command identifier", () => {
    assert.equal(readCommandName("sr"), "sr");
    assert.equal(readCommandName("song_request-1"), "song_request-1");
    assert.equal(readCommandName("  vol  "), "vol");
    for (const value of [
        "",
        "   ",
        "x".repeat(51),
        "not valid!",
        "__proto__",
        "constructor",
        "prototype",
        42,
        null,
        {},
        [],
    ]) {
        assert.equal(readCommandName(value), undefined, JSON.stringify(value));
    }
});

test("readCommandAliases accepts bounded string lists only", () => {
    assert.deepEqual(readCommandAliases(["a", " b "]), ["a", "b"]);
    assert.deepEqual(readCommandAliases([]), []);
    for (const value of [
        "nope",
        42,
        null,
        {},
        [1],
        [""],
        ["  "],
        ["x".repeat(21)],
        new Array(11).fill("a"),
    ]) {
        assert.equal(readCommandAliases(value), undefined, JSON.stringify(value));
    }
});

test("readRendererLogPayload accepts only object payloads with a string message", () => {
    assert.deepEqual(readRendererLogPayload({ message: "hi" }), {
        message: "hi",
        meta: undefined,
    });
    assert.deepEqual(readRendererLogPayload({ message: "hi", meta: { a: 1 } }), {
        message: "hi",
        meta: { a: 1 },
    });
    assert.equal(readRendererLogPayload({ message: "x".repeat(2001) }).message.length, 2000);
    assert.equal(readRendererLogPayload({ message: "x".repeat(2001) }).message, "x".repeat(2000));

    for (const value of [null, undefined, "str", 42, [], { message: 42 }, { meta: 1 }]) {
        assert.equal(readRendererLogPayload(value), null, JSON.stringify(value));
    }
});

function coreHarness() {
    const handlers = new Map();
    const state = {
        language: "en",
        autoUpdateEnabled: true,
        startOnStartup: false,
        commands: {},
    };
    const writes = [];
    const loginItems = [];
    const logs = [];
    const managerCalls = [];
    const stubs = {
        electron: {
            app: {
                getPath: () => "C:\\user-data",
                getVersion: () => "test",
                on() {},
                getLoginItemSettings: () => ({ openAtLogin: false }),
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
            logDebug: (message, meta) => logs.push(["debug", message, meta]),
            logError: (message) => logs.push(["error", message]),
            logInfo: (message, meta) => logs.push(["info", message, meta]),
            logWarn: (message, meta) => logs.push(["warn", message, meta]),
            getSongRequestsForDate: () => [],
            getSongRequestsForSession: () => [],
        },
        "@/core/logging/utils": { redactSecrets: (value) => value },
        "@/core/commands/manager": {
            CommandManager: class {
                register() {}
                handle() {}
                setEnabled(name, enabled) {
                    managerCalls.push(["setEnabled", name, enabled]);
                }
                updateCommandAliases(name, aliases) {
                    managerCalls.push(["updateAliases", name, aliases]);
                    return name === "sr";
                }
                updateCommandAliasesStub() {
                    return true;
                }
                reloadCommandAliasesFromConfig() {}
                getPerformanceStats() {
                    return [];
                }
                getCommandPerformanceStats(name) {
                    managerCalls.push(["getCommandPerformanceStats", name]);
                    return null;
                }
                resetPerformanceStats() {
                    managerCalls.push(["resetPerformanceStats"]);
                }
                resetCommandPerformanceStats(name) {
                    managerCalls.push(["resetCommandPerformanceStats", name]);
                }
                getAllSerializable() {
                    return [];
                }
            },
        },
        "@/core/commands/registry": { registerAllCommands() {} },
        "@/core/config/rendererConfig": require("../src/core/config/rendererConfig"),
        "@/shared/utils/windowSend": { sendToWindowIfAlive: () => true },
        "@/shared/utils/externalUrl": require("../src/shared/utils/externalUrl"),
        "@/features/spotify/playback/player": {
            startSongFileSaving() {},
            stopSongFileSaving() {},
        },
    };
    load(stubs, "src/core/ipc/handlers.ts");
    return { handlers, state, writes, loginItems, logs, managerCalls };
}

test("commands:updateAliases ignores malformed payloads without throwing", () => {
    const h = coreHarness();
    const handler = h.handlers.get("commands:updateAliases");

    for (const payload of [
        null,
        undefined,
        "sr",
        { name: "sr", aliases: "not-an-array" },
        { name: "sr", aliases: [1] },
        { name: "sr", aliases: 42 },
        { name: 42, aliases: ["ok"] },
        { name: "sr", aliases: new Array(11).fill("a") },
    ]) {
        assert.doesNotThrow(() => handler({}, payload), JSON.stringify(payload));
    }

    assert.deepEqual(h.managerCalls, []);
    assert.deepEqual(h.writes, []);
});

test("commands:updateAliases persists validated aliases", () => {
    const h = coreHarness();
    const handler = h.handlers.get("commands:updateAliases");

    handler({}, { name: "sr", aliases: [" request "] });

    assert.deepEqual(h.managerCalls, [["updateAliases", "sr", ["request"]]]);
    assert.deepEqual(h.writes, [{ commands: { sr: { aliases: ["request"] } } }]);
});

test("commands:setEnabled requires a command name and a real boolean", () => {
    const h = coreHarness();
    const handler = h.handlers.get("commands:setEnabled");

    assert.doesNotThrow(() => handler({}, null));
    handler({}, { name: "sr", enabled: "false" });
    handler({}, { name: 42, enabled: true });
    handler({}, { name: "sr", enabled: false });

    assert.deepEqual(h.managerCalls, [["setEnabled", "sr", false]]);
});

test("commands performance handlers require a command name", () => {
    const h = coreHarness();

    assert.doesNotThrow(() =>
        h.handlers.get("commands:resetCommandPerformanceStats")({}, 42)
    );
    h.handlers.get("commands:resetCommandPerformanceStats")({}, "sr");
    assert.equal(h.handlers.get("commands:getCommandPerformanceStats")({}, 42), null);
    h.handlers.get("commands:getCommandPerformanceStats")({}, "sr");

    assert.deepEqual(h.managerCalls, [
        ["resetCommandPerformanceStats", "sr"],
        ["getCommandPerformanceStats", "sr"],
    ]);
});

test("log handlers ignore malformed payloads", () => {
    const h = coreHarness();

    for (const channel of ["log:info", "log:warn", "log:error", "log:debug"]) {
        const handler = h.handlers.get(channel);
        assert.doesNotThrow(() => handler({}, null), channel);
        assert.doesNotThrow(() => handler({}, { message: 42 }), channel);
        handler({}, { message: "hello" });
    }

    assert.deepEqual(
        h.logs.map((entry) => [entry[0], entry[1]]),
        [
            ["info", "[renderer] hello"],
            ["warn", "[renderer] hello"],
            ["error", "[renderer] hello"],
            ["debug", "[renderer] hello"],
        ]
    );
});

test("startup:setStatus and update:setAuto require real booleans", () => {
    const h = coreHarness();

    assert.doesNotThrow(() => h.handlers.get("startup:setStatus")({}, "false"));
    assert.doesNotThrow(() => h.handlers.get("update:setAuto")({}, {}));
    assert.deepEqual(h.loginItems, []);
    assert.deepEqual(h.writes, []);

    h.handlers.get("startup:setStatus")({}, true);
    h.handlers.get("update:setAuto")({}, false);

    assert.deepEqual(h.loginItems, [{ openAtLogin: true, openAsHidden: true }]);
    assert.deepEqual(h.writes, [
        { startOnStartup: true },
        { autoUpdateEnabled: false },
    ]);
});

function chatHarness(platform) {
    const handlers = new Map();
    const calls = [];
    const config = { userId: "123", twitchUserId: "1", twitchBotUserId: "2" };
    const shared = {
        electron: {
            ipcMain: {
                on: (name, handler) => handlers.set(name, handler),
                handle: (name, handler) => handlers.set(name, handler),
            },
            BrowserWindow: { fromWebContents: () => undefined },
        },
        "@/core/config": {
            __esModule: true,
            default: {
                get: (key) => (key === undefined ? { ...config } : config[key]),
                set: (patch) => Object.assign(config, patch),
                getPath: () => "C:\\user-data",
            },
        },
        "@/core/logging": {
            logDebug() {},
            logError() {},
            logInfo() {},
            logWarn() {},
        },
        "@/core/logging/utils": { redactSecrets: (value) => value },
        "@/shared/utils/windowSend": { sendToWindowIfAlive: () => true },
    };
    const kickStubs = {
        ...shared,
        "@/features/kick/auth/server": {
            startKickAuthServer() {},
            openKickAuthUrl() {},
            stopKickAuthServer() {},
        },
        "@/features/kick/chat/listener": {
            isListening: () => false,
            listenToChat() {},
            stopListeningToChat() {},
            startKickTokenAutoRefresh() {},
            stopKickTokenAutoRefresh() {},
            sendKickMessage: async (message) => calls.push(["sendKickMessage", message]),
        },
        "@/features/kick/api/client": {
            kickClient: {
                hasTokens: () => false,
                getValidAccessToken: async () => null,
                getChannels: async () => [],
                findChatroom: async (username) => {
                    calls.push(["findChatroom", username]);
                    return null;
                },
                getUserProfile: async (username) => {
                    calls.push(["getUserProfile", username]);
                    return null;
                },
            },
        },
    };

    const twitchStubs = {
        ...shared,
        "@/features/twitch/auth/server": {
            startTwitchAuthServer() {},
            openTwitchAuthUrl() {},
            stopTwitchAuthServer() {},
        },
        "@/features/twitch/chat/listener": {
            isListening: () => false,
            listenToChat() {},
            stopListeningToChat() {},
            sendTwitchMessage: async (message) => calls.push(["sendTwitchMessage", message]),
        },
        "@/features/twitch/api/client": {
            twitchClient: {
                hasTokens: () => false,
                getValidAccessToken: async () => null,
                clearTokens() {},
            },
        },
    };

    load(platform === "kick" ? kickStubs : twitchStubs, `src/features/${platform}/ipc/handlers.ts`);
    return { handlers, calls };
}

test("kick:findChatroom rejects malformed payloads before any client call", async () => {
    const h = chatHarness("kick");
    const handler = h.handlers.get("kick:findChatroom");

    assert.equal(await handler({}, null), null);
    assert.equal(await handler({}, { username: "" }), null);
    assert.equal(await handler({}, { username: 42 }), null);
    assert.equal(await handler({}, { username: "x".repeat(51) }), null);

    assert.deepEqual(h.calls, []);
});

test("kick:sendMessage validates the message and never rejects", async () => {
    const h = chatHarness("kick");
    const handler = h.handlers.get("kick:sendMessage");

    await handler({}, null);
    await handler({}, { message: "hi" });
    await handler({}, "x".repeat(2001));

    await assert.doesNotReject(async () => {
        await handler({}, "  hello  ");
    });

    assert.deepEqual(h.calls, [["sendKickMessage", "hello"]]);
});

test("twitch:sendMessage validates the message before sending", async () => {
    const h = chatHarness("twitch");
    const handler = h.handlers.get("twitch:sendMessage");

    await handler({}, null);
    await handler({}, { content: "hi" });
    await assert.doesNotReject(async () => {
        await handler({}, "  hello  ");
    });

    assert.deepEqual(h.calls, [["sendTwitchMessage", "hello"]]);
});
