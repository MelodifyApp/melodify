"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const policy = require(path.join(
    root,
    "src/features/settings/components/autoSavePolicy"
));

test("text edits wait for the short auto-save debounce", () => {
    assert.equal(policy.autoSaveDelayForKey("songRequestReplyTemplate", "hello"), policy.AUTO_SAVE_DELAY_MS);
    assert.equal(policy.autoSaveDelayForKey("currentSongFormat", "{title}"), policy.AUTO_SAVE_DELAY_MS);
    assert.equal(policy.autoSaveDelayForKey("prefix", "!"), policy.AUTO_SAVE_DELAY_MS);
});

test("toggles and language selectors save without waiting for typing", () => {
    assert.equal(policy.autoSaveDelayForKey("minimizeToTray", true), 0);
    assert.equal(policy.autoSaveDelayForKey("canAnyonePlaySong", false), 0);
    assert.equal(policy.autoSaveDelayForKey("language", "tr"), 0);
    assert.equal(policy.autoSaveDelayForKey("defaultsLanguage", "en"), 0);
    assert.equal(policy.autoSaveDelayForKey("rewardId", "reward-1"), 0);
    assert.equal(policy.autoSaveDelayForKey("twitchRewardId", "reward-2"), 0);
});

test("moderator and reward lists save immediately", () => {
    assert.equal(policy.autoSaveDelayForKey("customModerators", ["mod"]), 0);
    assert.equal(policy.autoSaveDelayForKey("commands", { sr: { enabled: true } }), 0);
});

test("the main-process file path is not sent through ordinary auto-save", () => {
    assert.equal(policy.autoSaveDelayForKey("currentSongFilePath", "C:\\song.txt"), -1);
});
