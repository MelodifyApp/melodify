"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

const SONG_REQUESTS_DIR = "song-requests";
let caseNumber = 0;

class FakeFs {
    constructor() {
        this.files = new Map();
        this.directories = new Set();
        this.failWrite = null;
        this.failRename = false;
    }

    list(directory) {
        const target = path.resolve(directory);
        const names = new Set();
        for (const filePath of this.files.keys()) {
            if (path.dirname(filePath) === target) names.add(path.basename(filePath));
        }
        for (const directoryPath of this.directories) {
            if (path.dirname(directoryPath) === target) {
                names.add(path.basename(directoryPath));
            }
        }
        return [...names];
    }

    existsSync(target) {
        const normalized = path.resolve(target);
        return this.files.has(normalized) || this.directories.has(normalized);
    }

    mkdirSync(target) {
        let current = path.resolve(target);
        while (current && !this.directories.has(current)) {
            this.directories.add(current);
            const parent = path.dirname(current);
            if (parent === current) break;
            current = parent;
        }
    }

    readFileSync(target) {
        const normalized = path.resolve(target);
        if (!this.files.has(normalized)) {
            throw new Error(`ENOENT: ${normalized}`);
        }
        return this.files.get(normalized);
    }

    writeFileSync(target, data) {
        const normalized = path.resolve(target);
        if (this.failWrite && this.failWrite(normalized)) {
            this.failWrite = null;
            throw new Error("simulated partial write");
        }
        this.files.set(normalized, String(data));
    }

    appendFileSync(target, data) {
        const normalized = path.resolve(target);
        this.files.set(
            normalized,
            (this.files.get(normalized) || "") + String(data)
        );
    }

    renameSync(from, to) {
        const source = path.resolve(from);
        const destination = path.resolve(to);
        if (this.failRename) throw new Error("simulated quarantine failure");
        if (!this.files.has(source)) throw new Error(`ENOENT: ${source}`);
        this.files.set(destination, this.files.get(source));
        this.files.delete(source);
    }

    copyFileSync(from, to) {
        const source = path.resolve(from);
        if (!this.files.has(source)) throw new Error(`ENOENT: ${source}`);
        this.files.set(path.resolve(to), this.files.get(source));
    }

    unlinkSync(target) {
        const normalized = path.resolve(target);
        if (!this.files.has(normalized)) throw new Error(`ENOENT: ${normalized}`);
        this.files.delete(normalized);
    }

    readdirSync(target) {
        return this.list(target);
    }

    statSync(target) {
        const normalized = path.resolve(target);
        if (this.files.has(normalized)) {
            return { isFile: () => true, mtime: new Date() };
        }
        if (this.directories.has(normalized)) {
            return { isFile: () => false, mtime: new Date() };
        }
        throw new Error(`ENOENT: ${normalized}`);
    }
}

function withHarness(callback) {
    caseNumber += 1;
    const userData = path.resolve(
        `C:\\fake-melodify-history-${caseNumber}`
    );
    const fakeFs = new FakeFs();
    const handlers = new Map();
    const loggerPath = require.resolve("../src/core/logging");
    const originalLoad = Module._load;
    const originalLog = console.log;
    const originalError = console.error;
    let logger;
    try {
        console.log = () => {};
        console.error = () => {};
        Module._load = function (request, parent, isMain) {
            if (request === "electron") {
                return {
                    app: {
                        getPath: () => userData,
                        getVersion: () => "test",
                    },
                    BrowserWindow: { getAllWindows: () => [] },
                    ipcMain: {
                        handle(channel, handler) {
                            handlers.set(channel, handler);
                        },
                    },
                };
            }
            if (request === "fs") {
                return { __esModule: true, default: fakeFs };
            }
            if (request === "@/core/config/userDataDirectory") {
                return {
                    resolveUserDataDirectory: (directory) => directory,
                };
            }
            if (request === "@/shared/utils/windowSend") {
                return { sendToWindowIfAlive: () => true };
            }
            return originalLoad.call(this, request, parent, isMain);
        };
        delete require.cache[loggerPath];
        logger = require(loggerPath);
    } finally {
        Module._load = originalLoad;
        console.log = originalLog;
        console.error = originalError;
    }

    const today = new Date().toISOString().split("T")[0];
    const logsDirectory = path.join(userData, "logs");
    const logFile = fakeFs
        .list(logsDirectory)
        .find((name) => name.endsWith(".log"));
    assert.ok(logFile, "the logger must create a session log");
    const sessionId = logFile.slice(logFile.indexOf("session_"), -4);
    const songDirectory = path.join(userData, SONG_REQUESTS_DIR);
    const sessionPath = path.join(
        songDirectory,
        `${today}_${sessionId}.json`
    );
    const dailyPath = path.join(songDirectory, `${today}_daily.json`);
    const logEntries = () => handlers.get("log:getAll")?.() || [];

    try {
        console.log = () => {};
        console.error = () => {};
        return callback({
            fakeFs,
            logger,
            today,
            songDirectory,
            sessionPath,
            dailyPath,
            logEntries,
            files: () => [...fakeFs.files.keys()],
            corruptFiles: () =>
                [...fakeFs.files.keys()].filter((filePath) =>
                    path.basename(filePath).includes(".corrupt-")
                ),
        });
    } finally {
        console.log = originalLog;
        console.error = originalError;
        delete require.cache[loggerPath];
    }
}

