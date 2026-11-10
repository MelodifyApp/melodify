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
const originalLoad = Module._load;
const originalCss = require.extensions[".css"];

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

function loadDraftState() {
    Module._resolveFilename = function (request, ...args) {
        return originalResolve.call(this, resolveAlias(request), ...args);
    };
    try {
        const resolved = require.resolve(
            path.join(root, "src/features/settings/components/draftState.ts")
        );
        delete require.cache[resolved];
        return require(resolved);
    } finally {
        Module._resolveFilename = originalResolve;
    }
}

function loadWithCss(relativePath) {
    require.extensions[".css"] = () => {};
    try {
        return load({}, relativePath);
    } finally {
        if (originalCss) require.extensions[".css"] = originalCss;
        else delete require.extensions[".css"];
    }
}

test("config inspection reports rejected keys instead of silently dropping them", () => {
    const { inspectConfigUpdate } = require("../src/core/config/rendererConfig");
    const result = inspectConfigUpdate({
        prefix: "!",
        globalCooldownSeconds: "0",
        unknownKey: "nope",
        commands: { volume: { enabled: false, aliases: ["v"] } },
    });
    assert.deepEqual(result.patch, {
        prefix: "!",
        commands: { volume: { enabled: false, aliases: ["v"] } },
    });
    assert.deepEqual(
        result.rejected.map((entry) => [entry.key, entry.reason]).sort(),
        [
            ["globalCooldownSeconds", "invalid-value"],
            ["unknownKey", "not-settable"],
        ]
    );
});

test("draft save patch persists command enabled values with the command map", () => {
    const draft = loadDraftState();
    let state = draft.createDraftState(
        {
            prefix: "!",
            commands: { volume: { enabled: true, aliases: ["v"] } },
        },
        [{ name: "volume", enabled: true, aliases: ["v"] }]
    );
    state = draft.toggleDraftCommand(state, "volume", false);
    state = draft.editDraftConfig(
        state,
        "currentSongFilePath",
        "C:\\dummy\\current-song.txt"
    );
    const patch = draft.buildConfigSavePatch(state);
    assert.equal(patch.prefix, undefined);
    assert.equal(patch.currentSongFilePath, undefined);
    assert.deepEqual(patch.commands, {
        volume: { enabled: false, aliases: ["v"] },
    });
    assert.equal(draft.settingsAreDirty(state), true);
});

