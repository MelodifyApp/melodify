"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const values = {};
const config = {
    get: (key) => values[key],
    set: (data) => Object.assign(values, data),
};
const logging = {
    logDebug() {},
    logInfo() {},
    logWarn() {},
    logError() {},
};

let fetchCalls = 0;
let fetchImpl = async () => tokenResponse("refreshed", "rotated");

function tokenResponse(accessToken, refreshToken) {
    return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: 3600,
        }),
    };
}

function loadClient(initial = {}) {
    for (const key of Object.keys(values)) delete values[key];
    Object.assign(values, {
        kickClientId: "test-client",
        kickClientSecret: "test-secret",
        kickAccessToken: "saved-access",
        kickRefreshToken: "saved-refresh",
        kickExpiresAt: Date.now() - 1000,
        ...initial,
    });
    fetchCalls = 0;
    let client;
    const originalLoad = Module._load;
    try {
        Module._load = function (request, parent, isMain) {
            if (request === "node-fetch") {
                return {
                    __esModule: true,
                    default: async (...args) => {
                        fetchCalls += 1;
                        return fetchImpl(...args);
                    },
                };
            }
            if (request === "@/core/config") return { __esModule: true, default: config };
            if (request === "@/core/logging") return logging;
            if (request === "@/core/logging/utils") {
                return { redactSecrets: (value) => value };
            }
            return originalLoad.call(this, request, parent, isMain);
        };
        const clientPath = require.resolve("../src/features/kick/api/client");
        delete require.cache[clientPath];
        client = require(clientPath).kickClient;
    } finally {
        Module._load = originalLoad;
    }
    return client;
}

function deferred() {
    let resolve;
    const promise = new Promise((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

test("concurrent Kick refresh requests share one token refresh", async () => {
    const client = loadClient();
    const gate = deferred();
    fetchImpl = async () => {
        await gate.promise;
        return tokenResponse("refreshed", "rotated");
    };

    const first = client.refreshAccessToken();
    const second = client.refreshAccessToken();
    assert.equal(fetchCalls, 1, "both callers must share the in-flight refresh");

    gate.resolve();
    assert.deepEqual(await Promise.all([first, second]), [true, true]);
    assert.equal(values.kickAccessToken, "refreshed");
});

test("logout during an in-flight Kick refresh cannot resurrect tokens", async () => {
    const client = loadClient();
    const gate = deferred();
    fetchImpl = async () => {
        await gate.promise;
        return tokenResponse("late-access", "late-refresh");
    };

    const pending = client.refreshAccessToken();
    client.clearTokens();
    gate.resolve();

    assert.equal(await pending, false);
    assert.equal(values.kickAccessToken, undefined);
    assert.equal(values.kickRefreshToken, undefined);
    assert.equal(client.hasTokens(), false);
});

test("malformed Kick refresh data keeps the existing session", async () => {
    const client = loadClient();
    fetchImpl = async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ access_token: "", expires_in: -1 }),
    });

    assert.equal(await client.refreshAccessToken(), false);
    assert.equal(values.kickAccessToken, "saved-access");
    assert.equal(values.kickRefreshToken, "saved-refresh");
});

test("a successful Kick refresh persists rotated tokens", async () => {
    const client = loadClient();
    const before = Date.now();
    fetchImpl = async () => tokenResponse("refreshed", "rotated");

    assert.equal(await client.refreshAccessToken(), true);
    assert.equal(values.kickAccessToken, "refreshed");
    assert.equal(values.kickRefreshToken, "rotated");
    assert.ok(values.kickExpiresAt >= before + 3600000);
});

test("logout during an authorization-code exchange cannot save tokens", async () => {
    const client = loadClient();
    const gate = deferred();
    fetchImpl = async () => {
        await gate.promise;
        return tokenResponse("late-access", "late-refresh");
    };

    const pending = client.exchangeCodeForTokens("code", "verifier");
    client.clearTokens();
    gate.resolve();

    assert.equal(await pending, false);
    assert.equal(values.kickAccessToken, undefined);
    assert.equal(values.kickRefreshToken, undefined);
});
