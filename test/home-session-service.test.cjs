"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;

function loadHomeSession(playerStub) {
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
        if (request === "@/features/spotify/playback/player") {
            return playerStub;
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        const resolved = require.resolve(
            path.join(root, "src/features/home/homeSession.ts")
        );
        delete require.cache[resolved];
        return require(resolved);
    } finally {
        Module._resolveFilename = originalResolve;
        Module._load = originalLoad;
    }
}

function makePlayer() {
    let listener = null;
    let current = {
        status: "loading",
        track: null,
        error: null,
        updatedAt: 0,
    };
    return {
        getCurrentPlaybackSnapshot: () => current,
        subscribeCurrentPlayback(fn) {
            listener = fn;
            return () => {
                listener = null;
            };
        },
        startCurrentPlaybackPolling() {},
        setCurrent(next) {
            current = next;
            listener?.(next);
        },
    };
}

test("main Home session publishes safe playback and removes the started queue entry", () => {
    const player = makePlayer();
    const { homeQueue } = require("../src/features/home/homeQueue");
    const sessionModule = loadHomeSession(player);
    homeQueue.reset();

    try {
        homeQueue.add({
            title: "First",
            artist: "Artist A",
            requester: "viewer-a",
            platform: "kick",
            acceptedAt: 1000,
        });
        homeQueue.add({
            title: "Second",
            artist: "Artist B",
            requester: "viewer-b",
            platform: "twitch",
            acceptedAt: 2000,
        });

        sessionModule.initializeHomeSession();
        const seen = [];
        const unsubscribe = sessionModule.subscribeHomeSession((snapshot) =>
            seen.push(snapshot)
        );
        assert.equal(seen.length, 1);
        assert.equal(seen[0].queue.length, 2);

        player.setCurrent({
            status: "playing",
            track: {
                title: "First",
                artist: "Artist A",
                artists: ["Artist A"],
                artworkUrl: "https://images.example/first.jpg",
            },
            error: null,
            updatedAt: 3000,
        });

        const latest = sessionModule.getHomeSessionSnapshot();
        assert.equal(latest.current.status, "playing");
        assert.equal(latest.current.title, "First");
        assert.deepEqual(
            latest.queue.map((entry) => ({
                id: entry.id,
                position: entry.position,
            })),
            [{ id: latest.queue[0].id, position: 1 }]
        );
        assert.equal(latest.queue[0].title, "Second");
        assert.doesNotMatch(
            JSON.stringify(latest),
            /accessToken|refreshToken|spotifyAccessToken/
        );
        unsubscribe();
        assert.equal(seen.length >= 2, true);
    } finally {
        sessionModule.resetHomeSession();
        homeQueue.reset();
    }
});
