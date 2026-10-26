"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const fs = require("node:fs");
const path = require("node:path");

const {
    SEND_CHANNELS,
    INVOKE_CHANNELS,
    LISTEN_CHANNELS,
} = require("../src/shared/ipcChannels");

const { SECRET_SERVICES } = require("../src/features/settings/secretsSave");

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

function loadPreload() {
    const calls = { send: [], invoke: [], on: [], removeListener: [], removeAllListeners: [] };
    let exposed;
    const ipcRenderer = {
        send: (channel, data) => calls.send.push([channel, data]),
        invoke: (channel, ...args) => {
            calls.invoke.push([channel, ...args]);
            return Promise.resolve("invoked");
        },
        on: (channel, listener) => calls.on.push([channel, listener]),
        removeListener: (channel, listener) => calls.removeListener.push([channel, listener]),
        removeAllListeners: (channel) => calls.removeAllListeners.push(channel),
    };
    const electron = {
        contextBridge: {
            exposeInMainWorld: (key, api) => {
                assert.equal(key, "electronAPI");
                exposed = api;
            },
        },
        ipcRenderer,
    };
    load({ electron }, "src/main/preload.ts");
    assert.ok(exposed, "preload must expose an API");
    return { api: exposed, calls };
}

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return entry.isFile() && full.endsWith(".ts") ? [full] : [];
    });
}

function collectSource(pattern) {
    const found = new Set();
    for (const file of walk(path.join(__dirname, "..", "src"))) {
        const text = fs.readFileSync(file, "utf8");
        for (const match of text.matchAll(pattern)) {
            found.add(match[1]);
        }
    }
    return found;
}

test("channel allowlists are immutable and directionally disjoint", () => {
    for (const list of [SEND_CHANNELS, INVOKE_CHANNELS, LISTEN_CHANNELS]) {
        assert.ok(Object.isFrozen(list), "allowlists must be frozen");
        assert.ok(list.length > 0);
        assert.equal(new Set(list).size, list.length, "allowlists must not contain duplicates");
    }

    const send = new Set(SEND_CHANNELS);
    const invoke = new Set(INVOKE_CHANNELS);
    const listen = new Set(LISTEN_CHANNELS);

    for (const channel of invoke) {
        assert.equal(send.has(channel), false, `${channel} cannot be both send and invoke`);
        assert.equal(listen.has(channel), false, `${channel} cannot be both invoke and listen`);
    }
    for (const channel of send) {
        assert.equal(listen.has(channel), false, `${channel} cannot be both send and listen`);
    }
});

test("send allowlist matches every ipcMain.on registration", () => {
    const registered = collectSource(/ipcMain\.on\(\s*"([^"]+)"/g);
    assert.deepEqual(
        [...registered].sort(),
        [...SEND_CHANNELS].sort(),
        "SEND_CHANNELS must mirror ipcMain.on registrations"
    );
});

test("invoke allowlist matches every ipcMain.handle registration", () => {
    const registered = collectSource(/ipcMain\.handle\(\s*"([^"]+)"/g);
    assert.deepEqual(
        [...registered].sort(),
        [...INVOKE_CHANNELS].sort(),
        "INVOKE_CHANNELS must mirror ipcMain.handle registrations"
    );
});

test("listen allowlist covers every main-to-renderer event", () => {
    const sent = new Set([
        ...collectSource(/sendToWindowIfAlive\([^,]+,\s*"([^"]+)"/g),
        ...collectSource(/broadcast\(\s*"([^"]+)"/g),
    ]);
    for (const channel of sent) {
        assert.ok(
            LISTEN_CHANNELS.includes(channel),
            `${channel} is sent to the renderer but missing from LISTEN_CHANNELS`
        );
    }
});

test("send forwards approved channels and blocks unknown or invoke-only channels", () => {
    const { api, calls } = loadPreload();

    api.send("config:set", { language: "en" });
    api.send("evil:channel", { pwn: true });
    api.send("config:get");
    api.send(42);

    assert.deepEqual(calls.send, [["config:set", { language: "en" }]]);
});

test("invoke forwards approved channels and rejects unknown or send-only channels", async () => {
    const { api, calls } = loadPreload();

    assert.equal(await api.invoke("config:get"), "invoked");
    await assert.rejects(() => api.invoke("config:set", {}));
    await assert.rejects(() => api.invoke("evil:channel"));
    await assert.rejects(() => api.invoke(42));

    assert.deepEqual(calls.invoke, [["config:get"]]);
});

test("listeners can only be registered on event channels", () => {
    const { api, calls } = loadPreload();
    const listener = () => {};

    api.on("update:status", listener);
    api.on("kick:authenticated", listener);
    api.on("config:get", listener);
    api.on("evil:channel", listener);
    api.on("update:status", "not-a-function");

    assert.deepEqual(
        calls.on.map(([channel]) => channel),
        ["update:status", "kick:authenticated"]
    );
});

test("registered listener receives args without the IPC event and errors are isolated", () => {
    const { api, calls } = loadPreload();
    const seen = [];
    const listener = (...args) => seen.push(args);

    api.on("update:status", listener);
    const wrapper = calls.on[0][1];
    assert.equal(typeof wrapper, "function");
    assert.notEqual(wrapper, listener);

    wrapper({ sender: "event" }, "available", { version: "1.0.6" });
    assert.deepEqual(seen, [["available", { version: "1.0.6" }]]);

    api.on("update:status", () => {
        throw new Error("listener boom");
    });
    const throwing = calls.on[1][1];
    assert.doesNotThrow(() => throwing({}, "checking"));
});

