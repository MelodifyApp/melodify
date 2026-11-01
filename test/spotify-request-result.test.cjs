"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const values = {
    spotifyClientId: "test-client",
    spotifyClientSecret: "test-secret",
    spotifyAccessToken: "test-access",
    spotifyRefreshToken: "test-refresh",
    spotifyExpiresAt: Date.now() + 3_600_000,
    canAnyonePlaySong: true,
    replyOnSongRequest: true,
    replyOnSongRequestError: true,
    songRequestReplyTemplate: "Added: {title} - {artist}",
    songRequestErrorTemplate: "Could not add track",
};
const effects = { count: 0, history: 0, globalCooldown: 0, userCooldown: 0, replies: [], warnings: [], queue: [] };
let rejectQueue = false;
let resolveQueue;
let pendingQueue = false;
let searchError = null;
let noResults = false;
let queueError = null;
let trackOverride = null;
const acceptedQueue = [];
const track = { uri: "spotify:track:abc123", name: "Sample track", artists: [{ name: "Sample artist" }] };
class FakeSpotifyWebApi {
    setAccessToken(token) {
        this.accessToken = token;
        values.spotifyAccessToken = token;
    }
    setRefreshToken(token) {
        values.spotifyRefreshToken = token;
    }
    getAccessToken() {
        return this.accessToken || values.spotifyAccessToken;
    }
    async searchTracks() {
        if (searchError) throw searchError;
        if (noResults) return { body: { tracks: { total: 0, items: [] } } };
        return { body: { tracks: { total: 1, items: [trackOverride || track] } } };
    }
    async getTrack() { return { body: trackOverride || track }; }
    async refreshAccessToken() {
        return {
            body: { access_token: "refreshed-access", expires_in: 3600 },
        };
    }
    async addToQueue(uri) {
        effects.queue.push(uri);
        if (pendingQueue) await new Promise((resolve) => { resolveQueue = resolve; });
        if (queueError) throw queueError;
        if (rejectQueue) throw new Error("Spotify rejected queue insertion");
    }
}

