"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const { sanitizeConfigUpdate } = require("../src/core/config/rendererConfig");

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
        currentSongFilePath: "C:\\user-data\\current-song.txt",
    };
    const writes = [];
    const dialogResults = [];
    const stubs = {
        electron: {
            app: {
                getPath: () => "C:\\user-data",
                getVersion: () => "test",
                on() {},
                setLoginItemSettings() {},
            },
            ipcMain: {
                on: (name, handler) => handlers.set(name, handler),
                handle: (name, handler) => handlers.set(name, handler),
            },
            shell: { openExternal() {} },
            dialog: {
                showSaveDialog: async () => {
                    const next = dialogResults.shift();
                    if (next instanceof Error) throw next;
                    return next;
                },
            },
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
            startSongFileSaving() {},
            stopSongFileSaving() {},
        },
    };
    load(stubs, "src/core/ipc/handlers.ts");
    return { handlers, state, writes, dialogResults };
}

test("renderer config updates cannot set the song file write path", () => {
    const patch = sanitizeConfigUpdate({
        currentSongFilePath: "C:\\attacker\\target.txt",
        language: "en",
    });
    assert.deepEqual(patch, { language: "en" });
});

test("config:set cannot persist a forged song file path", () => {
    const h = harness();
    h.handlers.get("config:set")({}, {
        currentSongFilePath: "C:\\attacker\\target.txt",
        language: "tr",
    });

    assert.deepEqual(h.writes, [{ language: "tr" }]);
    assert.equal(h.state.currentSongFilePath, "C:\\user-data\\current-song.txt");
});

test("the save dialog is the authority and persists the chosen path", async () => {
    const h = harness();
    h.dialogResults.push({
        canceled: false,
        filePath: "C:\\chosen\\song.txt",
    });

    const result = await h.handlers.get("file:selectSongFilePath")({});

    assert.equal(result, "C:\\chosen\\song.txt");
    assert.deepEqual(h.writes, [
        { currentSongFilePath: "C:\\chosen\\song.txt" },
    ]);
    assert.equal(h.state.currentSongFilePath, "C:\\chosen\\song.txt");
});

test("cancelling the dialog keeps the saved path", async () => {
    const h = harness();

    h.dialogResults.push({ canceled: true });
    assert.equal(await h.handlers.get("file:selectSongFilePath")({}), null);

    h.dialogResults.push({ canceled: false, filePath: "" });
    assert.equal(await h.handlers.get("file:selectSongFilePath")({}), null);

    assert.deepEqual(h.writes, []);
    assert.equal(h.state.currentSongFilePath, "C:\\user-data\\current-song.txt");
});

test("a failing dialog keeps the saved path and does not throw", async () => {
    const h = harness();
    h.dialogResults.push(new Error("dialog failed"));

    await assert.doesNotReject(async () => {
        assert.equal(
            await h.handlers.get("file:selectSongFilePath")({}),
            null
        );
    });
    assert.deepEqual(h.writes, []);
});
