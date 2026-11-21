"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;

function withStubs(stubs, body) {
    Module._resolveFilename = function (request, ...args) {
        return originalResolve.call(
            this,
            request.startsWith("@/")
                ? path.join(root, "src", request.slice(2))
                : request,
            ...args
        );
    };
    Module._load = function (request, parent, isMain) {
        if (Object.prototype.hasOwnProperty.call(stubs, request)) {
            return stubs[request];
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    return Promise.resolve()
        .then(body)
        .finally(() => {
            Module._resolveFilename = originalResolve;
            Module._load = originalLoad;
        });
}

function load(relativePath) {
    const resolved = require.resolve(path.join(root, relativePath));
    delete require.cache[resolved];
    return require(resolved);
}

function deferred() {
    let resolve;
    const promise = new Promise((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

async function waitFor(predicate, description, timeoutMs = 3000) {
    const started = Date.now();
    while (!predicate()) {
        if (Date.now() - started > timeoutMs) {
            throw new Error(`Timed out waiting for ${description}`);
        }
        await new Promise((resolve) => setImmediate(resolve));
    }
}

function createHarness() {
    const values = {
        canAnyonePlaySong: true,
        allowedBadges: ["og", "vip", "subscriber"],
        customModerators: [],
        replyOnSongRequest: false,
        replyOnSongRequestError: false,
        replyOnCooldown: false,
        globalCooldownEnabled: true,
        globalCooldownSeconds: "30",
        perUserCooldownEnabled: true,
        perUserCooldownSeconds: "60",
        requireLiveForRequests: false,
    };
    const effects = {
        playCalls: 0,
        queue: [],
        count: 0,
        history: 0,
        hasActiveSession: true,
    };
    let playbackGate = deferred();
    let failNext = false;
    const config = {
        get: (key) => values[key],
        set: (patch) => Object.assign(values, patch),
    };
    const logging = {
        logDebug() {},
        logInfo() {},
        logWarn() {},
        logError() {},
        logSongRequest() {
            effects.history += 1;
        },
    };
    const player = {
        async playSong(query) {
            effects.playCalls += 1;
            if (failNext) {
                return {
                    status: "failure",
                    reason: "not-found",
                    error: "No matching track found.",
                };
            }
            await playbackGate.promise;
            effects.queue.push(query);
            return {
                status: "success",
                song: { title: "Dummy track", artist: "Dummy artist" },
            };
        },
    };
    const stubs = {
        "@/core/config": { __esModule: true, default: config },
        "@/core/logging": logging,
        "@/core/logging/utils": { redactSecrets: (value) => value },
        "@/core/ipc/handlers": {
            incrementSongRequestCount() {
                effects.count += 1;
            },
        },
        "@/features/spotify/playback/player": player,
        "@/features/home/streamSessionRuntime": {
            hasActiveStreamSession: () => effects.hasActiveSession,
        },
    };
    return {
        values,
        effects,
        config,
        stubs,
        resetGate() {
            playbackGate = deferred();
            return playbackGate;
        },
        setFailNext(value) {
            failNext = value;
        },
    };
}

test("concurrent allowed song requests admit at most one queue mutation and count", async () => {
    const harness = createHarness();
    const gate = harness.resetGate();

    await withStubs(harness.stubs, async () => {
        const { CommandManager } = load("src/core/commands/manager.ts");
        const { executeSongRequest } = load("src/core/commands/songRequest.ts");
        const manager = new CommandManager();
        const ctx = {
            username: "dummy-viewer",
            message: "!sr dummy",
            badges: [],
            platform: "kick",
        };
        const sendReply = async () => {};

        const first = executeSongRequest(ctx, "dummy song one", manager, {
            sendReply,
        });
        let secondSettled = false;
        let secondResult;
        const second = executeSongRequest(ctx, "dummy song two", manager, {
            sendReply,
        }).then((value) => {
            secondSettled = true;
            secondResult = value;
            return value;
        });

        await waitFor(
            () => harness.effects.playCalls >= 2 || secondSettled,
            "both requests to reach admission or for the second to be rejected"
        );
        const secondSettledBeforeGate = secondSettled;

        gate.resolve();
        const results = await Promise.all([first, second]);
        const accepted = results.filter(Boolean).length;

        assert.equal(accepted, 1);
        assert.equal(harness.effects.queue.length, 1);
        assert.equal(harness.effects.count, 1);
        assert.equal(secondResult, false);
        assert.equal(
            secondSettledBeforeGate,
            true,
            "the second request must be rejected before the provider gate"
        );
    });
});

test("admission reservations are atomic and can be released on failure", async () => {
    const harness = createHarness();

    await withStubs(harness.stubs, async () => {
        const { CommandManager } = load("src/core/commands/manager.ts");
        const manager = new CommandManager();

        const first = manager.reserveSongRequestAdmission("viewer");
        assert.equal(first.admitted, true);
        const second = manager.reserveSongRequestAdmission("viewer");
        assert.equal(second.admitted, false);
        assert.ok(second.remainingTime > 0);

        first.release();
        const third = manager.reserveSongRequestAdmission("viewer");
        assert.equal(third.admitted, true);
        third.release();
    });
});

test("committing an admission blocks the next request with normal cooldown time", async () => {
    const harness = createHarness();

    await withStubs(harness.stubs, async () => {
        const { CommandManager } = load("src/core/commands/manager.ts");
        const manager = new CommandManager();

        const admission = manager.reserveSongRequestAdmission("viewer");
        assert.equal(admission.admitted, true);
        admission.commit();

        const blocked = manager.reserveSongRequestAdmission("viewer");
        assert.equal(blocked.admitted, false);
        assert.ok(blocked.remainingTime > 0);
    });
});

test("a playback failure releases the admission for a later request", async () => {
    const harness = createHarness();
    const gate = harness.resetGate();

    await withStubs(harness.stubs, async () => {
        const { CommandManager } = load("src/core/commands/manager.ts");
        const { executeSongRequest } = load("src/core/commands/songRequest.ts");
        const manager = new CommandManager();
        const ctx = {
            username: "dummy-viewer",
            message: "!sr dummy",
            badges: [],
            platform: "kick",
        };
        const sendReply = async () => {};

        harness.setFailNext(true);
        assert.equal(
            await executeSongRequest(ctx, "failed song", manager, {
                sendReply,
            }),
            false
        );

        harness.setFailNext(false);
        gate.resolve();
        assert.equal(
            await executeSongRequest(ctx, "next song", manager, {
                sendReply,
            }),
            true
        );
        assert.equal(harness.effects.queue.length, 1);
        assert.equal(harness.effects.count, 1);
        assert.equal(harness.effects.history, 1);
    });
});

test("an empty query releases the admission without consuming cooldown", async () => {
    const harness = createHarness();

    await withStubs(harness.stubs, async () => {
        const { CommandManager } = load("src/core/commands/manager.ts");
        const { executeSongRequest } = load("src/core/commands/songRequest.ts");
        const manager = new CommandManager();
        const ctx = {
            username: "dummy-viewer",
            message: "!sr   ",
            badges: [],
            platform: "kick",
        };

        assert.equal(
            await executeSongRequest(ctx, "   ", manager, {
                sendReply: async () => {},
            }),
            false
        );

        const admission = manager.reserveSongRequestAdmission("dummy-viewer");
        assert.equal(admission.admitted, true);
        admission.release();
    });
});

test("requireLiveForRequests rejects before playback when no session is active", async () => {
    const harness = createHarness();
    harness.values.requireLiveForRequests = true;
    harness.effects.hasActiveSession = false;

    await withStubs(harness.stubs, async () => {
        const { executeSongRequest } = load(
            "src/core/commands/songRequest.ts"
        );
        let outcome = null;
        const accepted = await executeSongRequest(
            {
                username: "viewer",
                message: "!sr song",
                badges: [],
                platform: "kick",
            },
            "dummy song",
            undefined,
            {
                onOutcome(value) {
                    outcome = value;
                },
            }
        );

        assert.equal(accepted, false);
        assert.equal(harness.effects.playCalls, 0);
        assert.equal(outcome.status, "rejected");
        assert.equal(outcome.reason, "offline");
    });
});

test("allows a request with no session when requireLiveForRequests is off", async () => {
    const harness = createHarness();
    harness.effects.hasActiveSession = false;
    const gate = harness.resetGate();

    await withStubs(harness.stubs, async () => {
        const { executeSongRequest } = load(
            "src/core/commands/songRequest.ts"
        );
        const request = executeSongRequest(
            {
                username: "viewer",
                message: "!sr song",
                badges: [],
                platform: "kick",
            },
            "dummy song"
        );

        await waitFor(
            () => harness.effects.playCalls === 1,
            "playback to start"
        );
        gate.resolve();
        assert.equal(await request, true);
    });
});
