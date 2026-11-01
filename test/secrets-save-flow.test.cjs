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
    verifyServiceSecrets,
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

function fakeBridge(result = { success: true }) {
    const calls = [];
    return {
        calls,
        invoke: async (channel, data) => {
            calls.push(["invoke", channel, data]);
            return typeof result === "function" ? result(channel, data) : result;
        },
    };
}

const SPOTIFY_CONFIG = { spotifyClientId: "spotify-id-123" };
const KICK_CONFIG = { kickClientId: "kick-id-123" };
const TWITCH_CONFIG = { twitchClientId: "twitch-id-123" };
const SPOTIFY_DRAFTS = { spotifyClientSecret: "spotify-secret-value" };
const KICK_DRAFTS = { kickClientSecret: "kick-secret-value" };
const TWITCH_DRAFTS = { twitchClientSecret: "twitch-secret-value" };

test("all credential operations are awaited invoke channels", () => {
    assert.ok(Object.isFrozen(SECRET_SERVICES));
    assert.deepEqual(
        SECRET_SERVICES.map((service) => service.id).sort(),
        ["kick", "spotify", "twitch"]
    );

    for (const service of SECRET_SERVICES) {
        assert.ok(Object.isFrozen(service));
        assert.equal(service.transport, "invoke");
        assert.ok(service.verifyChannel.endsWith(":verifySecrets"));
        assert.ok(service.channel.endsWith(":setSecrets"));
        assert.ok(INVOKE_CHANNELS.includes(service.verifyChannel));
        assert.ok(INVOKE_CHANNELS.includes(service.channel));
        assert.equal(SEND_CHANNELS.includes(service.verifyChannel), false);
        assert.equal(SEND_CHANNELS.includes(service.channel), false);
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

for (const [id, config, drafts, channel] of [
    ["spotify", SPOTIFY_CONFIG, SPOTIFY_DRAFTS, "spotify:setSecrets"],
    ["kick", KICK_CONFIG, KICK_DRAFTS, "kick:setSecrets"],
    ["twitch", TWITCH_CONFIG, TWITCH_DRAFTS, "twitch:setSecrets"],
]) {
    test(`saving ${id} uses invoke once and clears the draft`, async () => {
        const bridge = fakeBridge();
        const result = await saveServiceSecrets(id, config, drafts, bridge);
        assert.equal(result.ok, true);
        assert.deepEqual(result.drafts, {});
        assert.deepEqual(bridge.calls, [
            [
                "invoke",
                channel,
                {
                    [getSecretService(id).clientIdKey]: config[getSecretService(id).clientIdKey],
                    [getSecretService(id).clientSecretKey]: drafts[getSecretService(id).clientSecretKey],
                },
            ],
        ]);
    });

    test(`verifying ${id} awaits the verify channel and keeps the draft`, async () => {
        const bridge = fakeBridge();
        const result = await verifyServiceSecrets(id, config, drafts, bridge);
        assert.equal(result.ok, true);
        assert.deepEqual(result.drafts, drafts);
        assert.deepEqual(bridge.calls, [
            [
                "invoke",
                getSecretService(id).verifyChannel,
                {
                    [getSecretService(id).clientIdKey]: config[getSecretService(id).clientIdKey],
                    [getSecretService(id).clientSecretKey]: drafts[getSecretService(id).clientSecretKey],
                },
            ],
        ]);
    });
}

test("credential operations never travel through config:set", async () => {
    const bridge = fakeBridge();
    for (const [id, config, drafts] of [
        ["spotify", SPOTIFY_CONFIG, SPOTIFY_DRAFTS],
        ["kick", KICK_CONFIG, KICK_DRAFTS],
        ["twitch", TWITCH_CONFIG, TWITCH_DRAFTS],
    ]) {
        await verifyServiceSecrets(id, config, drafts, bridge);
        await saveServiceSecrets(id, config, drafts, bridge);
    }
    assert.equal(
        bridge.calls.some(([, channel]) => channel === "config:set"),
        false
    );
    assert.equal(
        bridge.calls.every(([direction]) => direction === "invoke"),
        true
    );
});

test("incomplete credentials are rejected before any IPC call", async () => {
    for (const [serviceId, config, drafts] of [
        ["spotify", {}, SPOTIFY_DRAFTS],
        ["spotify", SPOTIFY_CONFIG, {}],
        ["spotify", SPOTIFY_CONFIG, { spotifyClientSecret: "   " }],
        ["kick", { kickClientId: "" }, KICK_DRAFTS],
        ["kick", KICK_CONFIG, {}],
        ["twitch", { twitchClientId: "" }, TWITCH_DRAFTS],
        ["twitch", TWITCH_CONFIG, {}],
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
        assert.deepEqual(result.drafts, drafts);
        assert.deepEqual(bridge.calls, []);
    }
});

test("verification can use a stored secret and never clears the draft", async () => {
    const bridge = fakeBridge();
    const result = await verifyServiceSecrets(
        "spotify",
        { spotifyClientId: "stored-id" },
        {},
        bridge
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.drafts, {});
    assert.deepEqual(bridge.calls[0][2], {
        spotifyClientId: "stored-id",
        spotifyClientSecret: "",
    });
});

test("failed saves retain the draft and map only stable errors", async () => {
    const cases = [
        [async () => { throw new Error("network down"); }, "unavailable"],
        [async () => ({ success: false, code: "invalid_credentials", error: "raw" }), "invalid"],
        [async () => ({ success: false, code: "verification_unavailable" }), "unavailable"],
        [async () => ({ success: false, code: "missing_credentials" }), "required"],
        [async () => ({ success: false, code: "persistence_failed" }), "persistence"],
        [async () => ({ success: false }), "failed"],
    ];
    for (const [invoke, expected] of cases) {
        const bridge = { invoke };
        const result = await saveServiceSecrets(
            "spotify",
            SPOTIFY_CONFIG,
            SPOTIFY_DRAFTS,
            bridge
        );
        assert.equal(result.ok, false);
        assert.equal(result.error, expected);
        assert.deepEqual(result.drafts, SPOTIFY_DRAFTS);
        assert.doesNotMatch(JSON.stringify(result), /network down|raw/);
    }
});

test("failed verification keeps the draft for retry", async () => {
    const bridge = fakeBridge({ success: false, code: "invalid_credentials" });
    const result = await verifyServiceSecrets(
        "twitch",
        TWITCH_CONFIG,
        TWITCH_DRAFTS,
        bridge
    );
    assert.equal(result.ok, false);
    assert.equal(result.error, "invalid");
    assert.deepEqual(result.drafts, TWITCH_DRAFTS);
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

test("Secrets uses Studio cards, explicit verification and Save gating", () => {
    const source = readSource(
        "src/features/settings/components/sections/Secrets.tsx"
    );
    const hook = readSource("src/features/settings/useSecretsSection.ts");

    assert.match(source, /ServiceCard/);
    assert.match(source, /verifyServiceSecrets/);
    assert.match(source, /verifyService/);
    assert.match(source, /common\.verifyCredentials/);
    assert.match(source, /canVerifyCredentials/);
    assert.match(source, /canSaveCredentials/);
    assert.match(source, /disabled={!canSave/);
    assert.match(source, /credentialStatusMessageKey/);
    assert.match(source, /common\.setupGuide/);
    assert.match(source, /role="dialog"/);
    assert.match(source, /Escape/);
    assert.match(source, /aria-modal="true"/);
    assert.match(source, /common\.back/);
    assert.match(source, /useCredentialStatuses/);
    assert.match(source, /credentialStatuses\.storedSecrets/);
    const store = readSource(
        "src/features/settings/credentialStatusStore.ts"
    );
    assert.match(store, /\$\{service\.id\}:hasSecrets/);

    assert.match(hook, /updateSecretDraft\(prev, key, value\)/);
    assert.match(hook, /onClientIdChange\(key, value\)/);
    assert.match(hook, /statusForSaveFailure/);
    assert.match(hook, /onStoredSecretChange/);
    assert.match(hook, /onStatusChange/);
    assert.match(hook, /onResetStatus/);
});

test("Settings does not route credential fields through global save/discard", () => {
    const source = readSource("src/features/settings/components/Settings.tsx");
    assert.doesNotMatch(source, /ClientSecret/);
    assert.doesNotMatch(source, /setSecrets/);
    assert.match(source, /mode="api"/);
});

test("Twitch and Kick credential labels and validation remain available", () => {
    const source = readSource(
        "src/features/settings/components/sections/Secrets.tsx"
    );
    const { validateField } = require("../src/features/settings/components/validation");
    assert.match(source, /twitch/);
    assert.match(source, /kick/);
    assert.match(source, /TwitchIcon|ServiceCard/);
    assert.match(validateField("twitchClientId", "short"), /too short/);
    assert.match(validateField("twitchClientSecret", "short"), /too short/);
    assert.match(validateField("kickClientId", "short"), /too short/);
    assert.equal(typeof en.common.verifyCredentials, "string");
    assert.equal(typeof tr.common.verifyCredentials, "string");
});
