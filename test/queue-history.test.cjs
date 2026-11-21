"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
    return originalResolve.call(
        this,
        request.startsWith("@/")
            ? path.join(root, "src", request.slice(2))
            : request,
        ...args
    );
};
const {
    createQueueHistoryPersistence,
} = require("../src/features/home/queueHistory.ts");
Module._resolveFilename = originalResolve;

function createFile() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "melodify-queue-history-"));
    return { dir, file: path.join(dir, "queue-history.json") };
}

function entry(overrides = {}) {
    return {
        id: "q-1",
        title: "Song",
        artist: "Artist",
        requester: "viewer",
        platform: "kick",
        acceptedAt: Date.now() - 500,
        position: 1,
        outcome: "played",
        playedAt: Date.now() - 100,
        ...overrides,
    };
}

function session(overrides = {}) {
    const now = Date.now();
    return {
        id: "s-1",
        startedAt: now - 1000,
        endedAt: now,
        endReason: "offline",
        providers: { kick: true, twitch: false },
        entries: [entry()],
        ...overrides,
    };
}

test("persists sessions and strips artwork and unknown fields", () => {
    const { dir, file } = createFile();
    try {
        const persistence = createQueueHistoryPersistence(file);
        persistence.save([
            session({
                entries: [
                    entry({
                        artworkUrl: "https://example.test/art.jpg",
                        messageBody: "hidden chat body",
                        userId: "provider-user",
                        ip: "192.0.2.1",
                        token: "secret-token",
                    }),
                ],
            }),
        ]);

        const loaded = persistence.load();
        assert.equal(loaded.length, 1);
        assert.equal(loaded[0].entries.length, 1);
        assert.equal(loaded[0].entries[0].title, "Song");
        assert.equal(loaded[0].entries[0].artworkUrl, undefined);
        assert.equal(loaded[0].entries[0].messageBody, undefined);
        assert.equal(loaded[0].entries[0].userId, undefined);
        assert.equal(loaded[0].entries[0].ip, undefined);
        assert.equal(loaded[0].entries[0].token, undefined);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("retains 90 days and keeps the active session even when it is oldest", () => {
    const { dir, file } = createFile();
    try {
        const persistence = createQueueHistoryPersistence(file);
        const now = Date.now();
        const sessions = [
            session({
                id: "active",
                startedAt: now - 120 * 24 * 60 * 60 * 1000,
                endedAt: null,
                endReason: null,
            }),
        ];
        for (let index = 0; index < 60; index += 1) {
            sessions.push(
                session({
                    id: `ended-${index}`,
                    startedAt: now - (60 - index) * 1000,
                    endedAt: now - (60 - index) * 1000 + 500,
                })
            );
        }
        sessions.push(
            session({
                id: "expired",
                startedAt: now - 91 * 24 * 60 * 60 * 1000,
                endedAt: now - 91 * 24 * 60 * 60 * 1000 + 500,
            })
        );
        persistence.save(sessions);

        const loaded = persistence.load();
        assert.equal(loaded.length, 50);
        assert.ok(loaded.some((item) => item.id === "active"));
        assert.equal(loaded.some((item) => item.id === "expired"), false);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("quarantines an unreadable history file", () => {
    const { dir, file } = createFile();
    try {
        fs.writeFileSync(file, "{not-json", "utf8");
        const persistence = createQueueHistoryPersistence(file);
        assert.deepEqual(persistence.load(), []);
        const names = fs.readdirSync(dir);
        assert.equal(names.some((name) => name.includes(".corrupt-")), true);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
