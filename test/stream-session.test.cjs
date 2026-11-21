const test = require("node:test");
const assert = require("node:assert/strict");
const {
    createStreamSessionManager,
} = require("../src/features/home/streamSession.ts");
const { createHomeQueueStore } = require("../src/features/home/homeQueue.ts");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cloneSession(session) {
    return {
        ...session,
        providers: { ...session.providers },
        entries: session.entries.map((entry) => ({ ...entry })),
    };
}

function createPersistence(initial = []) {
    let saved = initial.map(cloneSession);
    return {
        load: () => saved.map(cloneSession),
        save: (sessions) => {
            saved = sessions.map(cloneSession);
        },
        get: () => saved.map(cloneSession),
    };
}

function createHarness({
    graceMs = 30,
    start = 1000,
    initialSessions = [],
    resumeWindowMs,
} = {}) {
    let clock = start;
    let sequence = 0;
    const queue = createHomeQueueStore({
        now: () => clock,
        nextId: () => `q-${++sequence}`,
    });
    const persistence = createPersistence(initialSessions);
    const manager = createStreamSessionManager({
        queue,
        persistence,
        now: () => clock,
        graceMs,
        resumeWindowMs,
        makeId: (startedAt) => `s-${startedAt}`,
    });
    manager.initialize();
    return {
        manager,
        queue,
        persistence,
        advance: (ms) => {
            clock += ms;
        },
    };
}

test("starts a stream session on the first live provider", () => {
    const harness = createHarness();
    assert.equal(harness.manager.getActive(), null);

    harness.manager.noteLiveStatus("kick", true, true);
    const active = harness.manager.getActive();
    assert.ok(active);
    assert.equal(active.startedAt, 1000);
    assert.equal(active.endedAt, null);
    assert.equal(active.providers.kick, true);
    assert.equal(active.providers.twitch, false);

    harness.manager.noteLiveStatus("twitch", true, true);
    const joined = harness.manager.getActive();
    assert.equal(joined.id, active.id);
    assert.equal(joined.providers.twitch, true);
    assert.equal(harness.manager.getHistory().length, 1);
});

test("keeps the session across a short outage and ends after the grace window", async () => {
    const harness = createHarness({ graceMs: 40 });
    harness.manager.noteLiveStatus("kick", true, true);
    const id = harness.manager.getActive().id;
    harness.queue.add({
        title: "Midnight City",
        artist: "M83",
        requester: "viewer",
        platform: "kick",
    });

    harness.manager.noteLiveStatus("kick", false, true);
    await sleep(15);
    harness.manager.noteLiveStatus("kick", true, true);
    await sleep(50);
    assert.equal(harness.manager.getActive()?.id, id);

    harness.manager.noteLiveStatus("kick", false, true);
    await sleep(80);
    assert.equal(harness.manager.getActive(), null);
    const history = harness.manager.getHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0].id, id);
    assert.equal(history[0].endReason, "offline");
    assert.equal(history[0].entries.length, 1);
    assert.equal(history[0].entries[0].outcome, "unplayed");
    assert.equal(harness.queue.snapshot().length, 0);
});

test("does not end while another provider stays live", async () => {
    const harness = createHarness({ graceMs: 30 });
    harness.manager.noteLiveStatus("kick", true, true);
    harness.manager.noteLiveStatus("twitch", true, true);
    harness.manager.noteLiveStatus("kick", false, true);

    await sleep(60);
    const active = harness.manager.getActive();
    assert.ok(active);
    assert.equal(active.providers.kick, true);
    assert.equal(active.providers.twitch, true);
});

