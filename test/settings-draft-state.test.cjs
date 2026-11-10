"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
    return originalResolve.call(this, request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request, ...args);
};
let draft;
try { draft = require("../src/features/settings/components/draftState"); }
finally { Module._resolveFilename = originalResolve; }

const base = () => draft.createDraftState(
    { language: "en", minimizeToTray: false, spotifyClientId: "committed", commands: { sr: { aliases: ["song"] } } },
    [{ name: "sr", enabled: true }, { name: "volume", enabled: true }]
);

test("ordinary edits change only the draft until commit", () => {
    const initial = base();
    const edited = draft.editDraftConfig(initial, "minimizeToTray", true);
    assert.equal(edited.draftConfig.minimizeToTray, true);
    assert.equal(edited.baselineConfig.minimizeToTray, false);
    assert.equal(initial.draftConfig.minimizeToTray, false);
    assert.equal(draft.settingsAreDirty(edited), true);
    const committed = draft.commitDraft(edited);
    assert.equal(draft.settingsAreDirty(committed), false);
    assert.equal(committed.baselineConfig.minimizeToTray, true);
});

test("discard restores both config and command drafts without touching baselines", () => {
    let state = draft.editDraftConfig(base(), "language", "tr");
    state = draft.toggleDraftCommand(state, "volume", false);
    assert.equal(draft.settingsAreDirty(state), true);
    const discarded = draft.discardDraft(state);
    assert.equal(draft.settingsAreDirty(discarded), false);
    assert.equal(discarded.draftConfig.language, "en");
    assert.equal(discarded.draftCommands[1].enabled, true);
    assert.equal(discarded.baselineConfig.language, "en");
});

test("command changes are detected normatively and include only real differences", () => {
    let state = base();
    assert.deepEqual(draft.changedCommandStates(state), []);
    state = draft.toggleDraftCommand(state, "volume", false);
    assert.deepEqual(draft.changedCommandStates(state), [{ name: "volume", enabled: false }]);
    state = draft.editDraftConfig(state, "commands", { sr: { aliases: ["music"] } });
    assert.equal(draft.configIsDirty(state), true);
});

test("API client IDs stay in the Settings baseline for credential dialog prefill", () => {
    const state = draft.createDraftState({
        spotifyClientId: "committed",
        kickClientId: "kick-id",
        twitchClientId: "twitch-id",
        prefix: "!",
    });
    assert.equal(state.baselineConfig.spotifyClientId, "committed");
    assert.equal(state.draftConfig.spotifyClientId, "committed");
    assert.equal(state.baselineConfig.kickClientId, "kick-id");
    assert.equal(state.draftConfig.twitchClientId, "twitch-id");
    assert.equal(draft.configIsDirty(state), false);
});

test("stable equality ignores object key order and protects nested values", () => {
    const a = draft.createDraftState({ nested: { a: 1, b: [1, 2] } }, []);
    const b = draft.editDraftConfig(a, "nested", { b: [1, 2], a: 1 });
    assert.equal(draft.configIsDirty(b), false);
    b.draftConfig.nested.b.push(3);
    assert.equal(draft.configIsDirty(b), true);
});

test("a deferred save preserves edits made after the click and the submitted command baseline", async () => {
    let resolveSave;
    const savedConfig = new Promise((resolve) => {
        resolveSave = resolve;
    });
    const initial = draft.createDraftState(
        {
            prefix: "!",
            commands: {
                volume: { enabled: true, aliases: ["v"] },
                sr: { enabled: true },
            },
        },
        [
            { name: "volume", enabled: true, aliases: ["v"] },
            { name: "sr", enabled: true },
        ]
    );
    let submitted = draft.editDraftConfig(initial, "prefix", "?");
    submitted = draft.toggleDraftCommand(submitted, "volume", false);
    const patch = draft.buildConfigSavePatch(submitted);

    // The user keeps editing while config:save is pending.
    let later = draft.editDraftConfig(submitted, "prefix", "!!");
    later = draft.toggleDraftCommand(later, "volume", true);

    resolveSave({
        prefix: "?",
        commands: {
            volume: { enabled: false, aliases: ["v"] },
            sr: { enabled: true },
        },
    });
    const acknowledged = draft.commitAcknowledgedDraft(
        later,
        await savedConfig,
        patch
    );

    assert.equal(acknowledged.baselineConfig.prefix, "?");
    assert.equal(acknowledged.draftConfig.prefix, "!!");
    assert.equal(draft.settingsAreDirty(acknowledged), true);
    assert.equal(
        acknowledged.baselineConfig.commands.volume.enabled,
        false
    );
    assert.equal(
        acknowledged.baselineCommands.find(
            (command) => command.name === "volume"
        ).enabled,
        false
    );
    assert.equal(
        acknowledged.draftCommands.find(
            (command) => command.name === "volume"
        ).enabled,
        true
    );
    assert.equal(draft.commandsAreDirty(acknowledged), true);
});

