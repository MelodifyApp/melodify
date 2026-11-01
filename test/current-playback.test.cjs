"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createCurrentPlaybackService,
    CURRENT_PLAYBACK_INTERVAL_MS,
} = require("../src/features/spotify/playback/currentPlayback");

function fakeTimers() {
    const timers = [];
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    global.setTimeout = (callback, delay) => {
        const timer = {
            callback,
            delay,
            cleared: false,
            fired: false,
        };
        timers.push(timer);
        return timer;
    };
    global.clearTimeout = (timer) => {
        if (timer) timer.cleared = true;
    };
    return {
        timers,
        active() {
            return timers.filter((timer) => !timer.cleared && !timer.fired);
        },
        fireNext() {
            const timer = this.active()[0];
            assert.ok(timer, "expected a playback poll timer");
            timer.fired = true;
            timer.callback();
        },
        restore() {
            global.setTimeout = originalSetTimeout;
            global.clearTimeout = originalClearTimeout;
        },
    };
}

async function flush() {
    for (let index = 0; index < 8; index += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

function deferred() {
    let resolve;
    const promise = new Promise((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

test("one main-owned poller publishes a playing track and its existing artwork", async () => {
    const timers = fakeTimers();
    let calls = 0;
    const service = createCurrentPlaybackService({
        now: () => 1000 + calls,
        getApi: () => ({
            async getMyCurrentPlaybackState() {
                calls += 1;
                return {
                    body: {
                        is_playing: true,
                        item: {
                            type: "track",
                            name: "Now Song",
                            artists: [{ name: "Artist A" }, { name: "Artist B" }],
                            album: {
                                images: [{ url: "https://images.example/art.jpg" }],
                            },
                        },
                    },
                };
            },
        }),
        checkToken: async () => true,
    });
    try {
        service.start();
        await flush();
        assert.deepEqual(service.getSnapshot(), {
            status: "playing",
            track: {
                title: "Now Song",
                artist: "Artist A, Artist B",
                artists: ["Artist A", "Artist B"],
                artworkUrl: "https://images.example/art.jpg",
            },
            error: null,
            updatedAt: 1001,
        });
        assert.equal(calls, 1);
        assert.equal(timers.active().length, 1);
        assert.equal(timers.active()[0].delay, CURRENT_PLAYBACK_INTERVAL_MS);

        timers.fireNext();
        await flush();
        assert.equal(calls, 2);
        assert.equal(timers.active().length, 1);
        service.stop();
        assert.equal(timers.active().length, 0);
    } finally {
        service.stop();
        timers.restore();
    }
});

test("idle playback reports no track and never invents progress", async () => {
    const timers = fakeTimers();
    const service = createCurrentPlaybackService({
        getApi: () => ({
            async getMyCurrentPlaybackState() {
                return {
                    body: {
                        is_playing: false,
                        item: null,
                    },
                };
            },
        }),
        checkToken: async () => true,
    });
    try {
        service.start();
        await flush();
        assert.equal(service.getSnapshot().status, "idle");
        assert.equal(service.getSnapshot().track, null);
        assert.equal(service.getSnapshot().error, null);
    } finally {
        service.stop();
        timers.restore();
    }
});

test("auth failure stops polling and exposes a truthful error", async () => {
    const timers = fakeTimers();
    const service = createCurrentPlaybackService({
        getApi: () => ({
            async getMyCurrentPlaybackState() {
                const error = new Error("unauthorized");
                error.statusCode = 401;
                throw error;
            },
        }),
        checkToken: async () => true,
    });
    try {
        service.start();
        await flush();
        assert.equal(service.getSnapshot().status, "error");
        assert.equal(service.getSnapshot().error, "auth");
        assert.equal(timers.active().length, 0);
    } finally {
        service.stop();
        timers.restore();
    }
});

test("provider failures keep one bounded retry loop", async () => {
    const timers = fakeTimers();
    let calls = 0;
    const service = createCurrentPlaybackService({
        getApi: () => ({
            async getMyCurrentPlaybackState() {
                calls += 1;
                const error = new Error("temporary");
                error.statusCode = 503;
                throw error;
            },
        }),
        checkToken: async () => true,
    });
    try {
        service.start();
        await flush();
        assert.equal(service.getSnapshot().status, "error");
        assert.equal(service.getSnapshot().error, "provider");
        assert.equal(timers.active().length, 1);
        assert.equal(timers.active()[0].delay, 30_000);
        timers.fireNext();
        await flush();
        assert.equal(calls, 2);
        assert.equal(timers.active().length, 1);
    } finally {
        service.stop();
        timers.restore();
    }
});

test("starting twice does not create a second polling loop", async () => {
    const timers = fakeTimers();
    let calls = 0;
    const service = createCurrentPlaybackService({
        getApi: () => ({
            async getMyCurrentPlaybackState() {
                calls += 1;
                return { body: { is_playing: false, item: null } };
            },
        }),
        checkToken: async () => true,
    });
    try {
        service.start();
        service.start();
        await flush();
        assert.equal(calls, 1);
        assert.equal(timers.active().length, 1);
    } finally {
        service.stop();
        timers.restore();
    }
});
