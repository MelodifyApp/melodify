"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

const root = path.resolve(__dirname, "..");
const originalLoad = Module._load;
const originalResolve = Module._resolveFilename;

function resolveAlias(request) {
    return request.startsWith("@/")
        ? path.join(root, "src", request.slice(2))
        : request;
}

function load(stubs, relativePath) {
    Module._resolveFilename = function (request, ...args) {
        return originalResolve.call(this, resolveAlias(request), ...args);
    };
    Module._load = function (request, parent, isMain) {
        if (Object.prototype.hasOwnProperty.call(stubs, request)) {
            return stubs[request];
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        const resolved = require.resolve(path.join(root, relativePath));
        delete require.cache[resolved];
        return require(resolved);
    } finally {
        Module._resolveFilename = originalResolve;
        Module._load = originalLoad;
    }
}

function readSource(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function fakeFileSystem(initialFiles) {
    const files = new Map(Object.entries(initialFiles));
    const writes = [];
    return {
        files,
        writes,
        api: {
            existsSync: (filePath) => files.has(filePath),
            readFileSync: (filePath) => {
                if (!files.has(filePath)) {
                    const error = new Error(`ENOENT: ${filePath}`);
                    error.code = "ENOENT";
                    throw error;
                }
                return files.get(filePath);
            },
            writeFileSync: (filePath, content) => {
                writes.push({ filePath, content: String(content) });
                files.set(filePath, String(content));
            },
            renameSync: (source, destination) => {
                if (!files.has(source)) {
                    const error = new Error(`ENOENT: ${source}`);
                    error.code = "ENOENT";
                    throw error;
                }
                files.set(destination, files.get(source));
                files.delete(source);
            },
            copyFileSync: (source, destination) => {
                if (!files.has(source)) {
                    const error = new Error(`ENOENT: ${source}`);
                    error.code = "ENOENT";
                    throw error;
                }
                files.set(destination, files.get(source));
            },
            unlinkSync: (filePath) => {
                files.delete(filePath);
            },
        },
    };
}

test("corrupt config is quarantined and unrelated saves cannot overwrite it", () => {
    const userData = path.join(
        os.tmpdir(),
        `melodify-fake-user-data-${process.pid}`
    );
    const storePath = path.join(userData, "config.json");
    const corruptText = '{"prefix":"!","language":';
    const fakeFs = fakeFileSystem({ [storePath]: corruptText });
    const logs = [];
    const stubs = {
        electron: {
            app: {
                getPath: () => userData,
                getSystemLocale: () => "en-US",
            },
        },
        fs: fakeFs.api,
        "@/core/logging": {
            logInfo() {},
            logDebug() {},
            logWarn(...args) {
                logs.push(["warn", ...args]);
            },
            logError(...args) {
                logs.push(["error", ...args]);
            },
        },
        "@/core/logging/utils": { redactSecrets: (value) => value },
    };

    const Config = load(stubs, "src/core/config/index.ts").default;
    const state = Config.getLoadState();
    assert.equal(state.ok, false);
    assert.equal(typeof state.error, "string");
    assert.equal(typeof state.recoveryPath, "string");
    assert.equal(fakeFs.files.get(state.recoveryPath), corruptText);
    assert.equal(fakeFs.files.has(storePath), false);

    assert.throws(
        () => Config.setPersisted({ prefix: "?" }),
        /not loaded|could not be loaded|recover|reload/i
    );
    Config.set({ autoUpdateEnabled: false });
    assert.equal(
        fakeFs.writes.some((entry) => entry.filePath === storePath),
        false,
        "an unrelated save must not overwrite the corrupt config"
    );
    assert.equal(Config.getLoadState().ok, false);

    const retry = Config.reload();
    assert.equal(retry.ok, true);
    assert.equal(fakeFs.files.has(storePath), true);
    assert.equal(fakeFs.files.get(state.recoveryPath), corruptText);
    assert.equal(Config.get("prefix"), "!");
});

test("config save retries transient Windows file locks", () => {
    const userData = path.join(
        os.tmpdir(),
        `melodify-retry-user-data-${process.pid}`
    );
    const storePath = path.join(userData, "config.json");
    const fakeFs = fakeFileSystem({ [storePath]: "{}" });
    let renames = 0;
    const rename = fakeFs.api.renameSync;
    fakeFs.api.renameSync = (source, destination) => {
        renames += 1;
        if (renames <= 2) {
            const error = new Error("EPERM: file is locked");
            error.code = "EPERM";
            throw error;
        }
        return rename(source, destination);
    };
    const stubs = {
        electron: {
            app: {
                getPath: () => userData,
                getVersion: () => "1.1.0",
                getLocale: () => "en-US",
                getSystemLocale: () => "en-US",
            },
        },
        fs: fakeFs.api,
        "@/core/logging": {
            logInfo() {},
            logDebug() {},
            logWarn() {},
            logError() {},
        },
        "@/core/logging/utils": { redactSecrets: (value) => value },
    };

    const Config = load(stubs, "src/core/config/index.ts").default;
    renames = 0;
    Config.set({ prefix: "!" });

    assert.equal(renames, 3);
    assert.equal(JSON.parse(fakeFs.files.get(storePath)).prefix, "!");
});

function loadAliasValidation() {
    return require("../src/core/config/rendererConfig");
}

test("complete command maps reject duplicate aliases before persistence", () => {
    const { inspectConfigUpdate, sanitizeConfigUpdate } =
        loadAliasValidation();

    for (const commands of [
        {
            sr: { aliases: ["shared"] },
            volume: { aliases: ["shared"] },
        },
        {
            sr: { aliases: ["Shared"] },
            volume: { aliases: ["shared"] },
        },
        {
            sr: { aliases: ["volume"] },
            volume: { aliases: ["v"] },
        },
        {
            sr: { aliases: ["same", "same"] },
        },
    ]) {
        const inspection = inspectConfigUpdate({ prefix: "?", commands });
        assert.deepEqual(
            inspection.rejected.map((entry) => entry.key),
            ["commands"],
            JSON.stringify(commands)
        );
        assert.equal(
            Object.prototype.hasOwnProperty.call(inspection.patch, "commands"),
            false
        );
        assert.deepEqual(sanitizeConfigUpdate({ commands }), {});
    }

    const valid = {
        sr: { aliases: [" song "] },
        volume: { aliases: [" vol "] },
    };
    assert.deepEqual(sanitizeConfigUpdate({ commands: valid }), {
        commands: {
            sr: { aliases: ["song"] },
            volume: { aliases: ["vol"] },
        },
    });
});

function loadCommandManager(commandsConfig) {
    const managerModule = load(
        {
            "@/core/config": {
                __esModule: true,
                default: {
                    get: (key) =>
                        key === "commands" ? commandsConfig : undefined,
                },
            },
            "@/core/logging": {
                logDebug() {},
                logInfo() {},
                logWarn() {},
                logError() {},
            },
        },
        "src/core/commands/manager.ts"
    );
    return managerModule.CommandManager;
}

function registerTwoCommands(CommandManager, commandsConfig) {
    const manager = new CommandManager();
    const registered = [];
    for (const name of ["sr", "volume"]) {
        registered.push(
            manager.register({
                name,
                description: `${name} command`,
                usage: `!${name}`,
                enabled: true,
                handler: async () => {},
            })
        );
    }
    return { manager, registered };
}

test("saved alias conflicts are rejected when commands are registered at startup", () => {
    const aliases = {
        sr: { aliases: ["Shared"] },
        volume: { aliases: ["shared"] },
    };
    const CommandManager = loadCommandManager(aliases);
    for (let run = 0; run < 2; run += 1) {
        const { manager, registered } = registerTwoCommands(
            CommandManager,
            aliases
        );
        assert.deepEqual(registered, [true, false]);
        assert.deepEqual(
            manager.getAllSerializable().map((command) => command.name),
            ["sr"]
        );
        assert.equal(manager.get("shared").name, "sr");
    }
});

test("config:save rejects a conflicting command map without partial persistence", async () => {
    const h = handlerHarness();
    const save = h.handlers.get("config:save");
    const result = await save({}, {
        prefix: "?",
        commands: {
            sr: { aliases: ["shared"] },
            volume: { aliases: ["shared"] },
        },
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, "rejected");
    assert.deepEqual(result.rejected.map((entry) => entry.key), ["commands"]);
    assert.deepEqual(h.writes, []);
    assert.equal(h.state.prefix, "!");
});

function handlerHarness(options = {}) {
    const handlers = new Map();
    const state = {
        language: "en",
        prefix: "!",
        customModerators: [],
        commands: {},
        currentSongFilePath: "C:\\dummy\\old-current-song.txt",
        saveCurrentSongToFile: false,
        ...(options.state || {}),
    };
    const writes = [];
    const dialogCalls = [];
    const saving = { started: 0, stopped: 0 };
    const config = {
        get: (key) => (key === undefined ? { ...state } : state[key]),
        getPath: () => "C:\\dummy-user-data",
        getLoadState: () => ({ ok: true }),
        set: (patch) => {
            writes.push(patch);
            Object.assign(state, patch);
        },
        setPersisted: (patch) => {
            if (options.failPathWrite) throw new Error("disk write failed");
            writes.push(patch);
            Object.assign(state, patch);
        },
        reload: () => ({ ok: true }),
    };
    const stubs = {
        electron: {
            app: {
                getPath: () => "C:\\dummy-user-data",
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
                showSaveDialog: async (dialogOptions) => {
                    dialogCalls.push(dialogOptions);
                    return options.dialogResult || { canceled: true };
                },
            },
            BrowserWindow: { fromWebContents: () => undefined },
        },
        "@/core/config": { __esModule: true, default: config },
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
                reloadFromConfig() {}
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
    return { handlers, state, writes, dialogCalls, saving };
}

test("song-file selection is persisted by main and mirrors into acknowledged UI state", async () => {
    const selectedPath = "C:\\dummy\\picked-current-song.txt";
    const h = handlerHarness({
        dialogResult: { canceled: false, filePath: selectedPath },
    });
    const select = h.handlers.get("file:selectSongFilePath");
    const result = await select({}, "C:\\attacker\\chosen.txt");
    assert.equal(result, selectedPath);
    assert.deepEqual(h.writes, [{ currentSongFilePath: selectedPath }]);
    assert.equal(h.dialogCalls.length, 1);

    const draft = require("../src/features/settings/components/draftState");
    let state = draft.createDraftState(
        { currentSongFilePath: "C:\\dummy\\old-current-song.txt" },
        []
    );
    state = draft.acknowledgeSongFilePath(state, selectedPath);
    assert.equal(state.baselineConfig.currentSongFilePath, selectedPath);
    assert.equal(state.draftConfig.currentSongFilePath, selectedPath);
    assert.equal(draft.settingsAreDirty(state), false);
    assert.equal(
        Object.prototype.hasOwnProperty.call(
            draft.buildConfigSavePatch(state),
            "currentSongFilePath"
        ),
        false
    );

    state = draft.discardDraft(state);
    assert.equal(state.draftConfig.currentSongFilePath, selectedPath);
    assert.equal(state.baselineConfig.currentSongFilePath, selectedPath);

    const source = readSource(
        "src/features/settings/components/Settings.tsx"
    );
    assert.match(source, /acknowledgeSongFilePath/);
    assert.match(source, /commitAcknowledgedDraft/);
    assert.match(source, /result\.config/);
});

test("a failed main-owned path write does not acknowledge a displayed selection", async () => {
    const h = handlerHarness({
        dialogResult: {
            canceled: false,
            filePath: "C:\\dummy\\not-persisted-current-song.txt",
        },
        failPathWrite: true,
    });
    const result = await h.handlers.get("file:selectSongFilePath")();
    assert.equal(result, null);
    assert.deepEqual(h.writes, []);
    assert.equal(
        h.state.currentSongFilePath,
        "C:\\dummy\\old-current-song.txt"
    );
});

test("acknowledged save adopts the normalized effective config", async () => {
    const h = handlerHarness();
    const save = h.handlers.get("config:save");
    const result = await save({}, {
        prefix: "?",
        customModerators: [" Mod "],
        commands: { sr: { aliases: [" Song "] } },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.config.customModerators, ["Mod"]);
    assert.deepEqual(result.config.commands, {
        sr: { aliases: ["Song"] },
    });

    const draft = require("../src/features/settings/components/draftState");
    let state = draft.createDraftState(
        {
            prefix: "!",
            customModerators: [" Mod "],
            commands: { sr: { aliases: [" Song "] } },
        },
        [{ name: "sr", enabled: true, aliases: [" Song "] }]
    );
    state = draft.editDraftConfig(state, "prefix", "?");
    state = draft.commitAcknowledgedDraft(state, result.config, {
        prefix: "?",
        customModerators: [" Mod "],
        commands: { sr: { aliases: [" Song "] } },
    });
    assert.deepEqual(state.baselineConfig.customModerators, ["Mod"]);
    assert.deepEqual(state.draftConfig.customModerators, ["Mod"]);
    assert.deepEqual(state.baselineConfig.commands, {
        sr: { aliases: ["Song"] },
    });
    assert.equal(draft.settingsAreDirty(state), false);
});
