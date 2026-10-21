"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { redactSecrets, redactLogText } = require("../src/core/logging/utils");

test("redacts snake_case credentials, callback codes and headers recursively without mutating input", () => {
    const input = {
        code_verifier: "verifier-sensitive",
        access_token: "access-sensitive", refresh_token: "refresh-sensitive",
        headers: { Authorization: "Bearer header-sensitive", Cookie: "cookie-sensitive" },
        nested: [{ twitchClientSecret: "client-sensitive", statusCode: 401, message: "Refresh rejected" }],
    };
    const result = redactSecrets(input);
    assert.equal(result.code_verifier, "[REDACTED]");
    assert.equal(result.access_token, "[REDACTED]");
    assert.equal(result.refresh_token, "[REDACTED]");
    assert.equal(result.headers.Authorization, "[REDACTED]");
    assert.equal(result.headers.Cookie, "[REDACTED]");
    assert.equal(result.nested[0].twitchClientSecret, "[REDACTED]");
    assert.equal(result.nested[0].statusCode, 401);
    assert.equal(input.code_verifier, "verifier-sensitive");
});

test("preserves non-credential diagnostics: session ids, error codes and state", () => {
    const input = {
        sessionId: "session_2026",
        code: "ECONNREFUSED",
        state: "running",
        statusCode: 401,
        message: "failed with code=ECONNREFUSED while state=running",
        session: "actual-session-token",
    };
    const result = redactSecrets(input);
    assert.equal(result.sessionId, "session_2026");
    assert.equal(result.code, "ECONNREFUSED");
    assert.equal(result.state, "running");
    assert.equal(result.statusCode, 401);
    assert.match(result.message, /ECONNREFUSED/);
    assert.equal(result.session, "[REDACTED]");
    assert.equal(redactSecrets('{"code":"ECONNREFUSED","state":"running"}'), '{"code":"ECONNREFUSED","state":"running"}');
});

test("boolean credential flags stay visible while credential values are masked", () => {
    const result = redactSecrets({
        hasClientSecret: false,
        hasAccessToken: true,
        clientSecret: "actual-client-secret",
        accessToken: "actual-access-token",
        nested: { hasRefreshToken: false, refreshToken: "actual-refresh-token" },
    });
    assert.equal(result.hasClientSecret, false);
    assert.equal(result.hasAccessToken, true);
    assert.equal(result.clientSecret, "[REDACTED]");
    assert.equal(result.accessToken, "[REDACTED]");
    assert.equal(result.nested.hasRefreshToken, false);
    assert.equal(result.nested.refreshToken, "[REDACTED]");
});

test("serialized boolean credential flags remain readable in logs and JSON", () => {
    const text =
        'hasClientSecret=false hasAccessToken=true "hasRefreshToken": false, "clientSecret":"actual-secret"';
    const result = redactLogText(text);
    assert.match(result, /hasClientSecret=false/);
    assert.match(result, /hasAccessToken=true/);
    assert.match(result, /"hasRefreshToken": false/);
    assert.doesNotMatch(result, /actual-secret/);

    const urlResult = redactLogText(
        "callback?hasClientSecret=false&code=callback-code"
    );
    assert.match(urlResult, /hasClientSecret=false/);
    assert.doesNotMatch(urlResult, /callback-code/);
});

test("boolean-looking credential strings and direct credential flags stay redacted", () => {
    assert.equal(
        redactLogText('{"clientSecret":"true"}'),
        '{"clientSecret":"[REDACTED]"}'
    );
    assert.equal(
        redactLogText('{"refreshToken":"false"}'),
        '{"refreshToken":"[REDACTED]"}'
    );
    assert.equal(
        redactLogText('{"hasClientSecret": false}'),
        '{"hasClientSecret": false}'
    );
    assert.equal(
        redactLogText("callback?clientSecret=false&hasClientSecret=false"),
        "callback?clientSecret=[REDACTED]&hasClientSecret=false"
    );

    const metadata = redactSecrets({
        clientSecret: false,
        hasClientSecret: false,
    });
    assert.equal(metadata.clientSecret, "[REDACTED]");
    assert.equal(metadata.hasClientSecret, false);
});

test("still masks OAuth code, state and credentials in callback URLs and query strings", () => {
    for (const text of [
        "http://127.0.0.1:8888/callback?code=url-sensitive&state=nonce-sensitive#fragment",
        "&code=amp-sensitive",
        "?%63ode=encoded-sensitive",
    ]) {
        const result = redactSecrets(text);
        assert.doesNotMatch(result, /sensitive/);
        assert.match(result, /REDACTED/);
    }
});

