"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    verifyAppCredentials,
    VERIFICATION_ENDPOINTS,
} = require("../src/shared/utils/credentialVerification");

function fakeFetch(responseOrError, capture = []) {
    return async (url, init) => {
        capture.push({ url: String(url), init });
        if (responseOrError instanceof Error) throw responseOrError;
        return responseOrError;
    };
}

test("app credential verification uses the documented provider endpoints", async () => {
    const captures = [];
    const fetchImpl = fakeFetch({ ok: true, status: 200 }, captures);

    assert.deepEqual(
        await verifyAppCredentials(
            "spotify",
            { clientId: "spotify-id", clientSecret: "spotify-secret" },
            fetchImpl
        ),
        { success: true }
    );
    assert.equal(captures[0].url, VERIFICATION_ENDPOINTS.spotify);
    assert.equal(captures[0].url, "https://accounts.spotify.com/api/token");
    assert.equal(captures[0].init.method, "POST");
    assert.match(captures[0].init.headers.Authorization, /^Basic /);
    assert.match(captures[0].init.body, /grant_type=client_credentials/);

    captures.length = 0;
    assert.deepEqual(
        await verifyAppCredentials(
            "twitch",
            { clientId: "twitch-id", clientSecret: "twitch-secret" },
            fetchImpl
        ),
        { success: true }
    );
    assert.equal(captures[0].url, "https://id.twitch.tv/oauth2/token");
    assert.equal(captures[0].init.method, "POST");
    assert.match(captures[0].init.body, /client_id=twitch-id/);
    assert.match(captures[0].init.body, /client_secret=twitch-secret/);
    assert.match(captures[0].init.body, /grant_type=client_credentials/);
    assert.equal(captures[0].init.headers.Authorization, undefined);

    captures.length = 0;
    assert.deepEqual(
        await verifyAppCredentials(
            "kick",
            { clientId: "kick-id", clientSecret: "kick-secret" },
            fetchImpl
        ),
        { success: true }
    );
    assert.equal(captures[0].url, "https://id.kick.com/oauth/token");
    assert.equal(captures[0].init.method, "POST");
    assert.match(captures[0].init.body, /client_id=kick-id/);
    assert.match(captures[0].init.body, /client_secret=kick-secret/);
    assert.match(captures[0].init.body, /grant_type=client_credentials/);
    assert.equal(captures[0].init.headers.Authorization, undefined);
});

test("provider status codes map to stable credential failure codes", async () => {
    for (const [provider, status, code] of [
        ["spotify", 400, "invalid_credentials"],
        ["spotify", 401, "invalid_credentials"],
        ["spotify", 403, "invalid_credentials"],
        ["spotify", 429, "verification_unavailable"],
        ["spotify", 500, "verification_unavailable"],
        ["twitch", 400, "invalid_credentials"],
        ["twitch", 401, "invalid_credentials"],
        ["twitch", 503, "verification_unavailable"],
        ["kick", 401, "invalid_credentials"],
        ["kick", 403, "invalid_credentials"],
        ["kick", 429, "verification_unavailable"],
    ]) {
        const result = await verifyAppCredentials(
            provider,
            { clientId: "id", clientSecret: "secret" },
            fakeFetch({ ok: false, status })
        );
        assert.deepEqual(result, { success: false, code }, `${provider} ${status}`);
    }
});

test("missing fields and network failures never expose provider text or credentials", async () => {
    for (const provider of ["spotify", "twitch", "kick"]) {
        assert.deepEqual(
            await verifyAppCredentials(provider, { clientId: "", clientSecret: "secret" }),
            { success: false, code: "missing_credentials" }
        );
        assert.deepEqual(
            await verifyAppCredentials(provider, { clientId: "id", clientSecret: "  " }),
            { success: false, code: "missing_credentials" }
        );
        const result = await verifyAppCredentials(
            provider,
            { clientId: "private-id", clientSecret: "private-secret" },
            fakeFetch(
                new Error(
                    "provider sent raw error private-id private-secret access_token"
                )
            )
        );
        assert.deepEqual(result, { success: false, code: "verification_unavailable" });
        assert.doesNotMatch(
            JSON.stringify(result),
            /private-id|private-secret|provider sent|access_token/
        );
    }
});

test("verification never consumes a response token or user token", async () => {
    const captures = [];
    const fetchImpl = async (url, init) => {
        captures.push({ url, init });
        return {
            ok: true,
            status: 200,
            json: async () => ({ access_token: "sensitive-token" }),
        };
    };

    const result = await verifyAppCredentials(
        "twitch",
        { clientId: "id", clientSecret: "secret" },
        fetchImpl
    );
    assert.deepEqual(result, { success: true });
    assert.doesNotMatch(JSON.stringify(result), /sensitive-token/);
    assert.doesNotMatch(
        String(captures[0].init.headers.Authorization || ""),
        /sensitive-token/
    );
});
