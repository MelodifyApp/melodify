"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveReplyPlatform } = require("../src/core/commands/replyRouting");

test("routes replies by explicit platform", () => {
    assert.equal(resolveReplyPlatform({ platform: "twitch" }), "twitch");
    assert.equal(resolveReplyPlatform({ platform: "kick" }), "kick");
});

test("never guesses the platform from raw event shape anymore", () => {
    for (const ctx of [
        { raw: { chatter_user_login: "viewer" } },
        { raw: { chatter_user_login: "viewer", sender: { username: "viewer" } } },
        { raw: { sender: { username: "viewer" } } },
        { raw: {} },
        {},
    ]) {
        assert.equal(resolveReplyPlatform(ctx), null);
    }
});

test("unknown or malformed platform values fail closed", () => {
    for (const platform of ["unknown", "", "TWITCH", "twitch ", null, 1, {}]) {
        assert.equal(resolveReplyPlatform({ platform }), null);
    }
});
