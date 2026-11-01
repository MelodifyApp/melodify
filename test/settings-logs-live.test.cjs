"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
const originalCss = require.extensions[".css"];

function loadComponent(relativePath) {
    const originalLoad = Module._load;
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
        if (request === "react-i18next") {
            return {
                useTranslation: () => ({
                    t: (key, options) =>
                        options && options.count !== undefined
                            ? `${key} (${options.count})`
                            : key,
                }),
            };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    require.extensions[".css"] = () => {};
    try {
        const resolved = require.resolve(path.join(root, relativePath));
        delete require.cache[resolved];
        return require(resolved).default;
    } finally {
        Module._resolveFilename = originalResolve;
        Module._load = originalLoad;
        if (originalCss) require.extensions[".css"] = originalCss;
        else delete require.extensions[".css"];
    }
}

function readSource(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("log feed merges live entries with hydration without duplicates and stays bounded", () => {
    const feed = require("../src/features/settings/components/logFeed");
    const first = {
        level: "info",
        message: "first entry",
        timestamp: 1000,
        session: "session",
    };
    const live = {
        level: "warn",
        message: "new entry while open",
        timestamp: 2000,
        session: "session",
    };

    let logs = feed.mergeLogEntries([], [first]);
    logs = feed.mergeLogEntries(logs, [live]);
    assert.deepEqual(logs, [first, live]);

    // Hydration can arrive after the live event and include the same entry.
    logs = feed.mergeLogEntries([first, live], logs);
    assert.deepEqual(logs, [first, live]);

    const many = Array.from(
        { length: feed.MAX_LOG_ENTRIES + 5 },
        (_value, index) => ({
            level: "info",
            message: `entry ${index}`,
            timestamp: index,
            session: "session",
        })
    );
    const bounded = feed.mergeLogEntries([], many);
    assert.equal(bounded.length, feed.MAX_LOG_ENTRIES);
    assert.equal(bounded[0].message, "entry 5");
    assert.equal(
        bounded[bounded.length - 1].message,
        `entry ${feed.MAX_LOG_ENTRIES + 4}`
    );
});

test("a live entry is rendered and exported after the snapshot opens", () => {
    const feed = require("../src/features/settings/components/logFeed");
    const { formatLogsForExport } = require("../src/core/logging/export");
    const Logs = loadComponent(
        "src/features/settings/components/sections/Logs.tsx"
    );
    const first = {
        level: "info",
        message: "snapshot entry",
        timestamp: 1000,
        session: "session",
    };
    const live = {
        level: "warn",
        message: "live entry after open",
        timestamp: 2000,
        session: "session",
    };
    const logs = feed.mergeLogEntries([first], [live]);
    const html = renderToStaticMarkup(
        React.createElement(Logs, { logs })
    );
    assert.match(html, /snapshot entry/);
    assert.match(html, /live entry after open/);
    assert.match(html, /logs\.all \(2\)/);

    const exported = formatLogsForExport(logs);
    assert.match(exported, /snapshot entry/);
    assert.match(exported, /live entry after open/);
});

test("Settings subscribes before hydrating and removes the live listener", () => {
    const source = readSource("src/features/settings/components/Settings.tsx");
    const subscription = source.indexOf('on("log:entry"');
    const hydration = source.indexOf('invoke("log:getAll")');
    assert.ok(subscription >= 0, "expected a log:entry subscription");
    assert.ok(hydration >= 0, "expected log:getAll hydration");
    assert.ok(
        subscription < hydration,
        "the listener must be active before hydration starts"
    );
    assert.match(source, /mergeLogEntries/);
    assert.match(source, /removeListener\(\s*"log:entry"/);
});
