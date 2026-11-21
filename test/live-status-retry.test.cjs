"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    readLiveStatusWithRetry,
} = require("../src/features/home/liveStatusRetry.ts");

test("returns the first confirmed status without extra checks", async () => {
    let calls = 0;
    const result = await readLiveStatusWithRetry(
        async () => {
            calls += 1;
            return true;
        },
        { sleep: async () => {} }
    );

    assert.equal(result, true);
    assert.equal(calls, 1);
});

test("retries null and thrown checks before returning a status", async () => {
    let attempt = 0;
    const delays = [];
    const result = await readLiveStatusWithRetry(
        async () => {
            attempt += 1;
            if (attempt === 1) return null;
            if (attempt === 2) throw new Error("provider unavailable");
            return false;
        },
        {
            attempts: 3,
            delaysMs: [5, 10],
            sleep: async (ms) => {
                delays.push(ms);
            },
        }
    );

    assert.equal(result, false);
    assert.equal(attempt, 3);
    assert.deepEqual(delays, [5, 10]);
});

test("returns null after exhausting attempts", async () => {
    let calls = 0;
    const result = await readLiveStatusWithRetry(
        async () => {
            calls += 1;
            return null;
        },
        {
            attempts: 2,
            delaysMs: [1],
            sleep: async () => {},
        }
    );

    assert.equal(result, null);
    assert.equal(calls, 2);
});
