"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

function fixture() {
    const values = {
        twitchClientId: "test-id", twitchClientSecret: "test-secret",
        twitchAccessToken: "expired-access", twitchRefreshToken: "saved-refresh",
        twitchExpiresAt: Date.now() - 1000, twitchUsername: "sample-streamer",
    };
    const calls = [];
    const writes = [];
    let response = async () => ({ ok: true, status: 200, json: async () => ({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 }) });
    const config = { get: (key) => values[key], set(data) { writes.push(data); Object.assign(values, data); } };
    const handlers = new Map();
    const chat = { started: 0, stopped: 0 };
    const oldLoad = Module._load;
    let client;
    try {
        Module._load = function (request, parent, isMain) {
            if (request === "node-fetch") return { __esModule: true, default: async (...args) => { calls.push(args); return response(...args); } };
            if (request === "@/core/config") return { __esModule: true, default: config };
            if (request === "@/core/logging") return { logDebug() {}, logInfo() {}, logWarn() {}, logError() {} };
            if (request === "@/core/logging/utils") return { redactSecrets: (value) => value };
            if (request === "electron") return { ipcMain: { on: (name, fn) => handlers.set(name, fn), handle: (name, fn) => handlers.set(name, fn) }, BrowserWindow: { fromWebContents: () => undefined } };
            if (request === "@/features/twitch/api/client") return { twitchClient: client };
            if (request === "@/features/twitch/auth/server") return {};
            if (request === "@/features/twitch/chat/listener") return { listenToChat() { chat.started++; }, stopListeningToChat() { chat.stopped++; } };
            if (request === "@/shared/utils/windowSend") return require("../src/shared/utils/windowSend");
            return oldLoad.call(this, request, parent, isMain);
        };
        const clientPath = require.resolve("../src/features/twitch/api/client");
        delete require.cache[clientPath];
        client = require(clientPath).twitchClient;
        const ipcPath = require.resolve("../src/features/twitch/ipc/handlers");
        delete require.cache[ipcPath];
        require(ipcPath);
    } finally { Module._load = oldLoad; }
    return { client, values, calls, writes, handlers, chat, respond(fn) { response = fn; } };
}

test("expired Twitch auth refreshes and persists rotated tokens before starting chat", async () => {
    const f = fixture();
    const before = Date.now();
    assert.deepEqual(await f.handlers.get("twitch:checkAuth")({ sender: {} }), { authenticated: true, twitchUsername: "sample-streamer" });
    assert.equal(f.calls.length, 1);
    const [url, init] = f.calls[0];
    assert.equal(url, "https://id.twitch.tv/oauth2/token");
    assert.equal(init.method, "POST");
    assert.equal(new URLSearchParams(init.body).get("client_id"), "test-id");
    assert.equal(new URLSearchParams(init.body).get("client_secret"), "test-secret");
    assert.equal(new URLSearchParams(init.body).get("grant_type"), "refresh_token");
    assert.equal(new URLSearchParams(init.body).get("refresh_token"), "saved-refresh");
    assert.equal(f.values.twitchAccessToken, "new-access");
    assert.equal(f.values.twitchRefreshToken, "new-refresh");
    assert.ok(f.values.twitchExpiresAt >= before + 3600000);
    assert.equal(f.chat.started, 1);
    assert.equal(f.chat.stopped, 0);
});

test("valid Twitch token is reused without refresh", async () => {
    const f = fixture();
    f.client.updateTokens({ accessToken: "valid", refreshToken: "refresh", expiresAt: Date.now() + 3600000 });
    assert.equal(await f.client.getValidAccessToken(), "valid");
    assert.equal(f.calls.length, 0);
});

test("refresh response without rotation keeps the saved refresh token", async () => {
    const f = fixture();
    f.respond(async () => ({ ok: true, status: 200, json: async () => ({ access_token: "new", expires_in: 120 }) }));
    assert.equal(await f.client.getValidAccessToken(), "new");
    assert.equal(f.values.twitchRefreshToken, "saved-refresh");
});

for (const failure of ["network", "server", "rate-limit", "invalid-client", "malformed"]) {
    test(`${failure} refresh failure preserves tokens so the next attempt can recover`, async () => {
        const f = fixture();
        f.respond(async () => {
            if (failure === "network") throw new Error("network unavailable");
            return { ok: failure === "malformed", status: failure === "server" ? 503 : failure === "rate-limit" ? 429 : failure === "malformed" ? 200 : 400,
                json: async () => failure === "malformed" ? { access_token: "", expires_in: -1 } : { message: "Invalid client secret" } };
        });
        assert.deepEqual(await f.handlers.get("twitch:checkAuth")({ sender: {} }), { authenticated: false });
        assert.equal(f.values.twitchRefreshToken, "saved-refresh");
        assert.equal(f.values.twitchAccessToken, "expired-access");
        assert.equal(f.writes.length, 0);
        assert.equal(f.chat.started, 0);
        f.respond(async () => ({ ok: true, status: 200, json: async () => ({ access_token: "recovered", expires_in: 60 }) }));
        assert.equal(await f.client.getValidAccessToken(), "recovered");
    });
}

for (const field of ["twitchClientId", "twitchClientSecret"]) {
    test(`missing ${field} does not send a refresh or discard the saved session`, async () => {
        const f = fixture();
        delete f.values[field];
        assert.equal(await f.client.getValidAccessToken(), null);
        assert.equal(f.calls.length, 0);
        assert.equal(f.values.twitchRefreshToken, "saved-refresh");
    });
}

test("logged out client does not send token requests", async () => {
    const f = fixture();
    f.client.clearTokens();
    assert.equal(await f.client.getValidAccessToken(), null);
    assert.equal(f.calls.length, 0);
});

test("explicitly invalid refresh token clears tokens and requires sign-in", async () => {
    const f = fixture();
    f.respond(async () => ({ ok: false, status: 400, json: async () => ({ message: "Invalid refresh token" }) }));
    assert.deepEqual(await f.handlers.get("twitch:checkAuth")({ sender: {} }), { authenticated: false });
    assert.equal(f.values.twitchRefreshToken, undefined);
    assert.equal(f.values.twitchAccessToken, undefined);
    assert.equal(f.chat.started, 0);
});

test("concurrent token requests share a refresh", async () => {
    const f = fixture();
    let finish;
    f.respond(() => new Promise((resolve) => { finish = resolve; }));
    const first = f.client.getValidAccessToken();
    const second = f.client.getValidAccessToken();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.calls.length, 1);
    finish({ ok: true, status: 200, json: async () => ({ access_token: "shared", expires_in: 60 }) });
    assert.deepEqual(await Promise.all([first, second]), ["shared", "shared"]);
});

for (const action of ["logout", "new-login"]) {
    test(`pending refresh cannot overwrite ${action}`, async () => {
        const f = fixture();
        let finish;
        f.respond(() => new Promise((resolve) => { finish = resolve; }));
        const pending = f.client.getValidAccessToken();
        await new Promise((resolve) => setImmediate(resolve));
        if (action === "logout") f.client.clearTokens();
        else f.client.updateTokens({ accessToken: "fresh-login", refreshToken: "fresh-refresh", expiresAt: Date.now() + 3600000 });
        finish({ ok: true, status: 200, json: async () => ({ access_token: "stale-refresh", expires_in: 60 }) });
        assert.equal(await pending, null);
        assert.equal(f.values.twitchAccessToken, action === "logout" ? undefined : "fresh-login");
    });
}