test("a disabled command survives a recreated command manager", async () => {
    const draft = loadDraftState();
    let state = draft.createDraftState(
        {
            commands: { volume: { enabled: true, aliases: ["v"] } },
        },
        [{ name: "volume", enabled: true, aliases: ["v"] }]
    );
    state = draft.toggleDraftCommand(state, "volume", false);
    const savePatch = draft.buildConfigSavePatch(state);

    const configState = {
        commands: savePatch.commands,
        customModerators: [],
        globalCooldownEnabled: false,
        perUserCooldownEnabled: false,
    };
    const managerModule = load(
        {
            "@/core/config": {
                __esModule: true,
                default: { get: (key) => configState[key] },
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
    const manager = new managerModule.CommandManager();
    let executions = 0;
    manager.register({
        name: "volume",
        description: "Volume",
        usage: "!volume",
        enabled: true,
        modOnly: true,
        aliases: ["v"],
        handler: async () => {
            executions += 1;
        },
    });
    assert.equal(manager.getAllSerializable()[0].enabled, false);
    await manager.handle({
        username: "broadcaster",
        badges: ["broadcaster"],
        message: "!volume",
        platform: "twitch",
    });
    assert.equal(executions, 0);
});

test("the Twitch setup guide resolves the fixed OAuth callback and ignores config overrides", () => {
    const {
        getSetupGuide,
    } = require("../src/features/settings/secretsSave");
    const { TWITCH_REDIRECT_URI } = require("../src/shared/constants");
    const guide = getSetupGuide("twitch", {
        twitchRedirectUri: "https://wrong.example/callback",
    });
    assert.equal(guide.redirectUri, TWITCH_REDIRECT_URI);
    assert.equal(guide.dashboardUrl, "https://dev.twitch.tv/console");
    const secretsSource = readSource(
        "src/features/settings/components/sections/Secrets.tsx"
    );
    const dialogSource = readSource(
        "src/features/settings/components/sections/CredentialSetupDialog.tsx"
    );
    assert.doesNotMatch(secretsSource, /twitchRedirectUri/);
    assert.match(secretsSource, /getSetupGuide\(dialog\.serviceId, config\)/);
    assert.match(dialogSource, /<code>\{redirectUri\}<\/code>/);
    assert.doesNotMatch(dialogSource, /twitchRedirectUri/);
    const twitchCard = readSource(
        "src/features/twitch/components/TwitchCard.tsx"
    );
    assert.doesNotMatch(twitchCard, /twitchRedirectUri/);
    assert.match(twitchCard, /TWITCH_REDIRECT_URI/);
});

test("ExternalLink keeps href focusability and routes activation through the opener", () => {
    const ExternalLink = require("../src/ui/components/ExternalLink").default;
    const href = "https://dev.twitch.tv/console";
    const element = ExternalLink({
        href,
        className: "studio-link",
        children: "Open dashboard",
    });
    const html = renderToStaticMarkup(element);
    assert.match(html, /href="https:\/\/dev\.twitch\.tv\/console"/);

    const opened = [];
    const previousWindow = global.window;
    global.window = {
        electronAPI: {
            openExternal: (url) => opened.push(url),
        },
    };
    try {
        let prevented = false;
        element.props.onClick({
            preventDefault() {
                prevented = true;
            },
            stopPropagation() {},
        });
        assert.equal(prevented, true);
        assert.deepEqual(opened, [href]);
    } finally {
        if (previousWindow === undefined) delete global.window;
        else global.window = previousWindow;
    }

    const focusTrapSource = readSource(
        "src/features/settings/components/sections/CredentialSetupDialog.tsx"
    );
    assert.match(focusTrapSource, /\[href\]/);
});

test("SaveDock shows a save error instead of claiming Saved", () => {
    const studio = loadWithCss("src/ui/components/studio/index.ts");
    const html = renderToStaticMarkup(
        React.createElement(studio.SaveDock, {
            dirty: true,
            error: "Settings were not saved. Retry.",
            onSave() {},
            onDiscard() {},
        })
    );
    assert.match(html, /Settings were not saved\. Retry\./);
    assert.match(html, /data-tone="error"/);
    assert.match(html, /role="alert"/);
    assert.doesNotMatch(html, />Saved</);
});

function handlerHarness(options = {}) {
    const handlers = new Map();
    const state = {
        language: "en",
        prefix: "!",
        startOnStartup: false,
        saveCurrentSongToFile: false,
        commands: {},
        ...(options.state || {}),
    };
    const writes = [];
    const loginItems = [];
    const saving = { started: 0, stopped: 0 };
    const manager = { reloadCount: 0, reloadFromConfig() { this.reloadCount += 1; } };
    const config = {
        get: (key) => (key === undefined ? { ...state } : state[key]),
        getLoadState: () =>
            options.loadError
                ? { ok: false, error: "Config could not be loaded." }
                : { ok: true },
        setPersisted: (patch) => {
            if (options.failWrite) throw new Error("disk write failed");
            writes.push(patch);
            Object.assign(state, patch);
        },
        set: (patch) => {
            writes.push(patch);
            Object.assign(state, patch);
        },
        reload: () =>
            options.reloadError
                ? { ok: false, error: "Config could not be loaded." }
                : { ok: true },
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
                reloadFromConfig() {
                    manager.reloadCount += 1;
                }
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
    return { handlers, state, writes, loginItems, saving, manager, config };
}

test("config:save rejects invalid values without persisting or committing side effects", async () => {
    const harness = handlerHarness();
    const handler = harness.handlers.get("config:save");
    assert.equal(typeof handler, "function");
    const result = await handler(
        {},
        { prefix: "?", globalCooldownSeconds: "0" }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "rejected");
    assert.deepEqual(result.rejected.map((entry) => entry.key), [
        "globalCooldownSeconds",
    ]);
    assert.deepEqual(harness.writes, []);
    assert.equal(harness.manager.reloadCount, 0);
});

test("config:save reports file-write failure without persisting or moving the baseline", async () => {
    const harness = handlerHarness({ failWrite: true });
    const handler = harness.handlers.get("config:save");
    const result = await handler(
        {},
        { prefix: "?", commands: { volume: { enabled: false } } }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "write-failed");
    assert.equal(harness.state.prefix, "!");
    assert.equal(harness.manager.reloadCount, 0);
});

test("config:save acknowledges a durable write and refreshes the command manager", async () => {
    const harness = handlerHarness();
    const handler = harness.handlers.get("config:save");
    const result = await handler(
        {},
        {
            prefix: "?",
            commands: { volume: { enabled: false, aliases: ["v"] } },
        }
    );
    assert.equal(result.ok, true);
    assert.deepEqual(harness.writes, [
        {
            prefix: "?",
            commands: { volume: { enabled: false, aliases: ["v"] } },
        },
    ]);
    assert.equal(harness.state.prefix, "?");
    assert.equal(harness.manager.reloadCount, 1);
    assert.equal(result.config.prefix, "?");
});

test("config:get refuses unknown state and config:reload returns the load result", async () => {
    const failed = handlerHarness({ loadError: true });
    assert.throws(() => failed.handlers.get("config:get")(), /could not be loaded/i);
    const blockedSave = await failed.handlers.get("config:save")({}, { prefix: "?" });
    assert.equal(blockedSave.ok, false);
    assert.equal(blockedSave.code, "load-failed");
    const reloadFailed = handlerHarness({ reloadError: true });
    const result = await reloadFailed.handlers.get("config:reload")();
    assert.equal(result.ok, false);
    assert.equal(reloadFailed.manager.reloadCount, 0);

    const reloaded = handlerHarness();
    const success = await reloaded.handlers.get("config:reload")();
    assert.equal(success.ok, true);
    assert.equal(reloaded.manager.reloadCount, 1);
});

test("Config load state fails visibly and retry reloads from disk", () => {
    let readText = "{broken-json";
    let failWrites = false;
    const writes = [];
    const fsStub = {
        existsSync: () => true,
        readFileSync: () => readText,
        writeFileSync: (_path, content) => {
            if (failWrites) throw new Error("disk write failed");
            writes.push(content);
        },
        renameSync: () => {},
        unlinkSync: () => {},
    };
    const stubs = {
        electron: {
            app: {
                getPath: () => "C:\\fake-user-data",
                getSystemLocale: () => "en-US",
            },
        },
        fs: fsStub,
        "@/core/logging": {
            logInfo() {},
            logDebug() {},
            logWarn() {},
            logError() {},
        },
        "@/core/logging/utils": { redactSecrets: (value) => value },
    };
    const Config = load(stubs, "src/core/config/index.ts").default;
    assert.equal(Config.getLoadState().ok, false);

    readText = JSON.stringify({
        prefix: "!",
        language: "en",
        defaultsLanguage: "en",
        autoFollowLanguageDefaults: true,
    });
    assert.deepEqual(Config.reload(), { ok: true });
    assert.equal(Config.getLoadState().ok, true);
    assert.equal(Config.get("prefix"), "!");

    failWrites = true;
    assert.throws(
        () => Config.setPersisted({ prefix: "?" }),
        /disk write failed/
    );
    assert.equal(Config.get("prefix"), "!");
    assert.ok(writes.length >= 1);
});

test("Settings commits only after config:save acknowledgment and exposes load retry", () => {
    const source = readSource(
        "src/features/settings/components/Settings.tsx"
    );
    assert.match(source, /invoke\(\s*"config:save"/);
    assert.match(source, /if \(result\?\.ok !== true\)/);
    assert.match(
        source,
        /commitAcknowledgedDraft\(\s*draftsRef\.current,\s*acknowledgedConfig,\s*patch\s*\)/
    );
    assert.match(source, /acknowledgedConfig\s*=\s*[\s\S]*result\.config/);
    assert.doesNotMatch(source, /commitDraft\(current\)/);
    assert.match(source, /saveInFlight\.current/);
    assert.match(source, /pendingAutoSave\.current/);
    assert.match(source, /config:reload/);
    assert.match(source, /settings\.loadFailedTitle/);
    assert.doesNotMatch(source, /send\("config:set"/);
    assert.doesNotMatch(source, /send\("commands:setEnabled"/);
});
