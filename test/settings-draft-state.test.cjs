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

test("API client ID drafts are excluded from the ordinary config baseline and dirty check", () => {
    const state = base();
    assert.equal("spotifyClientId" in state.baselineConfig, false);
    assert.equal("spotifyClientId" in state.draftConfig, false);
    const credentials = draft.credentialDraftsFromConfig({ spotifyClientId: "committed", kickClientId: 42 });
    assert.deepEqual(credentials, { spotifyClientId: "committed", kickClientId: "", twitchClientId: "" });
    assert.equal(draft.credentialDraftPending(credentials, draft.credentialDraftsFromConfig({ spotifyClientId: "older" })), true);
    assert.equal(draft.credentialDraftPending(draft.credentialDraftsFromConfig({ spotifyClientId: "committed" }), draft.credentialDraftsFromConfig({ spotifyClientId: "committed" })), false);
});

test("stable equality ignores object key order and protects nested values", () => {
    const a = draft.createDraftState({ nested: { a: 1, b: [1, 2] } }, []);
    const b = draft.editDraftConfig(a, "nested", { b: [1, 2], a: 1 });
    assert.equal(draft.configIsDirty(b), false);
    b.draftConfig.nested.b.push(3);
    assert.equal(draft.configIsDirty(b), true);
});