test("a corrupt session history is quarantined and later writes continue", () => {
    withHarness((h) => {
        h.fakeFs.files.set(h.sessionPath, '{"truncated":');
        h.logger.logSongRequest("First", "Artist", "viewer");
        h.logger.logSongRequest("Second", "Artist", "viewer");

        assert.deepEqual(
            h.logger.getSongRequestsForSession().map((entry) => entry.title),
            ["First", "Second"]
        );
        assert.deepEqual(
            h.logger.getSongRequestsForDate(h.today).map((entry) => entry.title),
            ["First", "Second"]
        );
        const quarantined = h.corruptFiles();
        assert.equal(quarantined.length, 1);
        assert.equal(
            h.fakeFs.readFileSync(quarantined[0]),
            '{"truncated":'
        );
        assert.ok(
            h.logEntries().some((entry) =>
                /Quarantined corrupt session history/.test(entry.message)
            )
        );
    });
});

test("a corrupt daily history does not block the session or later daily writes", () => {
    withHarness((h) => {
        h.fakeFs.files.set(h.dailyPath, "[not-json");
        h.logger.logSongRequest("One", "Artist", "viewer");
        h.logger.logSongRequest("Two", "Artist", "viewer");

        assert.equal(h.logger.getSongRequestsForSession().length, 2);
        assert.deepEqual(
            h.logger.getSongRequestsForDate(h.today).map((entry) => entry.title),
            ["One", "Two"]
        );
        const quarantined = h.corruptFiles();
        assert.equal(quarantined.length, 1);
        assert.equal(h.fakeFs.readFileSync(quarantined[0]), "[not-json");
        assert.ok(
            h.logEntries().some((entry) =>
                /Quarantined corrupt daily history/.test(entry.message)
            )
        );
    });
});

test("both corrupt files recover independently and repeated writes stay readable", () => {
    withHarness((h) => {
        h.fakeFs.files.set(h.sessionPath, "{");
        h.fakeFs.files.set(h.dailyPath, "not json");
        h.logger.logSongRequest("A", "Artist", "viewer");
        h.logger.logSongRequest("B", "Artist", "viewer");
        h.logger.logSongRequest("C", "Artist", "viewer");

        const session = h.logger.getSongRequestsForSession();
        const daily = h.logger.getSongRequestsForDate(h.today);
        assert.deepEqual(session.map((entry) => entry.title), ["A", "B", "C"]);
        assert.deepEqual(daily.map((entry) => entry.title), ["A", "B", "C"]);
        assert.equal(h.corruptFiles().length, 2);
        assert.equal(
            h.files().some((filePath) => filePath.includes(".tmp-")),
            false
        );
    });
});

test("a normal history write path remains unchanged and leaves no temp files", () => {
    withHarness((h) => {
        h.logger.logSongRequest("Normal", "Artist", "viewer");
        h.logger.logSongRequest("Again", "Artist", "viewer");

        assert.deepEqual(
            h.logger.getSongRequestsForSession().map((entry) => entry.title),
            ["Normal", "Again"]
        );
        assert.deepEqual(
            h.logger.getSongRequestsForDate(h.today).map((entry) => entry.title),
            ["Normal", "Again"]
        );
        assert.equal(h.corruptFiles().length, 0);
        assert.equal(
            h.files().some((filePath) => filePath.includes(".tmp-")),
            false
        );
    });
});

test("a failed atomic session write leaves the previous history readable and retryable", () => {
    withHarness((h) => {
        h.logger.logSongRequest("Before", "Artist", "viewer");
        h.fakeFs.failWrite = (filePath) =>
            filePath.startsWith(h.sessionPath) &&
            filePath.includes(".tmp-");
        h.logger.logSongRequest("During", "Artist", "viewer");

        assert.deepEqual(
            h.logger.getSongRequestsForSession().map((entry) => entry.title),
            ["Before"],
            "a failed temp write must not replace the valid session file"
        );
        assert.deepEqual(
            h.logger.getSongRequestsForDate(h.today).map((entry) => entry.title),
            ["Before", "During"],
            "the daily write remains independent"
        );

        h.logger.logSongRequest("After", "Artist", "viewer");
        assert.deepEqual(
            h.logger.getSongRequestsForSession().map((entry) => entry.title),
            ["Before", "After"]
        );
        assert.equal(
            h.files().some((filePath) => filePath.includes(".tmp-")),
            false
        );
    });
});
