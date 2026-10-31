"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;

function withStubs(stubs, body) {
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
        if (Object.prototype.hasOwnProperty.call(stubs, request)) {
            return stubs[request];
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    return Promise.resolve()
        .then(body)
        .finally(() => {
            Module._resolveFilename = originalResolve;
            Module._load = originalLoad;
        });
}

function load(relativePath) {
    const resolved = require.resolve(path.join(root, relativePath));
    delete require.cache[resolved];
    return require(resolved);
}

function deferred() {
    let resolve;
    const promise = new Promise((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

async function waitFor(predicate, description, timeoutMs = 3000) {
    const started = Date.now();
    while (!predicate()) {
        if (Date.now() - started > timeoutMs) {
            throw new Error(`Timed out waiting for ${description}`);
        }
        await new Promise((resolve) => setImmediate(resolve));
    }
}

test("spotify:logout invalidates an in-flight refresh before it can write tokens", async () => {
    const values = {
        spotifyClientId: "dummy-client-id",
        spotifyClientSecret: "dummy-client-secret",
        spotifyAccessToken: "dummy-old-access",
        spotifyRefreshToken: "dummy-old-refresh",
        spotifyExpiresAt: Date.now() - 1000,
    };
    const config = {
        get: (key) => values[key],
        set: (patch) => Object.assign(values, patch),
    };
    const logging = {
        logDebug() {},
        logInfo() {},
        logWarn() {},
        logError() {},
    };
    const gate = deferred();
    let refreshCalls = 0;

    class FakeSpotifyWebApi {
        constructor() {
            FakeSpotifyWebApi.instance = this;
        }
        setAccessToken() {}
        setRefreshToken() {}
        async refreshAccessToken() {
            refreshCalls += 1;
            return gate.promise;
        }
        createAuthorizeURL() {
            return "https://example.invalid/authorize";
        }
        async getMe() {
            return { body: { display_name: "dummy" } };
        }
    }

    const ipc = {
        listeners: new Map(),
        handlers: new Map(),
        on(channel, fn) {
            const list = this.listeners.get(channel) || [];
            list.push(fn);
            this.listeners.set(channel, list);
        },
        handle(channel, fn) {
            this.handlers.set(channel, fn);
        },
        removeAllListeners(channel) {
            this.listeners.delete(channel);
        },
    };
    const electron = {
        ipcMain: ipc,
        BrowserWindow: {
            fromWebContents: () => ({
                webContents: {},
                isDestroyed: () => false,
                show() {},
                focus() {},
            }),
        },
        shell: { openExternal() {} },
    };
    const stubs = {
        electron,
        "ps-list": { __esModule: true, default: async () => [] },
        "spotify-web-api-node": FakeSpotifyWebApi,
        "child_process": {
            exec(_command, _options, callback) {
                if (typeof _options === "function") {
                    _options(null, { stdout: "", stderr: "" });
                } else if (typeof callback === "function") {
                    callback(null, { stdout: "", stderr: "" });
                }
            },
        },
        "@/core/config": { __esModule: true, default: config },
        "@/core/logging": logging,
        "@/core/logging/utils": { redactSecrets: (value) => value },
        "@/features/spotify/auth/server": {
            startSpotifyAuthServer: async () => "dummy-state",
            stopSpotifyAuthServer() {},
        },
    };

    await withStubs(stubs, async () => {
        const player = load("src/features/spotify/playback/player.ts");
        load("src/features/spotify/ipc/handlers.ts");
        const logout = (ipc.listeners.get("spotify:logout") || [])[0];
        assert.equal(typeof logout, "function");

        const refreshPromise = player.refreshSpotifyAccessToken();
        await waitFor(
            () => refreshCalls === 1,
            "the fake provider refresh to be pending"
        );

        logout({ sender: {} });
        assert.equal(values.spotifyAccessToken, undefined);
        assert.equal(values.spotifyRefreshToken, undefined);
        assert.equal(values.spotifyExpiresAt, undefined);

        gate.resolve({
            body: {
                access_token: "dummy-late-access",
                expires_in: 3600,
            },
        });
        const refreshed = await refreshPromise;

        assert.equal(refreshed, false);
        assert.equal(values.spotifyAccessToken, undefined);
        assert.equal(values.spotifyRefreshToken, undefined);
        assert.equal(values.spotifyExpiresAt, undefined);
    });
});
