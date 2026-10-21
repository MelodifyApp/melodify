"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const values = {
    spotifyClientId: "test-client",
    spotifyClientSecret: "test-secret",
    canAnyonePlaySong: true,
    replyOnSongRequest: true,
    replyOnSongRequestError: true,
    songRequestReplyTemplate: "Added: {title} - {artist}",
    songRequestErrorTemplate: "Could not add track",
};
const effects = { count: 0, history: 0, globalCooldown: 0, userCooldown: 0, replies: [], queue: [] };
let rejectQueue = false;
let resolveQueue;
let pendingQueue = false;
const track = { uri: "spotify:track:abc123", name: "Sample track", artists: [{ name: "Sample artist" }] };
class FakeSpotifyWebApi {
    async searchTracks() { return { body: { tracks: { total: 1, items: [track] } } }; }
    async getTrack() { return { body: track }; }
    async addToQueue(uri) {
        effects.queue.push(uri);
        if (pendingQueue) await new Promise((resolve) => { resolveQueue = resolve; });
        if (rejectQueue) throw new Error("Spotify rejected queue insertion");
    }
}
const config = { get: (key) => values[key], set: (data) => Object.assign(values, data) };
const logging = {
    logDebug() {}, logInfo() {}, logWarn() {}, logError() {},
    logSongRequest() { effects.history++; },
};
const originalLoad = Module._load;
let player;
let executeSongRequest;
try {
    Module._load = function (request, parent, isMain) {
        if (request === "spotify-web-api-node") return FakeSpotifyWebApi;
        if (request === "@/core/config") return { __esModule: true, default: config };
        if (request === "@/core/logging") return logging;
        if (request === "@/core/logging/utils") return { redactSecrets: (value) => value };
        if (request === "@/core/ipc/handlers") return { incrementSongRequestCount() { effects.count++; } };
        if (request === "@/features/spotify/playback/player") return player;
        return originalLoad.call(this, request, parent, isMain);
    };
    player = require("../src/features/spotify/playback/player");
    ({ executeSongRequest } = require("../src/core/commands/songRequest"));
} finally {
    Module._load = originalLoad;
}

const manager = {
    checkGlobalCooldown: () => false,
    checkUserCooldown: () => false,
    setGlobalCooldown() { effects.globalCooldown++; },
    setUserCooldown() { effects.userCooldown++; },
};
const context = { username: "sample-viewer", message: "!sr Sample track", badges: [], platform: "kick" };
const sendReply = async (message) => { effects.replies.push(message); };
function reset() {
    effects.count = effects.history = effects.globalCooldown = effects.userCooldown = 0;
    effects.replies = [];
    effects.queue = [];
    rejectQueue = pendingQueue = false;
    resolveQueue = undefined;
    values.replyOnSongRequestError = true;
    values.replyOnCooldown = true;
    values.canAnyonePlaySong = true;
    values.allowedBadges = ["og", "vip", "subscriber"];
    values.customModerators = [];
}

for (const query of ["Sample track", "https://open.spotify.com/track/abc123", "spotify:track:abc123"]) {
    test(`queue rejection cannot produce request success: ${query}`, async () => {
        reset();
        rejectQueue = true;
        const success = await executeSongRequest(context, query, manager, { sendReply });
        assert.equal(success, false);
        assert.deepEqual(effects.queue, [track.uri]);
        assert.equal(effects.count, 0);
        assert.equal(effects.history, 0);
        assert.equal(effects.globalCooldown, 0);
        assert.equal(effects.userCooldown, 0);
        assert.deepEqual(effects.replies, ["@sample-viewer Could not add track"]);
    });
}

test("reward request also fails without success side effects when Spotify rejects it", async () => {
    reset();
    rejectQueue = true;
    values.replyOnSongRequestError = false;
    const success = await executeSongRequest(context, "Sample track", manager, { sendReply, skipPermissionCheck: true });
    assert.equal(success, false);
    assert.equal(effects.count, 0);
    assert.equal(effects.history, 0);
    assert.equal(effects.globalCooldown, 0);
    assert.equal(effects.userCooldown, 0);
    assert.deepEqual(effects.replies, []);
});

test("success side effects wait for Spotify queue confirmation and occur once", async () => {
    reset();
    pendingQueue = true;
    const request = executeSongRequest(context, "Sample track", manager, { sendReply });
    // Let lookup and queue insertion reach the controlled pending API response.
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(typeof resolveQueue, "function");
    assert.equal(effects.count, 0);
    assert.equal(effects.history, 0);
    assert.equal(effects.globalCooldown, 0);
    assert.equal(effects.userCooldown, 0);
    assert.deepEqual(effects.replies, []);
    resolveQueue();
    assert.equal(await request, true);
    assert.equal(effects.count, 1);
    assert.equal(effects.history, 1);
    assert.equal(effects.globalCooldown, 1);
    assert.equal(effects.userCooldown, 1);
    assert.deepEqual(effects.queue, [track.uri]);
    assert.deepEqual(effects.replies, ["@sample-viewer Added: Sample track - Sample artist"]);
});

