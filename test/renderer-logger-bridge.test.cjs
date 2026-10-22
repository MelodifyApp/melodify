"use strict";

/**
 * The renderer logger must reuse the approved renderer->main log channels.
 * It previously sent "log:renderer", which has no handler and is not in
 * SEND_CHANNELS, so the preload bridge blocked every forwarded log line.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

function load(stubs, relativePath) {
    const originalLoad = Module._load;
    try {
        Module._load = function (request, parent, isMain) {
            if (Object.prototype.hasOwnProperty.call(stubs, request)) {
                return stubs[request];
            }
            return originalLoad.call(this, request, parent, isMain);
        };
        const resolved = require.resolve(path.join(__dirname, "..", relativePath));
        delete require.cache[resolved];
        return require(resolved);
    } finally {
        Module._load = originalLoad;
    }
}

function loadLogger() {
    const calls = [];
    const logger = load(
        {
            "@/core/logging/utils": {
                redactLogText: (value) => value,
            },
        },
        "src/renderer/rendererLogger.ts"
    );
    global.window = {
        electronAPI: {
            send: (channel, payload) => calls.push([channel, payload]),
        },
    };
    // Silence the intentional console output of the logger under test.
    const original = {
        log: console.log,
        warn: console.warn,
        error: console.error,
    };
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
    return {
        logger,
        calls,
        restore(consoleRef = console) {
            consoleRef.log = original.log;
            consoleRef.warn = original.warn;
            consoleRef.error = original.error;
            delete global.window;
        },
    };
}

test("renderer logs use the approved log channels with a meta context", (t) => {
    const h = loadLogger();
    t.after(() => h.restore());

    h.logger.logInfo("hello", "ctx");
    h.logger.logDebug("dbg");
    h.logger.logWarn("careful", "w");
    h.logger.logError(new Error("boom"), "e");

    assert.deepEqual(h.calls, [
        ["log:info", { message: "hello", meta: { context: "ctx" } }],
        ["log:debug", { message: "dbg", meta: undefined }],
        ["log:warn", { message: "careful", meta: { context: "w" } }],
        ["log:error", { message: "boom", meta: { context: "e" } }],
    ]);
    assert.equal(
        h.calls.some(([channel]) => channel === "log:renderer"),
        false,
        "the retired log:renderer channel must not be used"
    );
});

test("renderer logger degrades gracefully without the bridge", (t) => {
    const h = loadLogger();
    t.after(() => h.restore());

    delete global.window.electronAPI;
    assert.doesNotThrow(() => h.logger.logInfo("no bridge"));
    assert.deepEqual(h.calls, []);
});
