"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const config = { customModerators: ["  TrustedViewer  "] };
const originalLoad = Module._load;
let CommandManager;
try {
    Module._load = function (request, parent, isMain) {
        if (request === "@/core/config") return { __esModule: true, default: { get: (key) => config[key] } };
        if (request === "@/core/logging") return { logDebug() {}, logInfo() {}, logWarn() {}, logError() {} };
        return originalLoad.call(this, request, parent, isMain);
    };
    ({ CommandManager } = require("../src/core/commands/manager"));
} finally { Module._load = originalLoad; }

for (const [username, badges, allowed] of [
    ["trustedviewer", [], true],
    ["TRUSTEDVIEWER", [], true],
    ["outsider", ["moderator"], true],
    ["outsider", ["broadcaster"], true],
    ["outsider", ["subscriber"], false],
    ["outsider", ["vip"], false],
    ["outsider", ["og"], false],
    ["outsider", [], false],
]) {
    test(`moderator-only command: ${username} / ${badges.join(",") || "no badges"}`, async () => {
        const manager = new CommandManager();
        let executions = 0;
        manager.register({ name: "volume", description: "Volume", usage: "!volume", enabled: true, modOnly: true,
            handler: async () => { executions++; } });
        await manager.handle({ username, badges, message: "!volume", platform: "twitch" });
        assert.equal(executions, allowed ? 1 : 0);
    });
}

test("real-shaped Twitch badge metadata reaches moderator-only command checks", async () => {
    const { decodeTwitchChatContext } = require("../src/features/twitch/chat/context");
    for (const [badges, allowed] of [
        [[{ set_id: "moderator", id: "1" }], true],
        [[{ set_id: "subscriber", id: "12" }], false],
        [[], false],
    ]) {
        const manager = new CommandManager();
        let executed = false;
        manager.register({ name: "volume", description: "Volume", usage: "!volume", enabled: true, modOnly: true,
            handler: async () => { executed = true; } });
        const context = decodeTwitchChatContext({ chatter_user_login: "outsider", badges, message: { text: "!volume" } });
        await manager.handle(context);
        assert.equal(executed, allowed);
    }
});

test("malformed customModerators config cannot crash or grant moderator access", async () => {
    const previous = config.customModerators;
    try {
        for (const corrupted of ["trustedviewer", null, [42, null, {}], [""]]) {
            config.customModerators = corrupted;
            const manager = new CommandManager();
            let executions = 0;
            manager.register({ name: "volume", description: "Volume", usage: "!volume", enabled: true, modOnly: true,
                handler: async () => { executions++; } });
            await manager.handle({ username: "trustedviewer", badges: [], message: "!volume", platform: "twitch" });
            assert.equal(executions, 0, `granted access for ${JSON.stringify(corrupted)}`);
        }
    } finally {
        config.customModerators = previous;
    }
});

test("malformed commands config cannot crash registration or register character aliases", async () => {
    const previous = config.commands;
    try {
        config.commands = { volume: { aliases: "request" } };
        const manager = new CommandManager();
        let executions = 0;
        assert.doesNotThrow(() =>
            manager.register({ name: "volume", description: "Volume", usage: "!volume", enabled: true,
                aliases: ["vol"], handler: async () => { executions++; } })
        );
        assert.deepEqual(manager.getAllSerializable()[0].aliases, ["vol"]);
        await manager.handle({ username: "viewer", badges: [], message: "!request", platform: "kick" });
        assert.equal(executions, 0, "malformed string aliases must not become character aliases");
        await manager.handle({ username: "viewer", badges: [], message: "!vol", platform: "kick" });
        assert.equal(executions, 1);
    } finally {
        config.commands = previous;
    }
});

test("non-boolean command enabled state falls back to the command definition", () => {
    const previous = config.commands;
    try {
        config.commands = { volume: { enabled: "false" } };
        const manager = new CommandManager();
        manager.register({ name: "volume", description: "Volume", usage: "!volume", enabled: true,
            handler: async () => {} });
        assert.equal(manager.getAllSerializable()[0].enabled, true);
    } finally {
        config.commands = previous;
    }
});

test("junk alias entries are filtered without dropping valid aliases", () => {
    const previous = config.commands;
    try {
        config.commands = { volume: { aliases: [42, null, {}, "  ", "ok"] } };
        const manager = new CommandManager();
        manager.register({ name: "volume", description: "Volume", usage: "!volume", enabled: true,
            aliases: ["vol"], handler: async () => {} });
        assert.deepEqual(manager.getAllSerializable()[0].aliases, ["ok"]);
    } finally {
        config.commands = previous;
    }
});

test("malformed commands config cannot crash alias reload", () => {
    const previous = config.commands;
    try {
        const manager = new CommandManager();
        manager.register({ name: "volume", description: "Volume", usage: "!volume", enabled: true,
            aliases: ["vol"], handler: async () => {} });
        for (const corrupted of ["nope", { volume: "nope" }, { volume: { aliases: "nope" } }]) {
            config.commands = corrupted;
            assert.doesNotThrow(() => manager.reloadCommandAliasesFromConfig(), JSON.stringify(corrupted));
            assert.deepEqual(manager.getAllSerializable()[0].aliases, ["vol"]);
        }
        config.commands = { volume: { aliases: ["v", "volume2"] } };
        assert.doesNotThrow(() => manager.reloadCommandAliasesFromConfig());
        assert.deepEqual(manager.getAllSerializable()[0].aliases, ["v", "volume2"]);
    } finally {
        config.commands = previous;
    }
});
