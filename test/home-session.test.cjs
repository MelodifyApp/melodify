"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
    normalizeHomeSessionSnapshot,
} = require("../src/features/home/homeSessionTypes");
const {
    loadHomeSession,
    subscribeHomeSessionUpdates,
} = require("../src/features/home/useHomeSession");

const valid = {
    revision: 4,
    current: {
        status: "playing",
        title: "Track",
        artist: "Artist",
        artworkUrl: "https://images.example/art.jpg",
        error: null,
        spotifyAccessToken: "must-not-cross",
    },
    queue: [
        {
            id: "q1",
            title: "Waiting",
            artist: "Artist",
            requester: "viewer",
            platform: "kick",
            acceptedAt: 1000,
            position: 9,
            spotifyRefreshToken: "must-not-cross",
        },
    ],
    queueScope: "session",
    spotifyAccessToken: "must-not-cross",
};

test("Home session snapshots whitelist only safe current/queue fields", () => {
    const snapshot = normalizeHomeSessionSnapshot(valid);
    assert.ok(snapshot);
    assert.equal(snapshot.revision, 4);
    assert.deepEqual(snapshot.current, {
        status: "playing",
        title: "Track",
        artist: "Artist",
        artworkUrl: "https://images.example/art.jpg",
        error: null,
    });
    assert.deepEqual(snapshot.queue, [
        {
            id: "q1",
            title: "Waiting",
            artist: "Artist",
            requester: "viewer",
            platform: "kick",
            acceptedAt: 1000,
            position: 1,
        },
    ]);
    assert.doesNotMatch(
        JSON.stringify(snapshot),
        /must-not-cross|spotifyAccessToken|spotifyRefreshToken/
    );

    assert.equal(
        normalizeHomeSessionSnapshot({
            ...valid,
            current: {
                status: "playing",
                title: null,
                artist: null,
                artworkUrl: null,
                error: null,
            },
        }),
        null
    );
    assert.equal(normalizeHomeSessionSnapshot({}), null);
    assert.equal(
        normalizeHomeSessionSnapshot({
            ...valid,
            current: {
                ...valid.current,
                artworkUrl: "javascript:alert(1)",
            },
        }).current.artworkUrl,
        null
    );
});

test("Home session listener subscriptions are clean and ignore malformed events", () => {
    let listener;
    let removed;
    const bridge = {
        invoke: async () => valid,
        on(channel, fn) {
            assert.equal(channel, "home:sessionUpdated");
            listener = fn;
        },
        removeListener(channel, fn) {
            assert.equal(channel, "home:sessionUpdated");
            removed = fn;
        },
    };
    const seen = [];
    const unsubscribe = subscribeHomeSessionUpdates(bridge, (snapshot) =>
        seen.push(snapshot)
    );
    listener(valid);
    listener({ bad: true });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].current.title, "Track");
    unsubscribe();
    assert.equal(removed, listener);
});

test("Home session initial load normalizes the main snapshot", async () => {
    const bridge = {
        invoke: async (channel) => {
            assert.equal(channel, "home:getSession");
            return valid;
        },
    };
    const snapshot = await loadHomeSession(bridge);
    assert.equal(snapshot.current.status, "playing");
    assert.equal(snapshot.queue[0].position, 1);
    assert.doesNotMatch(JSON.stringify(snapshot), /must-not-cross/);
});
