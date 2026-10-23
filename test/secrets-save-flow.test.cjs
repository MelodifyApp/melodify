"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
    SECRET_SERVICES,
    getSecretService,
    updateSecretDraft,
    clearSecretDrafts,
    saveServiceSecrets,
    secretStatusMessageKey,
} = require("../src/features/settings/secretsSave");

const {
    SEND_CHANNELS,
    INVOKE_CHANNELS,
} = require("../src/shared/ipcChannels");

const en = require("../src/core/i18n/locales/en.json");
const tr = require("../src/core/i18n/locales/tr.json");

function readSource(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

function lookup(locale, dottedKey) {
    return dottedKey
        .split(".")
        .reduce((node, part) => (node == null ? undefined : node[part]), locale);
}

function fakeBridge() {
    const calls = [];
    return {
        calls,
        invoke: async (channel, data) => {
            calls.push(["invoke", channel, data]);
            return { success: true };
        },
        send: (channel, data) => {
            calls.push(["send", channel, data]);
        },
    };
}

const SPOTIFY_CONFIG = { spotifyClientId: "spotify-id-123" };
const KICK_CONFIG = { kickClientId: "kick-id-123" };
const SPOTIFY_DRAFTS = { spotifyClientSecret: "spotify-secret-value" };
const KICK_DRAFTS = { kickClientSecret: "kick-secret-value" };

test("secret services declare the correct transport direction", () => {
    assert.ok(Object.isFrozen(SECRET_SERVICES));
    assert.deepEqual(
        SECRET_SERVICES.map((service) => service.id).sort(),
        ["kick", "spotify"]
    );

    const spotify = getSecretService("spotify");
    assert.equal(spotify.channel, "spotify:setSecrets");
    assert.equal(spotify.transport, "invoke");
    assert.equal(spotify.clientIdKey, "spotifyClientId");
    assert.equal(spotify.clientSecretKey, "spotifyClientSecret");

    const kick = getSecretService("kick");
    assert.equal(kick.channel, "kick:setSecrets");
    assert.equal(kick.transport, "send");
    assert.equal(kick.clientIdKey, "kickClientId");
    assert.equal(kick.clientSecretKey, "kickClientSecret");

    for (const service of SECRET_SERVICES) {
        assert.ok(Object.isFrozen(service));
        if (service.transport === "invoke") {
            assert.ok(INVOKE_CHANNELS.includes(service.channel));
            assert.equal(SEND_CHANNELS.includes(service.channel), false);
        } else {
            assert.ok(SEND_CHANNELS.includes(service.channel));
            assert.equal(INVOKE_CHANNELS.includes(service.channel), false);
        }
    }
});

test("draft helpers are immutable and scoped per service", () => {
    const drafts = {};
    const withSecret = updateSecretDraft(drafts, "spotifyClientSecret", "abc");
    assert.deepEqual(drafts, {});
    assert.deepEqual(withSecret, { spotifyClientSecret: "abc" });

    const both = updateSecretDraft(withSecret, "kickClientSecret", "xyz");
    const cleared = clearSecretDrafts(both, "spotify");
    assert.deepEqual(cleared, { kickClientSecret: "xyz" });
    assert.deepEqual(both, {
        spotifyClientSecret: "abc",
        kickClientSecret: "xyz",
    });

    assert.deepEqual(updateSecretDraft(drafts, "kickClientSecret", ""), {
        kickClientSecret: "",
    });
});

test("status messages map to translation keys present in every locale", () => {
    const expected = {
        saving: "common.saving",
        saved: "common.saved",
        required: "common.secretsRequired",
        invalid: "common.invalidCredentials",
        unavailable: "common.verificationUnavailable",
        failed: "common.secretsSaveError",
    };
    for (const [status, key] of Object.entries(expected)) {
        assert.equal(secretStatusMessageKey(status), key);
        assert.equal(typeof lookup(en, key), "string", `en missing ${key}`);
        assert.equal(typeof lookup(tr, key), "string", `tr missing ${key}`);
    }
    assert.equal(secretStatusMessageKey("idle"), null);
});

test("credential failure copy tells the user what to do", () => {
    assert.equal(
        lookup(en, "common.invalidCredentials"),
        "Please enter a valid Client ID and Client Secret."
    );
    assert.equal(
        lookup(tr, "common.invalidCredentials"),
        "Lütfen geçerli bir Client ID ve Client Secret girin."
    );
    assert.match(lookup(en, "common.verificationUnavailable"), /connection/i);
    assert.match(lookup(tr, "common.verificationUnavailable"), /[Bb]ağlantı/);
});

test("saving Spotify secrets uses invoke exactly once and clears the draft", async () => {
    const bridge = fakeBridge();

    const result = await saveServiceSecrets(
        "spotify",
        SPOTIFY_CONFIG,
        SPOTIFY_DRAFTS,
        bridge
    );

    assert.equal(result.ok, true);
    assert.equal(result.error, undefined);
    assert.deepEqual(result.drafts, {});
    assert.deepEqual(bridge.calls, [
        [
            "invoke",
            "spotify:setSecrets",
            {
                spotifyClientId: "spotify-id-123",
                spotifyClientSecret: "spotify-secret-value",
            },
        ],
    ]);
});

test("saving Kick secrets uses send exactly once and clears the draft", async () => {
    const bridge = fakeBridge();

    const result = await saveServiceSecrets(
        "kick",
        KICK_CONFIG,
        KICK_DRAFTS,
        bridge
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.drafts, {});
    assert.deepEqual(bridge.calls, [
        [
            "send",
            "kick:setSecrets",
            {
                kickClientId: "kick-id-123",
                kickClientSecret: "kick-secret-value",
            },
        ],
    ]);
});

test("credential saves never travel through config:set", async () => {
    const bridge = fakeBridge();

    await saveServiceSecrets("spotify", SPOTIFY_CONFIG, SPOTIFY_DRAFTS, bridge);
    await saveServiceSecrets("kick", KICK_CONFIG, KICK_DRAFTS, bridge);

    assert.equal(
        bridge.calls.some(([, channel]) => channel === "config:set"),
        false
    );
    assert.deepEqual(
        bridge.calls.map(([direction, channel]) => [direction, channel]),
        [
            ["invoke", "spotify:setSecrets"],
            ["send", "kick:setSecrets"],
        ]
    );
});

test("incomplete credentials are rejected before any IPC call", async () => {
    for (const [serviceId, config, drafts] of [
        ["spotify", {}, SPOTIFY_DRAFTS],
        ["spotify", SPOTIFY_CONFIG, {}],
        ["spotify", SPOTIFY_CONFIG, { spotifyClientSecret: "   " }],
        ["kick", { kickClientId: "" }, KICK_DRAFTS],
        ["kick", KICK_CONFIG, {}],
    ]) {
        const bridge = fakeBridge();
        const result = await saveServiceSecrets(
            serviceId,
            config,
            drafts,
            bridge
        );

        assert.equal(result.ok, false, `${serviceId} should not save`);
        assert.equal(result.error, "required");
        assert.deepEqual(result.drafts, drafts, "draft must be retained");
        assert.deepEqual(bridge.calls, [], "no IPC call may happen");
    }
});

test("failed saves retain the draft and report the failure cause", async () => {
    const rejecting = {
        calls: [],
        invoke: async (channel, data) => {
            rejecting.calls.push(["invoke", channel, data]);
            throw new Error("network down");
        },
        send: (channel, data) => {
            rejecting.calls.push(["send", channel, data]);
        },
    };
    const rejected = await saveServiceSecrets(
        "spotify",
        SPOTIFY_CONFIG,
        SPOTIFY_DRAFTS,
        rejecting
    );
    assert.equal(rejected.ok, false);
    assert.equal(rejected.error, "unavailable");
    assert.deepEqual(rejected.drafts, SPOTIFY_DRAFTS);

    const invalid = {
        calls: [],
        invoke: async (channel, data) => {
            invalid.calls.push(["invoke", channel, data]);
            return {
                success: false,
                code: "invalid_credentials",
                error: "Invalid client ID or secret.",
            };
        },
        send: () => {},
    };
    const invalidResult = await saveServiceSecrets(
        "spotify",
        SPOTIFY_CONFIG,
        SPOTIFY_DRAFTS,
        invalid
    );
    assert.equal(invalidResult.ok, false);
    assert.equal(invalidResult.error, "invalid");
    assert.deepEqual(invalidResult.drafts, SPOTIFY_DRAFTS);

    const unavailable = {
        calls: [],
        invoke: async () => ({
            success: false,
            code: "verification_unavailable",
        }),
        send: () => {},
    };
    const unavailableResult = await saveServiceSecrets(
        "spotify",
        SPOTIFY_CONFIG,
        SPOTIFY_DRAFTS,
        unavailable
    );
    assert.equal(unavailableResult.ok, false);
    assert.equal(unavailableResult.error, "unavailable");
    assert.deepEqual(unavailableResult.drafts, SPOTIFY_DRAFTS);

    const missing = {
        calls: [],
        invoke: async () => ({ success: false, code: "missing_credentials" }),
        send: () => {},
    };
    const missingResult = await saveServiceSecrets(
        "spotify",
        SPOTIFY_CONFIG,
        SPOTIFY_DRAFTS,
        missing
    );
    assert.equal(missingResult.ok, false);
    assert.equal(missingResult.error, "required");
    assert.deepEqual(missingResult.drafts, SPOTIFY_DRAFTS);

    const unknown = {
        calls: [],
        invoke: async () => ({ success: false }),
        send: () => {},
    };
    const unknownResult = await saveServiceSecrets(
        "spotify",
        SPOTIFY_CONFIG,
        SPOTIFY_DRAFTS,
        unknown
    );
    assert.equal(unknownResult.ok, false);
    assert.equal(unknownResult.error, "failed");
    assert.deepEqual(unknownResult.drafts, SPOTIFY_DRAFTS);

    const throwing = {
        calls: [],
        invoke: async () => ({ success: true }),
        send: (channel, data) => {
            throwing.calls.push(["send", channel, data]);
            throw new Error("bridge blocked");
        },
    };
    const sendResult = await saveServiceSecrets(
        "kick",
        KICK_CONFIG,
        KICK_DRAFTS,
        throwing
    );
    assert.equal(sendResult.ok, false);
    assert.equal(sendResult.error, "unavailable");
    assert.deepEqual(sendResult.drafts, KICK_DRAFTS);
});

test("saving one service leaves the other service draft untouched", async () => {
    const bridge = fakeBridge();
    const drafts = {
        spotifyClientSecret: "spotify-secret-value",
        kickClientSecret: "kick-secret-value",
    };

    const result = await saveServiceSecrets(
        "spotify",
        SPOTIFY_CONFIG,
        drafts,
        bridge
    );

    assert.deepEqual(result.drafts, { kickClientSecret: "kick-secret-value" });
    assert.deepEqual(drafts, {
        spotifyClientSecret: "spotify-secret-value",
        kickClientSecret: "kick-secret-value",
    });
});

test("Secrets section keeps secrets in local drafts and only saves on demand", () => {
    const source = readSource(
        "src/features/settings/components/sections/Secrets.tsx"
    );

    // Uses the tested save model instead of ad-hoc IPC.
    assert.match(source, /saveServiceSecrets/);
    assert.match(source, /updateSecretDraft/);
    assert.match(source, /SECRET_SERVICES/);

    // No credential channel literals and no generic config:set for secrets.
    assert.doesNotMatch(source, /["'`]setSecrets["'`]/);
    assert.doesNotMatch(source, /["'`]config:set["'`]/);
    assert.doesNotMatch(source, /onConfigChange\(\s*[^)]*Secret/);

    // Ordinary client-ID edits still flow through the settings callback, and
    // secret edits are drafted locally before that path is reached.
    assert.match(source, /onConfigChange\(key, value\)/);
    const secretBranch = source.indexOf("updateSecretDraft(prev, key, value)");
    const configCall = source.indexOf("onConfigChange(key, value)");
    assert.ok(secretBranch > -1, "secret edits must use the draft helper");
    assert.ok(configCall > -1, "client IDs must still use onConfigChange");
    assert.ok(
        secretBranch < configCall,
        "secret edits must be handled before the generic config path"
    );

    // Accessible status region and an explicit save action.
    assert.match(source, /role="status"/);
    assert.match(source, /aria-live="polite"/);
    assert.match(source, /t\("common\.save"\)/);
});

test("Settings no longer routes secret edits through the generic save path", () => {
    const source = readSource("src/features/settings/components/Settings.tsx");
    assert.doesNotMatch(source, /ClientSecret/);
    assert.doesNotMatch(source, /setSecrets/);
});