test("removeListener targets the wrapper that was actually registered", () => {
    const { api, calls } = loadPreload();
    const listener = () => {};

    api.on("update:status", listener);
    const registeredWrapper = calls.on[0][1];

    api.removeListener("update:status", listener);
    api.removeListener("config:get", listener);
    api.removeListener("update:status", () => {});

    assert.deepEqual(calls.removeListener, [["update:status", registeredWrapper]]);
});

test("removeAllListeners is limited to event channels", () => {
    const { api, calls } = loadPreload();

    api.removeAllListeners("kick:authenticated");
    api.removeAllListeners("config:get");
    api.removeAllListeners("evil:channel");

    assert.deepEqual(calls.removeAllListeners, ["kick:authenticated"]);
});

test("explicit preload methods keep working on their fixed channels", () => {
    const { api, calls } = loadPreload();

    api.minimize();
    api.close();
    api.openExternal("https://example.com");
    api.setStartupStatus(true);
    api.setAutoUpdate(false);
    api.checkForUpdates();
    api.openUITestWindow();
    api.selectSongFilePath();
    api.getAppVersion();
    api.getStartupStatus();
    api.getAutoUpdate();

    assert.deepEqual(calls.send, [
        ["window:minimize", undefined],
        ["window:close", undefined],
        ["open-external", "https://example.com"],
        ["startup:setStatus", true],
        ["update:setAuto", false],
        ["update:check", undefined],
    ]);
    assert.deepEqual(
        calls.invoke.map(([channel]) => channel),
        [
            "open-ui-test-window",
            "file:selectSongFilePath",
            "app:getVersion",
            "startup:getStatus",
            "update:getAuto",
        ]
    );
});

test("retired update and config wrappers are not exposed", () => {
    const { api } = loadPreload();

    // The renderer drives these through the generic send/invoke paths and the
    // guarded on/removeListener pair, so the duplicate wrappers were removed.
    assert.equal(api.downloadUpdate, undefined);
    assert.equal(api.installUpdate, undefined);
    assert.equal(api.restart, undefined);
    assert.equal(api.onUpdateStatus, undefined);
    assert.equal(api.updateTranslatedDefaults, undefined);

    const source = fs.readFileSync(
        path.join(__dirname, "..", "src/main/preload.ts"),
        "utf8"
    );
    for (const name of [
        "downloadUpdate",
        "installUpdate",
        "restart",
        "onUpdateStatus",
        "updateTranslatedDefaults",
    ]) {
        assert.doesNotMatch(
            source,
            new RegExp(`\\b${name}:`, "g"),
            `${name} wrapper must stay removed`
        );
    }
});

test("preload exposes no retired secret-setter wrappers or reset method", () => {
    const { api } = loadPreload();

    assert.equal(api.setSpotifySecrets, undefined);
    assert.equal(api.setKickSecrets, undefined);
    assert.equal(api.reset, undefined);
    assert.equal(
        Object.keys(api).some((key) => /secrets$/i.test(key)),
        false,
        "credential wrappers must not come back; the Secrets section owns saves"
    );

    const source = fs.readFileSync(
        path.join(__dirname, "..", "src/main/preload.ts"),
        "utf8"
    );
    assert.doesNotMatch(source, /setSpotifySecrets|setKickSecrets/);
});

test("the retired config:reset channel is neither registered nor forwardable", async () => {
    for (const list of [SEND_CHANNELS, INVOKE_CHANNELS, LISTEN_CHANNELS]) {
        assert.equal(list.includes("config:reset"), false);
    }

    const registered = new Set([
        ...collectSource(/ipcMain\.on\(\s*"([^"]+)"/g),
        ...collectSource(/ipcMain\.handle\(\s*"([^"]+)"/g),
    ]);
    assert.equal(
        registered.has("config:reset"),
        false,
        "config:reset must not be registered without an allowlist entry"
    );

    const { api, calls } = loadPreload();
    api.send("config:reset");
    await assert.rejects(() => api.invoke("config:reset"));

    assert.deepEqual(calls.send, []);
    assert.deepEqual(calls.invoke, []);
});

test("the supported credential save flow crosses the bridge on approved channels", async () => {
    const { api, calls } = loadPreload();

    for (const service of SECRET_SERVICES) {
        if (service.transport === "invoke") {
            assert.ok(
                INVOKE_CHANNELS.includes(service.channel),
                `${service.channel} must be an invoke channel`
            );
            assert.equal(SEND_CHANNELS.includes(service.channel), false);
            await api.invoke(service.channel, { probe: true });
        } else {
            assert.ok(
                SEND_CHANNELS.includes(service.channel),
                `${service.channel} must be a send channel`
            );
            assert.equal(INVOKE_CHANNELS.includes(service.channel), false);
            api.send(service.channel, { probe: true });
        }
    }

    assert.deepEqual(
        calls.invoke.map(([channel]) => channel),
        ["spotify:setSecrets"]
    );
    assert.deepEqual(
        calls.send.map(([channel]) => channel),
        ["kick:setSecrets", "twitch:setSecrets"]
    );
});