for (const platform of ["kick", "twitch"]) {
    for (const reward of [false, true]) {
        for (const cooldown of ["global", "user", "both"]) {
            for (const replyMode of ["enabled", "disabled", "no-sender"]) {
                test(`${platform} ${reward ? "reward" : "command"}: ${cooldown} cooldown blocks with reply ${replyMode}`, async () => {
                    reset();
                    values.replyOnCooldown = replyMode !== "disabled";
                    const coolingManager = {
                        ...manager,
                        checkGlobalCooldown: () => cooldown !== "user",
                        checkUserCooldown: () => cooldown !== "global",
                        getGlobalCooldownEnd: () => 30,
                        getUserCooldownEnd: () => 60,
                        getRemainingCooldownTime: (end) => end,
                    };
                    const success = await executeSongRequest(
                        { ...context, platform }, "Sample track", coolingManager,
                        { skipPermissionCheck: reward, sendReply: replyMode === "no-sender" ? undefined : sendReply }
                    );
                    assert.equal(success, false);
                    assert.deepEqual(effects.queue, []);
                    assert.equal(effects.count, 0);
                    assert.equal(effects.history, 0);
                    assert.equal(effects.globalCooldown, 0);
                    assert.equal(effects.userCooldown, 0);
                    assert.deepEqual(effects.replies, replyMode === "enabled"
                        ? [`@sample-viewer Please wait ${cooldown === "global" ? 30 : 60} seconds before requesting another song.`]
                        : []);
                });
            }
        }
    }
}

test("malformed permission config fails closed without throwing", async () => {
    for (const invalidRoles of [{ vip: true }, null, "vip"]) {
        reset();
        values.canAnyonePlaySong = false;
        values.allowedBadges = invalidRoles;
        await assert.doesNotReject(async () => {
            const success = await executeSongRequest(
                { ...context, badges: ["vip"] },
                "Sample track",
                manager,
                { sendReply }
            );
            assert.equal(success, false, `invalid roles granted access: ${JSON.stringify(invalidRoles)}`);
        });
        assert.equal(effects.queue.length, 0);
    }
});

test("malformed context badges fail closed without throwing", async () => {
    reset();
    values.canAnyonePlaySong = false;
    values.allowedBadges = ["vip"];
    for (const badges of ["vip", null, {}]) {
        await assert.doesNotReject(async () => {
            const success = await executeSongRequest(
                { ...context, badges },
                "Sample track",
                manager,
                { sendReply }
            );
            assert.equal(success, false);
        });
    }
    assert.equal(effects.queue.length, 0);
});

test("string false cannot disable song-request permissions", async () => {
    reset();
    values.canAnyonePlaySong = "false";
    const success = await executeSongRequest(
        { ...context, badges: [] },
        "Sample track",
        manager,
        { sendReply }
    );
    assert.equal(success, false);
    assert.equal(effects.queue.length, 0);
});

for (const replyMode of ["disabled", "no-sender"]) {
    test(`without an active cooldown requests still succeed with reply ${replyMode}`, async () => {
        reset();
        values.replyOnCooldown = replyMode !== "disabled";
        assert.equal(await executeSongRequest(context, "Sample track", manager, {
            sendReply: replyMode === "no-sender" ? undefined : sendReply,
        }), true);
        assert.deepEqual(effects.queue, [track.uri]);
        assert.equal(effects.count, 1);
        assert.equal(effects.history, 1);
        assert.equal(effects.globalCooldown, 1);
        assert.equal(effects.userCooldown, 1);
    });
}

for (const platform of ["kick", "twitch"]) {
    for (const [role, allowed] of [["moderator", true], ["broadcaster", true], ["vip", true], ["subscriber", true], ["viewer", false], ["custom", true]]) {
        test(`${platform}: restricted song requests honor ${role} permissions`, async () => {
            reset();
            values.canAnyonePlaySong = false;
            values.customModerators = ["SAMPLE-VIEWER"];
            if (role !== "custom") values.customModerators = [];
            const success = await executeSongRequest({ ...context, platform, badges: role === "viewer" || role === "custom" ? [] : [role] }, "Sample track", manager, { sendReply });
            assert.equal(success, allowed);
            assert.equal(effects.queue.length, allowed ? 1 : 0);
        });
    }
    test(`${platform}: empty badge allowlist keeps moderator access but rejects VIP`, async () => {
        reset();
        values.canAnyonePlaySong = false;
        values.allowedBadges = [];
        assert.equal(await executeSongRequest({ ...context, platform, badges: ["vip"] }, "Sample track", manager), false);
        assert.equal(effects.queue.length, 0);
        assert.equal(await executeSongRequest({ ...context, platform, badges: ["moderator"] }, "Sample track", manager), true);
    });
    test(`${platform}: reward bypasses role restriction while cooldown tests still apply`, async () => {
        reset();
        values.canAnyonePlaySong = false;
        values.allowedBadges = [];
        assert.equal(await executeSongRequest({ ...context, platform }, "Sample track", manager, { skipPermissionCheck: true }), true);
    });
}