test("records played entries and starts a new session after an end", async () => {
    const harness = createHarness({ graceMs: 20 });
    harness.manager.noteLiveStatus("kick", true, true);
    const firstId = harness.manager.getActive().id;
    harness.queue.add({
        title: "Song",
        artist: "Artist",
        requester: "viewer",
        platform: "kick",
    });
    harness.queue.markPlaying({ title: "Song", artist: "Artist" });

    assert.equal(harness.queue.snapshot().length, 0);
    const entries = harness.manager.getActive().entries;
    assert.equal(entries.length, 1);
    assert.equal(entries[0].outcome, "played");
    assert.equal(entries[0].playedAt, 1000);

    harness.manager.noteLiveStatus("kick", false, true);
    await sleep(40);
    assert.equal(harness.manager.getActive(), null);

    harness.manager.noteLiveStatus("kick", true, true);
    const second = harness.manager.getActive();
    assert.notEqual(second.id, firstId);
    assert.equal(harness.queue.snapshot().length, 0);
    assert.equal(harness.manager.getHistory().length, 2);
});

test("keeps a session left active by a crash open for the next live check", () => {
    const persistence = createPersistence([
        {
            id: "crashed",
            startedAt: 1000,
            endedAt: null,
            endReason: null,
            providers: { kick: true, twitch: false },
            entries: [],
        },
    ]);
    const queue = createHomeQueueStore();
    const manager = createStreamSessionManager({
        queue,
        persistence,
        now: () => 5000,
    });
    manager.initialize();

    const history = manager.getHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0].endedAt, null);
    assert.equal(manager.getActive(), null);
});

test("shutdown ends the active session as app-quit", () => {
    const harness = createHarness();
    harness.manager.noteLiveStatus("kick", true, true);
    harness.manager.shutdown("app-quit");

    const history = harness.persistence.get();
    assert.equal(history.length, 1);
    assert.equal(history[0].endReason, "app-quit");
    assert.ok(history[0].endedAt !== null);
});

test("a failed live check does not end an active live session", async () => {
    const harness = createHarness({ graceMs: 20 });
    harness.manager.noteLiveStatus("kick", true, true);
    const id = harness.manager.getActive().id;

    harness.manager.noteLiveStatus("kick", null, true);
    await sleep(50);
    assert.equal(harness.manager.getActive()?.id, id);
});

test("does not start a session when no provider is configured", async () => {
    const harness = createHarness({ graceMs: 20 });
    harness.manager.noteLiveStatus("kick", null, false);
    harness.manager.noteLiveStatus("twitch", null, false);

    await sleep(40);
    assert.equal(harness.manager.getActive(), null);
    assert.equal(harness.manager.getHistory().length, 0);
});

test("clearHistory removes ended sessions and keeps the live one", async () => {
    const harness = createHarness({ graceMs: 20 });
    harness.manager.noteLiveStatus("kick", true, true);
    harness.queue.add({
        title: "First",
        artist: "Artist",
        requester: "viewer",
        platform: "kick",
    });
    harness.manager.noteLiveStatus("kick", false, true);
    await sleep(40);
    assert.equal(harness.manager.getActive(), null);

    harness.manager.noteLiveStatus("kick", true, true);
    assert.equal(harness.manager.getHistory().length, 2);

    const removed = harness.manager.clearHistory();
    assert.equal(removed, 1);
    const remaining = harness.manager.getHistory();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].endedAt, null);
    assert.ok(harness.manager.getActive());
});

test("queue exposes played entries to history subscribers", () => {
    const queue = createHomeQueueStore();
    const played = [];
    const unsubscribe = queue.subscribePlayed((entry) => played.push(entry));
    queue.add({
        title: "Song",
        artist: "Artist",
        requester: "viewer",
        platform: "twitch",
    });
    queue.markPlaying({ title: "Song", artist: "Artist" });
    unsubscribe();
    queue.add({
        title: "Other",
        artist: "Artist",
        requester: "viewer",
        platform: "twitch",
    });
    queue.markPlaying({ title: "Other", artist: "Artist" });

    assert.equal(played.length, 1);
    assert.equal(played[0].title, "Song");
});

