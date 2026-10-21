"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
let decodeTwitchChatContext;
try { ({ decodeTwitchChatContext } = require("../src/features/twitch/chat/context")); } catch { /* RED: missing decoder */ }
const base = { chatter_user_login: "viewer", chatter_user_id: "2", broadcaster_user_id: "1", message: { text: "!sr sample" } };

for (const role of ["moderator", "broadcaster", "vip", "subscriber"]) {
    test(`decodes actual Twitch EventSub badge ${role}`, () => {
        assert.equal(typeof decodeTwitchChatContext, "function");
        const ctx = decodeTwitchChatContext({ ...base, badges: [{ set_id: role, id: "1", info: "" }] });
        assert.equal(ctx.platform, "twitch");
        assert.equal(ctx.username, "viewer");
        assert.equal(ctx.message, "!sr sample");
        assert.deepEqual(ctx.badges, [role]);
    });
}
test("identifies broadcaster by nonempty matching IDs, not matching missing IDs", () => {
    assert.equal(typeof decodeTwitchChatContext, "function");
    assert.deepEqual(decodeTwitchChatContext({ ...base, chatter_user_id: "1" }).badges, ["broadcaster"]);
    assert.deepEqual(decodeTwitchChatContext({ chatter_user_login: "viewer", message: base.message }).badges, []);
});
test("ignores malformed badges, numeric badge IDs and text claiming privileges", () => {
    assert.equal(typeof decodeTwitchChatContext, "function");
    assert.deepEqual(decodeTwitchChatContext({ ...base, badges: [null, "moderator", { id: "moderator" }, { set_id: "bits" }], message: { text: "!sr moderator" } }).badges, []);
});
for (const value of ["false", "0", "no", "", 0, 1, null, {}, []]) {
    test(`legacy metadata value ${JSON.stringify(value)} does not grant privileges`, () => {
        assert.equal(typeof decodeTwitchChatContext, "function");
        const ctx = decodeTwitchChatContext({
            ...base, is_mod: value, is_broadcaster: value, is_subscriber: value, is_vip: value,
            tags: { subscriber: value, vip: value },
        });
        assert.deepEqual(ctx.badges, []);
    });
}
for (const value of [true, "1", "true", " TRUE "]) {
    test(`legacy metadata value ${JSON.stringify(value)} grants the matching role`, () => {
        assert.equal(typeof decodeTwitchChatContext, "function");
        const ctx = decodeTwitchChatContext({
            ...base, is_mod: value, is_subscriber: value, is_vip: value,
        });
        assert.deepEqual(ctx.badges, ["moderator", "subscriber", "vip"]);
    });
}
test("user_type metadata grants broadcaster and moderator roles", () => {
    assert.equal(typeof decodeTwitchChatContext, "function");
    assert.deepEqual(decodeTwitchChatContext({ ...base, user_type: "broadcaster" }).badges, ["broadcaster"]);
    assert.deepEqual(decodeTwitchChatContext({ ...base, user_type: "moderator" }).badges, ["moderator"]);
    assert.deepEqual(decodeTwitchChatContext({ ...base, user_type: "viewer" }).badges, []);
});
test("malformed chat input cannot reach command processing", () => {
    assert.equal(typeof decodeTwitchChatContext, "function");
    for (const event of [null, [], {}, { ...base, chatter_user_login: 123 }, { ...base, message: null }, { ...base, message: { text: "" } }]) {
        assert.equal(decodeTwitchChatContext(event), null);
    }
});

test("shared-chat source badges do not grant moderator access in the receiving channel", () => {
    assert.equal(typeof decodeTwitchChatContext, "function");
    assert.deepEqual(decodeTwitchChatContext({ ...base, source_badges: [{ set_id: "broadcaster" }, { set_id: "moderator" }], source_broadcaster_user_id: "2" }).badges, []);
});