const originalFetch = global.fetch;
global.fetch = async (url, init = {}) => {
    const uri = new URL(String(url)).searchParams.get("uri");
    effects.queue.push(uri);
    if (pendingQueue) {
        await new Promise((resolve, reject) => {
            resolveQueue = resolve;
            if (init.signal?.aborted) {
                const error = new Error("request aborted");
                error.name = "AbortError";
                reject(error);
                return;
            }
            init.signal?.addEventListener(
                "abort",
                () => {
                    const error = new Error("request aborted");
                    error.name = "AbortError";
                    reject(error);
                },
                { once: true }
            );
        });
    }
    if (queueError) throw queueError;
    if (rejectQueue) throw new Error("Spotify rejected queue insertion");
    return { ok: true, status: 204 };
};
test.after(() => {
    global.fetch = originalFetch;
});
const config = { get: (key) => values[key], set: (data) => Object.assign(values, data) };
const logging = {
    logDebug() {}, logInfo() {},
    logWarn(message) { effects.warnings.push(message); },
    logError() {},
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
        if (request === "@/features/home/homeQueue") {
            return {
                homeQueue: {
                    add(input) {
                        acceptedQueue.push(input);
                    },
                },
            };
        }
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
    reserveSongRequestAdmission(username) {
        const globalBlocked = this.checkGlobalCooldown();
        const userBlocked = this.checkUserCooldown(username);
        if (globalBlocked || userBlocked) {
            let remainingTime = 0;
            if (globalBlocked) {
                remainingTime = Math.max(
                    remainingTime,
                    this.getRemainingCooldownTime(this.getGlobalCooldownEnd())
                );
            }
            if (userBlocked) {
                remainingTime = Math.max(
                    remainingTime,
                    this.getRemainingCooldownTime(
                        this.getUserCooldownEnd(username)
                    )
                );
            }
            return {
                admitted: false,
                remainingTime,
                commit() {},
                release() {},
            };
        }
        return {
            admitted: true,
            remainingTime: 0,
            commit: () => {
                this.setGlobalCooldown();
                this.setUserCooldown(username);
            },
            release() {},
        };
    },
    setGlobalCooldown() { effects.globalCooldown++; },
    setUserCooldown() { effects.userCooldown++; },
};
const context = { username: "sample-viewer", message: "!sr Sample track", badges: [], platform: "kick" };
const sendReply = async (message) => { effects.replies.push(message); };
function reset() {
    effects.count = effects.history = effects.globalCooldown = effects.userCooldown = 0;
    effects.replies = [];
    effects.warnings = [];
    effects.queue = [];
    acceptedQueue.length = 0;
    rejectQueue = pendingQueue = false;
    resolveQueue = undefined;
    searchError = null;
    noResults = false;
    queueError = null;
    trackOverride = null;
    values.spotifyAccessToken = "test-access";
    values.spotifyRefreshToken = "test-refresh";
    values.spotifyExpiresAt = Date.now() + 3_600_000;
    values.replyOnSongRequestError = true;
    values.replyOnCooldown = true;
    values.canAnyonePlaySong = true;
    values.allowedBadges = ["og", "vip", "subscriber"];
    values.customModerators = [];
    player?.resetSpotifyApi?.();
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

test("only Spotify-confirmed requests enter the local session queue", async () => {
    reset();
    rejectQueue = true;
    assert.equal(
        await executeSongRequest(context, "Sample track", manager, {
            sendReply,
            skipPermissionCheck: true,
        }),
        false
    );
    assert.deepEqual(acceptedQueue, []);

    reset();
    assert.equal(
        await executeSongRequest(context, "Sample track", manager, {
            sendReply,
            skipPermissionCheck: true,
        }),
        true
    );
    assert.equal(acceptedQueue.length, 1);
    assert.deepEqual(
        {
            title: acceptedQueue[0].title,
            artist: acceptedQueue[0].artist,
            requester: acceptedQueue[0].requester,
            platform: acceptedQueue[0].platform,
        },
        {
            title: "Sample track",
            artist: "Sample artist",
            requester: "sample-viewer",
            platform: "kick",
        }
    );
    assert.equal(typeof acceptedQueue[0].acceptedAt, "number");
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

const history = require("../src/core/songRequestHistory");

test("Spotify search failures produce a sanitized typed error reply", async () => {
    reset();
    values.songRequestErrorTemplate = "Could not add: {error}";
    searchError = Object.assign(new Error("raw provider body token=secret"), {
        statusCode: 503,
    });
    const success = await executeSongRequest(
        context,
        "Sample track",
        manager,
        { sendReply }
    );
    assert.equal(success, false);
    assert.deepEqual(effects.queue, []);
    assert.deepEqual(effects.replies, [
        "@sample-viewer Could not add: Spotify is temporarily unavailable.",
    ]);
    assert.doesNotMatch(effects.replies[0], /raw provider body|token=secret/);
});

test("Spotify auth failure and no-result outcomes are distinguished", async () => {
    reset();
    values.songRequestErrorTemplate = "Failed: {error}";
    searchError = Object.assign(new Error("raw auth detail"), {
        statusCode: 401,
    });
    assert.equal(await executeSongRequest(context, "Sample track", manager, { sendReply }), false);
    assert.deepEqual(effects.replies, [
        "@sample-viewer Failed: Spotify authentication is unavailable.",
    ]);

    reset();
    values.songRequestErrorTemplate = "Failed: {error}";
    noResults = true;
    assert.equal(await executeSongRequest(context, "Sample track", manager, { sendReply }), false);
    assert.deepEqual(effects.replies, [
        "@sample-viewer Failed: No matching track found.",
    ]);
});

test("Spotify cancellation is reported without a false search failure", async () => {
    reset();
    values.songRequestErrorTemplate = "Cancelled: {error}";
    searchError = Object.assign(new Error("request aborted"), {
        name: "AbortError",
    });
    assert.equal(
        await executeSongRequest(context, "Sample track", manager, {
            sendReply,
        }),
        false
    );
    assert.deepEqual(effects.replies, [
        "@sample-viewer Cancelled: Spotify request was cancelled.",
    ]);
});

test("unplayable and queue-rejected outcomes are distinct and sanitized", async () => {
    reset();
    values.songRequestErrorTemplate = "Failed: {error}";
    trackOverride = { ...track, is_playable: false };
    assert.equal(await executeSongRequest(context, "Sample track", manager, { sendReply }), false);
    assert.deepEqual(effects.replies, [
        "@sample-viewer Failed: Track is unavailable.",
    ]);

    reset();
    values.songRequestErrorTemplate = "Failed: {error}";
    queueError = Object.assign(new Error("raw queue body credential"), {
        statusCode: 400,
    });
    assert.equal(await executeSongRequest(context, "Sample track", manager, { sendReply }), false);
    assert.deepEqual(effects.replies, [
        "@sample-viewer Failed: Spotify rejected the queue request.",
    ]);
    assert.doesNotMatch(effects.replies[0], /raw queue body|credential/);
});

test("reward outcomes use the existing history status for success, cooldown and queue failure", async () => {
    reset();
    effects.replies = [];
    history.resetSongRequestOutcomeHistory();
    assert.equal(
        await executeSongRequest(context, "Sample track", manager, {
            sendReply,
            skipPermissionCheck: true,
        }),
        true
    );
    assert.deepEqual(
        {
            status: history.getLastSongRequestOutcome().status,
            source: history.getLastSongRequestOutcome().source,
            reason: history.getLastSongRequestOutcome().reason,
            manual: history.getLastSongRequestOutcome().manualReconciliationRequired,
        },
        {
            status: "success",
            source: "reward",
            reason: undefined,
            manual: false,
        }
    );

    reset();
    history.resetSongRequestOutcomeHistory();
    const coolingManager = {
        ...manager,
        checkGlobalCooldown: () => true,
        getGlobalCooldownEnd: () => 30,
        getRemainingCooldownTime: () => 30,
    };
    assert.equal(
        await executeSongRequest(context, "Sample track", coolingManager, {
            sendReply,
            skipPermissionCheck: true,
        }),
        false
    );
    assert.equal(history.getLastSongRequestOutcome().reason, "cooldown");
    assert.equal(history.getLastSongRequestOutcome().source, "reward");
    assert.equal(
        history.getLastSongRequestOutcome().manualReconciliationRequired,
        true
    );
    assert.deepEqual(effects.queue, []);

    reset();
    history.resetSongRequestOutcomeHistory();
    rejectQueue = true;
    assert.equal(
        await executeSongRequest(context, "Sample track", manager, {
            sendReply,
            skipPermissionCheck: true,
        }),
        false
    );
    assert.equal(
        history.getLastSongRequestOutcome().reason,
        "queue-rejected"
    );
    assert.equal(
        history.getLastSongRequestOutcome().manualReconciliationRequired,
        true
    );
    assert.equal(effects.count, 0);
});

test("a failed reward is attributable in app logs and export", async () => {
    const { formatLogsForExport } = require("../src/core/logging/export");
    for (const platform of ["kick", "twitch"]) {
        reset();
        history.resetSongRequestOutcomeHistory();
        rejectQueue = true;
        assert.equal(
            await executeSongRequest(
                { ...context, platform },
                "Sample track",
                manager,
                { sendReply, skipPermissionCheck: true }
            ),
            false
        );
        const warning = effects.warnings.find((message) =>
            /Song request rejected/i.test(message)
        );
        assert.ok(warning, "expected the rejection warning");
        assert.match(warning, /sample-viewer/);
        assert.match(warning, new RegExp(platform));
        assert.match(warning, /manual reconciliation/i);

        const exported = formatLogsForExport([
            {
                level: "warn",
                timestamp: Date.now(),
                message: warning,
            },
        ]);
        assert.match(exported, /sample-viewer/);
        assert.match(exported, new RegExp(platform));
        assert.match(exported, /manual reconciliation/i);
    }
});

test("no-sender reward outcomes are still recorded without a chat reply", async () => {
    reset();
    history.resetSongRequestOutcomeHistory();
    rejectQueue = true;
    assert.equal(
        await executeSongRequest(context, "Sample track", manager, {
            skipPermissionCheck: true,
        }),
        false
    );
    assert.deepEqual(effects.replies, []);
    assert.equal(history.getLastSongRequestOutcome().status, "rejected");
    assert.equal(
        history.getLastSongRequestOutcome().manualReconciliationRequired,
        true
    );

    reset();
    history.resetSongRequestOutcomeHistory();
    assert.equal(
        await executeSongRequest(context, "Sample track", manager, {
            skipPermissionCheck: true,
        }),
        true
    );
    assert.equal(history.getLastSongRequestOutcome().status, "success");
});

test("a failed chat reply does not erase the reward outcome", async () => {
    reset();
    history.resetSongRequestOutcomeHistory();
    await assert.rejects(
        executeSongRequest(context, "Sample track", manager, {
            sendReply: async () => {
                throw new Error("chat transport unavailable");
            },
            skipPermissionCheck: true,
        }),
        /chat transport unavailable/
    );
    assert.deepEqual(effects.queue, [track.uri]);
    assert.equal(effects.count, 1);
    assert.equal(history.getLastSongRequestOutcome().status, "success");
    assert.equal(history.getLastSongRequestOutcome().source, "reward");
});

test("the existing song request status supports an unknown manual-reconciliation outcome", () => {
    history.resetSongRequestOutcomeHistory();
    const recorded = history.recordSongRequestOutcome({
        status: "rejected",
        source: "reward",
        reason: "unknown",
        message: "Request failed for an unknown reason.",
        manualReconciliationRequired: true,
        platform: "twitch",
        requestedBy: "sample-viewer",
    });
    assert.equal(recorded.reason, "unknown");
    assert.equal(recorded.manualReconciliationRequired, true);
    assert.deepEqual(
        history.getLastSongRequestOutcome().reason,
        "unknown"
    );
});

test("the existing song request status exposes the last reward outcome", () => {
    const source = require("node:fs").readFileSync(
        require("node:path").join(__dirname, "..", "src", "core", "ipc", "handlers.ts"),
        "utf8"
    );
    assert.match(source, /lastOutcome:\s*getLastSongRequestOutcome\(\)/);
});
