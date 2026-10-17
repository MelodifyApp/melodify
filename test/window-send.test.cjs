"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { sendToWindowIfAlive } = require("../src/features/kick/chat/windowSend");

test("does not send to a destroyed BrowserWindow", () => {
    let sends = 0;
    const window = {
        isDestroyed: () => true,
        get webContents() {
            throw new Error("Object has been destroyed");
        },
    };

    assert.equal(sendToWindowIfAlive(window, "kick:chatDisconnected"), false);
    assert.equal(sends, 0);
});

test("does not send through destroyed webContents", () => {
    let sends = 0;
    const window = {
        isDestroyed: () => false,
        webContents: {
            isDestroyed: () => true,
            send: () => { sends += 1; },
        },
    };

    assert.equal(sendToWindowIfAlive(window, "kick:chatDisconnected"), false);
    assert.equal(sends, 0);
});

test("sends the expected event once to a live window", () => {
    const sent = [];
    const window = {
        isDestroyed: () => false,
        webContents: {
            isDestroyed: () => false,
            send: (...args) => sent.push(args),
        },
    };

    assert.equal(sendToWindowIfAlive(window, "kick:chatDisconnected", "reason"), true);
    assert.deepEqual(sent, [["kick:chatDisconnected", "reason"]]);
});

test("contains a close-time error from webContents.send", () => {
    const window = {
        isDestroyed: () => false,
        webContents: {
            isDestroyed: () => false,
            send: () => { throw new Error("Object has been destroyed"); },
        },
    };

    assert.doesNotThrow(() => sendToWindowIfAlive(window, "kick:chatDisconnected"));
    assert.equal(sendToWindowIfAlive(window, "kick:chatDisconnected"), false);
});