test("resumes an app-quit session when the stream is live again", () => {
    const initial = [
        {
            id: "s-500",
            startedAt: 500,
            endedAt: 900,
            endReason: "app-quit",
            providers: { kick: true, twitch: false },
            entries: [
                {
                    id: "q-1",
                    title: "Played",
                    artist: "Artist",
                    requester: "viewer",
                    platform: "kick",
                    acceptedAt: 600,
                    position: 1,
                    artworkUrl: "https://example.test/1.jpg",
                    outcome: "played",
                    playedAt: 700,
                },
                {
                    id: "q-2",
                    title: "Pending",
                    artist: "Artist",
                    requester: "viewer",
                    platform: "kick",
                    acceptedAt: 800,
                    position: 2,
                    artworkUrl: "https://example.test/2.jpg",
                    outcome: "unplayed",
                    playedAt: null,
                },
            ],
        },
    ];
    const harness = createHarness({
        initialSessions: initial,
        start: 1000,
        resumeWindowMs: 1000,
    });
    assert.equal(harness.manager.getActive(), null);

    harness.manager.noteLiveStatus("kick", true, true);

    const active = harness.manager.getActive();
    assert.ok(active);
    assert.equal(active.id, "s-500");
    assert.equal(active.startedAt, 500);
    assert.equal(active.endedAt, null);
    assert.equal(active.endReason, null);
    assert.equal(active.entries.length, 2);
    assert.equal(harness.manager.getHistory().length, 1);

    const queue = harness.queue.snapshot();
    assert.equal(queue.length, 1);
    assert.equal(queue[0].id, "q-2");
    assert.equal(queue[0].title, "Pending");
});

test("does not resume an app-quit session outside the resume window", () => {
    const initial = [
        {
            id: "s-500",
            startedAt: 500,
            endedAt: 600,
            endReason: "app-quit",
            providers: { kick: true, twitch: false },
            entries: [],
        },
    ];
    const harness = createHarness({
        initialSessions: initial,
        start: 5000,
        resumeWindowMs: 1000,
    });

    harness.manager.noteLiveStatus("kick", true, true);

    const active = harness.manager.getActive();
    assert.ok(active);
    assert.equal(active.id, "s-5000");
    assert.equal(harness.manager.getHistory().length, 2);
});

test("resumes a crash-left active session on the next live check", () => {
    const initial = [
        {
            id: "s-500",
            startedAt: 500,
            endedAt: null,
            endReason: null,
            providers: { kick: true, twitch: false },
            entries: [],
        },
    ];
    const harness = createHarness({
        initialSessions: initial,
        start: 1000,
    });

    harness.manager.noteLiveStatus("kick", true, true);

    const active = harness.manager.getActive();
    assert.ok(active);
    assert.equal(active.id, "s-500");
    assert.equal(active.endedAt, null);
});

test("ends a crash-left session as interrupted when the provider is offline", () => {
    const initial = [
        {
            id: "s-500",
            startedAt: 500,
            endedAt: null,
            endReason: null,
            providers: { kick: true, twitch: false },
            entries: [],
        },
    ];
    const harness = createHarness({
        initialSessions: initial,
        start: 1000,
    });

    harness.manager.noteLiveStatus("kick", false, true);

    assert.equal(harness.manager.getActive(), null);
    const history = harness.manager.getHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0].id, "s-500");
    assert.equal(history[0].endedAt, 1000);
    assert.equal(history[0].endReason, "interrupted");
});

test("an unknown check during grace does not cancel the pending end", async () => {
    const harness = createHarness({ graceMs: 30 });
    harness.manager.noteLiveStatus("kick", true, true);
    harness.manager.noteLiveStatus("kick", false, true);
    harness.manager.noteLiveStatus("kick", null, true);

    await sleep(60);

    assert.equal(harness.manager.getActive(), null);
    const history = harness.manager.getHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0].endReason, "offline");
});

test("resumes when one provider is offline and the other is live in the same poll", () => {
    const initial = [
        {
            id: "s-500",
            startedAt: 500,
            endedAt: null,
            endReason: null,
            providers: { kick: true, twitch: true },
            entries: [],
        },
    ];
    const harness = createHarness({
        initialSessions: initial,
        start: 1000,
    });

    harness.manager.noteLiveStatuses([
        { platform: "kick", live: false, configured: true },
        { platform: "twitch", live: true, configured: true },
    ]);

    const active = harness.manager.getActive();
    assert.ok(active);
    assert.equal(active.id, "s-500");
    assert.equal(active.endedAt, null);
    assert.equal(active.providers.twitch, true);
});
