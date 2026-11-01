"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createHomeQueueStore,
} = require("../src/features/home/homeQueue");

function makeStore() {
    let id = 0;
    return createHomeQueueStore({
        now: () => 1234,
        nextId: () => `queue-${++id}`,
    });
}

test("accepted entries keep stable ids, order, fields and exposed positions", () => {
    const queue = makeStore();
    const first = queue.add({
        title: "First",
        artist: "Artist One",
        requester: "viewer-a",
        platform: "kick",
    });
    const second = queue.add({
        title: "Second",
        artist: "Artist Two",
        requester: "viewer-b",
        platform: "twitch",
        acceptedAt: 9876,
    });

    assert.deepEqual(first, {
        id: "queue-1",
        title: "First",
        artist: "Artist One",
        requester: "viewer-a",
        platform: "kick",
        acceptedAt: 1234,
        position: 1,
    });
    assert.deepEqual(second, {
        id: "queue-2",
        title: "Second",
        artist: "Artist Two",
        requester: "viewer-b",
        platform: "twitch",
        acceptedAt: 9876,
        position: 2,
    });
    assert.deepEqual(
        queue.snapshot().map((entry) => ({
            id: entry.id,
            position: entry.position,
        })),
        [
            { id: "queue-1", position: 1 },
            { id: "queue-2", position: 2 },
        ]
    );
});

test("playing a track removes only the earliest matching duplicate", () => {
    const queue = makeStore();
    queue.add({
        title: "Same Song",
        artist: "Artist A, Guest B",
        requester: "one",
        platform: "kick",
    });
    queue.add({
        title: "same song",
        artist: "Guest B",
        requester: "two",
        platform: "twitch",
    });
    queue.add({
        title: "Other Song",
        artist: "Artist C",
        requester: "three",
        platform: "kick",
    });

    const removed = queue.markPlaying({
        title: "SAME SONG",
        artists: ["Artist A"],
    });
    assert.equal(removed.id, "queue-1");
    assert.equal(removed.position, 1);
    assert.deepEqual(
        queue.snapshot().map((entry) => ({
            id: entry.id,
            title: entry.title,
            position: entry.position,
        })),
        [
            { id: "queue-2", title: "same song", position: 1 },
            { id: "queue-3", title: "Other Song", position: 2 },
        ]
    );

    assert.equal(
        queue.markPlaying({ title: "Missing", artists: ["Artist A"] }),
        null
    );
    assert.equal(queue.snapshot().length, 2);
});

test("matching stays usable with a legacy single artist string", () => {
    const queue = makeStore();
    queue.add({
        title: "Legacy",
        artist: "Artist A",
        requester: "viewer",
        platform: "kick",
    });
    assert.equal(
        queue.markPlaying({ title: "legacy", artist: "artist a" }).id,
        "queue-1"
    );
});

test("subscribers see additions, removals and reset; unsubscribe is clean", () => {
    const queue = makeStore();
    const seen = [];
    const unsubscribe = queue.subscribe((entries) => {
        seen.push(entries.map((entry) => entry.id));
    });

    queue.add({
        title: "One",
        artist: "Artist",
        requester: "viewer",
        platform: "kick",
    });
    queue.markPlaying({ title: "One", artists: ["Artist"] });
    unsubscribe();
    queue.add({
        title: "Two",
        artist: "Artist",
        requester: "viewer",
        platform: "twitch",
    });

    assert.deepEqual(seen, [
        ["queue-1"],
        [],
    ]);
    queue.reset();
    assert.deepEqual(queue.snapshot(), []);
});