for (const text of [
    'Token response: {"access_token":"access-sensitive","refresh_token":"refresh-sensitive"}',
    'Request failed: Authorization: Bearer header-sensitive',
    'Request failed: Authorization: Basic basic-sensitive',
    'OAuth oauth-sensitive',
    'http://127.0.0.1:8888/callback?code=callback-sensitive&state=state-sensitive&error=access_denied',
    'https://example.test/?%61ccess_token=encoded-sensitive&client_secret=secret-sensitive',
    'client_secret=plain-sensitive&refresh_token=refresh-sensitive',
]) {
    test(`sanitizes credential-bearing log text: ${text.split(":")[0]}`, () => {
        const result = redactSecrets(text);
        assert.doesNotMatch(result, /[a-z]+-sensitive/);
        assert.match(result, /REDACTED/);
        if (text.includes("access_denied")) assert.match(result, /access_denied/);
    });
}

test("cycles and Error objects are handled safely", () => {
    const input = { error: new Error("refresh_token=error-sensitive") };
    input.self = input;
    const result = JSON.stringify(redactSecrets(input));
    assert.doesNotMatch(result, /error-sensitive/);
    assert.match(result, /REDACTED/);
});

test("prose after an auth scheme is not treated as a credential", () => {
    assert.equal(
        redactSecrets("No Kick OAuth tokens; guest chat reading is independent and stays as-is"),
        "No Kick OAuth tokens; guest chat reading is independent and stays as-is"
    );
    assert.equal(redactSecrets("OAuth flow is ready"), "OAuth flow is ready");
    assert.equal(redactSecrets("Bearer short"), "Bearer short");
});

test("log export also sanitizes entries that did not pass through the logger", () => {
    const { formatLogsForExport } = require("../src/core/logging/export");
    const result = formatLogsForExport([
        { level: "error", timestamp: 0, message: 'Token: {"access_token":"export-sensitive"}' },
        { level: "info", timestamp: 0, access_token: "fallback-sensitive" },
    ]);
    assert.doesNotMatch(result, /export-sensitive|fallback-sensitive/);
    assert.match(result, /1970-01-01/);
});

test("central logger masks data before disk, console, renderer events and log retrieval", () => {
    const Module = require("node:module");
    const captured = { disk: [], console: [], errors: [], events: [] };
    const handlers = new Map();
    const originalLoad = Module._load;
    const originalConsole = console.log;
    const originalConsoleError = console.error;
    const logDirectories = new Set();
    try {
        console.log = (...args) => captured.console.push(args);
        console.error = (...args) => captured.errors.push(args);
        Module._load = function (request, parent, isMain) {
            if (request === "electron") return {
                app: { getPath: () => "C:\\fake-logging-profile", getVersion: () => "test" },
                BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, webContents: { isDestroyed: () => false, send: (...args) => captured.events.push(args) } }] },
                ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
            };
            if (request === "fs") return { __esModule: true, default: {
                existsSync: (directory) => logDirectories.has(directory),
                mkdirSync: (directory) => logDirectories.add(directory),
                readdirSync: () => [],
                appendFileSync: (filePath, text) => {
                    const directory = require("node:path").dirname(filePath);
                    if (!logDirectories.has(directory)) {
                        const error = new Error("ENOENT: log directory missing");
                        error.code = "ENOENT";
                        throw error;
                    }
                    captured.disk.push(text);
                },
            } };
            if (request === "@/core/config/userDataDirectory") return { resolveUserDataDirectory: (path) => path };
            if (request === "@/shared/utils/windowSend") return require("../src/shared/utils/windowSend");
            return originalLoad.call(this, request, parent, isMain);
        };
        const logger = require("../src/core/logging");
        logger.logInfo("Callback?code=disk-sensitive", { access_token: "meta-sensitive" });
        logger.logError(new Error("Bearer error-sensitive"), "auth");
        logger.logError({ client_secret: "object-sensitive", statusCode: 400 }, "auth");
        captured.retrieved = handlers.get("log:getAll")();
    } finally { Module._load = originalLoad; console.log = originalConsole; console.error = originalConsoleError; }
    assert.equal(captured.errors.length, 0, `initial session header should create the log directory first: ${JSON.stringify(captured.errors)}`);
    for (const destination of [captured.disk, captured.console, captured.events, captured.retrieved]) {
        const output = JSON.stringify(destination);
        assert.doesNotMatch(output, /disk-sensitive|meta-sensitive|error-sensitive|object-sensitive/);
        assert.match(output, /REDACTED/);
    }
});

