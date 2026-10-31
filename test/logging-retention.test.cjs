"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const en = require("../src/core/i18n/locales/en.json");
const tr = require("../src/core/i18n/locales/tr.json");
const loggingSource = fs.readFileSync(
    path.join(root, "src/core/logging/index.ts"),
    "utf8"
);
const logsViewSource = fs.readFileSync(
    path.join(root, "src/features/settings/components/sections/Logs.tsx"),
    "utf8"
);

test("Logs copy describes startup-only 30-day cleanup and no Clear action", () => {
    assert.match(
        en.logs.logsRetentionNotice,
        /older than 30 days are removed when Melodify starts/i
    );
    assert.match(en.logs.logsRetentionNotice, /no Clear action/i);
    assert.doesNotMatch(
        en.logs.logsRetentionNotice,
        /automatically cleaned after 30 days|clear to remove/i
    );

    assert.match(tr.logs.logsRetentionNotice, /Melodify başlarken silinir/i);
    assert.match(tr.logs.logsRetentionNotice, /Temizle işlemi yoktur/i);
    assert.doesNotMatch(tr.logs.logsRetentionNotice, /30 gün sonra silinir/i);

    assert.doesNotMatch(logsViewSource, /t\(\s*["']logs\.clear["']/);
    assert.doesNotMatch(logsViewSource, />\s*Clear\s*</i);
});

test("the logging implementation runs cleanup at startup and does not claim a rolling schedule", () => {
    assert.match(loggingSource, /cleanupOldLogs\(\);/);
    assert.doesNotMatch(
        loggingSource,
        /setInterval\s*\(\s*cleanupOldLogs|scheduleCleanup|rollingRetention/i
    );
    assert.match(loggingSource, /initializeSessionLog\(\);\s*cleanupOldLogs\(\);/);
});