test("renderer logger sanitizes both DevTools and IPC payloads", () => {
    const Module = require("node:module");
    const utils = require("../src/core/logging/utils");
    const originalLoad = Module._load;
    const originalConsole = console.log;
    const originalWindow = global.window;
    const captured = [];
    try {
        global.window = { electronAPI: { send: (...args) => captured.push(args) } };
        console.log = (...args) => captured.push(args);
        Module._load = function (request, parent, isMain) {
            if (request === "@/core/logging/utils") return utils;
            return originalLoad.call(this, request, parent, isMain);
        };
        const logger = require("../src/renderer/rendererLogger");
        logger.logInfo("access_token=renderer-sensitive", "code=context-sensitive");
    } finally { Module._load = originalLoad; console.log = originalConsole; global.window = originalWindow; }
    assert.equal(captured.length, 2);
    assert.doesNotMatch(JSON.stringify(captured), /renderer-sensitive|context-sensitive/);
});

test("sanitization remains stable when main and renderer apply it twice", () => {
    for (const input of ['{"access_token":"sensitive"}', "refresh_token=sensitive", "Bearer sensitive", "http://localhost/?code=sensitive&error=denied"]) {
        assert.equal(redactSecrets(redactSecrets(input)), redactSecrets(input));
    }
});

test("cleanup skips directories and keeps cleaning remaining old log files", () => {
    const Module = require("node:module");
    const path = require("node:path");
    const originalLoad = Module._load;
    const originalConsoleError = console.error;
    const errors = [];
    const logDirectory = "C:\\fake-profile\\logs";
    const songDirectory = "C:\\fake-profile\\song-requests";
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const fresh = new Date();
    const entries = {
        [logDirectory]: ["nested-folder", "old-a.log", "old-b.log", "fresh.log"],
        [songDirectory]: ["song-old.json"],
    };
    const stats = {
        [path.join(logDirectory, "nested-folder")]: { isFile: () => false, mtime: old },
        [path.join(logDirectory, "old-a.log")]: { isFile: () => true, mtime: old },
        [path.join(logDirectory, "old-b.log")]: { isFile: () => true, mtime: old },
        [path.join(logDirectory, "fresh.log")]: { isFile: () => true, mtime: fresh },
        [path.join(songDirectory, "song-old.json")]: { isFile: () => true, mtime: old },
    };
    const unlinked = [];
    try {
        console.error = (...args) => errors.push(args);
        Module._load = function (request, parent, isMain) {
            if (request === "electron") return {
                app: { getPath: () => "C:\\fake-profile", getVersion: () => "test" },
                BrowserWindow: { getAllWindows: () => [] },
                ipcMain: { handle() {} },
            };
            if (request === "fs") return { __esModule: true, default: {
                existsSync: (directory) => Object.prototype.hasOwnProperty.call(entries, directory),
                mkdirSync() {},
                readdirSync: (directory) => entries[directory] ?? [],
                statSync: (filePath) => {
                    const value = stats[filePath];
                    if (!value) throw new Error(`ENOENT: ${filePath}`);
                    return value;
                },
                unlinkSync: (filePath) => {
                    if (!stats[filePath] || !stats[filePath].isFile()) {
                        throw new Error(`refusing to unlink non-file: ${filePath}`);
                    }
                    unlinked.push(filePath);
                },
                appendFileSync() {},
            } };
            if (request === "@/core/config/userDataDirectory") return { resolveUserDataDirectory: (directory) => directory };
            if (request === "@/shared/utils/windowSend") return { sendToWindowIfAlive: () => true };
            return originalLoad.call(this, request, parent, isMain);
        };
        const loggerPath = require.resolve("../src/core/logging");
        delete require.cache[loggerPath];
        require(loggerPath);
    } finally {
        Module._load = originalLoad;
        console.error = originalConsoleError;
    }
    assert.deepEqual(
        [...unlinked].sort(),
        [
            path.join(logDirectory, "old-a.log"),
            path.join(logDirectory, "old-b.log"),
            path.join(songDirectory, "song-old.json"),
        ].sort()
    );
    assert.equal(unlinked.some((filePath) => filePath.includes("nested-folder")), false);
    assert.deepEqual(errors, []);
});
