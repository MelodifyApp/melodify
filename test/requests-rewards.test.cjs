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

function load(relativePath) {
    Module._resolveFilename = function (request, ...args) {
        return originalResolve.call(
            this,
            request.startsWith("@/")
                ? path.join(root, "src", request.slice(2))
                : request,
            ...args
        );
    };
    try {
        const resolved = require.resolve(path.join(root, relativePath));
        delete require.cache[resolved];
        return require(resolved);
    } finally {
        Module._resolveFilename = originalResolve;
    }
}

function readSource(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function renderRequests(config) {
    const originalLoad = Module._load;
    const originalCss = require.extensions[".css"];
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
            return { useTranslation: () => ({ t: (key) => key }) };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    require.extensions[".css"] = () => {};
    try {
        const resolved = require.resolve(
            path.join(
                root,
                "src/features/settings/components/sections/Requests.tsx"
            )
        );
        delete require.cache[resolved];
        const Requests = require(resolved).default;
        return renderToStaticMarkup(
            React.createElement(Requests, {
                config,
                onConfigChange() {},
            })
        );
    } finally {
        Module._resolveFilename = originalResolve;
        Module._load = originalLoad;
        if (originalCss) require.extensions[".css"] = originalCss;
        else delete require.extensions[".css"];
    }
}

function loadRewardGate(provider, configValues, options = {}) {
    const calls = [];
    const hasTokens = options.hasTokens !== false;
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
        if (request === "node-fetch") {
            return { __esModule: true, default: async () => response({ data: [] }) };
        }
        if (request === "@/core/config") {
            return {
                __esModule: true,
                default: { get: (key) => configValues[key] },
            };
        }
        if (request === "@/core/logging") return { logWarn() {} };
        if (request === "@/features/twitch/api/client") {
            return {
                twitchClient: {
                    hasTokens: () => hasTokens,
                    getValidAccessToken: async () => "user-token",
                },
            };
        }
        if (request === "@/features/kick/api/client") {
            return {
                kickClient: {
                    hasTokens: () => hasTokens,
                    getValidAccessToken: async () => "user-token",
                },
            };
        }
        if (request === "@/features/twitch/rewardTitles") {
            return {
                fetchTwitchRewardTitles: async (input) => {
                    calls.push(input);
                    return {
                        status: "ok",
                        rewards: [{ id: "twitch-1", title: "Song Request" }],
                        titles: ["Song Request"],
                    };
                },
            };
        }
        if (request === "@/features/kick/rewardTitles") {
            return {
                fetchKickRewardTitles: async (input) => {
                    calls.push(input);
                    return {
                        status: "ok",
                        rewards: [{ id: "kick-1", title: "Song Request" }],
                        titles: ["Song Request"],
                    };
                },
            };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    const relativePath =
        provider === "twitch"
            ? "src/features/twitch/rewards.ts"
            : "src/features/kick/rewards.ts";
    const resolved = require.resolve(path.join(root, relativePath));
    delete require.cache[resolved];
    let module;
    try {
        module = require(resolved);
    } finally {
        Module._resolveFilename = originalResolve;
        Module._load = originalLoad;
    }
    return {
        module,
        calls,
        cleanup() {
            delete require.cache[resolved];
        },
    };
}

function response(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
    };
}

const twitchRewards = load("src/features/twitch/rewardTitles.ts");
const kickRewards = load("src/features/kick/rewardTitles.ts");
const rewardTitles = load("src/shared/rewards/rewardTitles.ts");
const rewardPicker = load("src/features/settings/rewardPicker.ts");
const requestsView = load("src/features/settings/components/requestsView.ts");
const draft = load("src/features/settings/components/draftState.ts");

test("Twitch reward reads use the documented Helix endpoint and keep IDs with titles", async () => {
    const calls = [];
    const result = await twitchRewards.fetchTwitchRewardTitles({
        broadcasterId: "broadcaster-1",
        clientId: "client-id",
        accessToken: "user-token",
        fetchImpl: async (url, init) => {
            calls.push({ url, init });
            return response({
                data: [
                    { id: "1", title: " Song Request ", cost: 100 },
                    { id: "2", title: "VIP Song", cost: 500 },
                    { id: "3", title: "Song Request", cost: 100 },
                    { id: "4", title: "   " },
                    { id: "5" },
                ],
            });
        },
    });

    assert.deepEqual(result, {
        status: "ok",
        rewards: [
            { id: "1", title: "Song Request" },
            { id: "3", title: "Song Request" },
            { id: "2", title: "VIP Song" },
        ],
        titles: ["Song Request", "VIP Song"],
    });
    assert.equal(calls.length, 1);
    const url = new URL(calls[0].url);
    assert.equal(
        `${url.origin}${url.pathname}`,
        "https://api.twitch.tv/helix/channels/custom_rewards"
    );
    assert.equal(url.searchParams.get("broadcaster_id"), "broadcaster-1");
    assert.equal(url.searchParams.get("first"), "50");
    assert.equal(calls[0].init.method, "GET");
    assert.equal(calls[0].init.headers.Authorization, "Bearer user-token");
    assert.equal(calls[0].init.headers["Client-Id"], "client-id");
    assert.equal(JSON.stringify(result).includes("cost"), false);
});

test("Kick reward reads use the official rewards endpoint and keep IDs with titles", async () => {
    const calls = [];
    const result = await kickRewards.fetchKickRewardTitles({
        accessToken: "kick-token",
        fetchImpl: async (url, init) => {
            calls.push({ url, init });
            return response({
                data: [
                    { id: "1", title: "Song Request" },
                    { id: "2", title: "Music Request" },
                    { id: "3", title: "Song Request" },
                ],
                message: "OK",
            });
        },
    });

    assert.deepEqual(result, {
        status: "ok",
        rewards: [
            { id: "2", title: "Music Request" },
            { id: "1", title: "Song Request" },
            { id: "3", title: "Song Request" },
        ],
        titles: ["Music Request", "Song Request"],
    });
    assert.equal(calls.length, 1);
    assert.equal(
        calls[0].url,
        "https://api.kick.com/public/v1/channels/rewards"
    );
    assert.equal(calls[0].init.method, "GET");
    assert.equal(calls[0].init.headers.Authorization, "Bearer kick-token");
    assert.equal(calls[0].init.headers["Client-Id"], undefined);
});

test("provider failures map to stable reasons without leaking response text", async () => {
    for (const status of [401, 403]) {
        assert.deepEqual(
            await twitchRewards.fetchTwitchRewardTitles({
                broadcasterId: "1",
                clientId: "id",
                accessToken: "token",
                fetchImpl: async () =>
                    response({ message: "provider secret detail" }, status),
            }),
            { status: "unavailable", reason: "missing-scope" }
        );
        assert.deepEqual(
            await kickRewards.fetchKickRewardTitles({
                accessToken: "token",
                fetchImpl: async () =>
                    response({ message: "provider secret detail" }, status),
            }),
            { status: "unavailable", reason: "missing-scope" }
        );
    }

    for (const status of [429, 500, 503]) {
        assert.deepEqual(
            await twitchRewards.fetchTwitchRewardTitles({
                broadcasterId: "1",
                clientId: "id",
                accessToken: "token",
                fetchImpl: async () => response({}, status),
            }),
            { status: "unavailable", reason: "provider-error" }
        );
    }

    const network = await kickRewards.fetchKickRewardTitles({
        accessToken: "token",
        fetchImpl: async () => {
            throw new Error("socket secret detail");
        },
    });
    assert.deepEqual(network, {
        status: "unavailable",
        reason: "provider-error",
    });
    assert.equal(JSON.stringify(network).includes("socket secret detail"), false);

    const malformed = await twitchRewards.fetchTwitchRewardTitles({
        broadcasterId: "1",
        clientId: "id",
        accessToken: "token",
        fetchImpl: async () => ({
            ok: true,
            status: 200,
            json: async () => {
                throw new Error("invalid json");
            },
        }),
    });
    assert.deepEqual(malformed, {
        status: "unavailable",
        reason: "provider-error",
    });
});

test("missing credentials or sessions never become provider reads", () => {
    assert.equal(
        rewardTitles.rewardReadiness({
            hasClientId: false,
            hasClientSecret: false,
            hasSession: true,
        }),
        "not-configured"
    );
    assert.equal(
        rewardTitles.rewardReadiness({
            hasClientId: true,
            hasClientSecret: true,
            hasSession: false,
        }),
        "not-connected"
    );
    assert.equal(
        rewardTitles.rewardReadiness({
            hasClientId: true,
            hasClientSecret: true,
            hasSession: true,
        }),
        "ready"
    );
    assert.deepEqual(
        rewardTitles.mapRewardTitles({ data: null }),
        []
    );
});

test("reward gate skips provider reads without stored credentials or a session", async () => {
    const twitchMissing = loadRewardGate(
        "twitch",
        { twitchClientId: "", twitchClientSecret: "", twitchUserId: "1" },
        { hasTokens: true }
    );
    assert.deepEqual(await twitchMissing.module.listTwitchRewardTitles(), {
        status: "unavailable",
        reason: "not-configured",
    });
    assert.equal(twitchMissing.calls.length, 0);
    twitchMissing.cleanup();

    const kickSignedOut = loadRewardGate(
        "kick",
        { kickClientId: "id", kickClientSecret: "secret", userId: "1" },
        { hasTokens: false }
    );
    assert.deepEqual(await kickSignedOut.module.listKickRewardTitles(), {
        status: "unavailable",
        reason: "not-connected",
    });
    assert.equal(kickSignedOut.calls.length, 0);
    kickSignedOut.cleanup();

    const twitchReady = loadRewardGate(
        "twitch",
        {
            twitchClientId: "id",
            twitchClientSecret: "secret",
            twitchUserId: "1",
        },
        { hasTokens: true }
    );
    assert.deepEqual(await twitchReady.module.listTwitchRewardTitles(), {
        status: "ok",
        rewards: [{ id: "twitch-1", title: "Song Request" }],
        titles: ["Song Request"],
    });
    assert.equal(twitchReady.calls.length, 1);
    assert.equal(twitchReady.calls[0].broadcasterId, "1");
    assert.equal(twitchReady.calls[0].accessToken, "user-token");
    twitchReady.cleanup();

    const kickReady = loadRewardGate(
        "kick",
        { kickClientId: "id", kickClientSecret: "secret", userId: "1" },
        { hasTokens: true }
    );
    assert.deepEqual(await kickReady.module.listKickRewardTitles(), {
        status: "ok",
        rewards: [{ id: "kick-1", title: "Song Request" }],
        titles: ["Song Request"],
    });
    assert.equal(kickReady.calls.length, 1);
    kickReady.cleanup();
});

test("picker state distinguishes loading, empty, ready and unavailable results", () => {
    assert.deepEqual(rewardPicker.toRewardPickerState(undefined), {
        status: "unavailable",
        rewards: [],
        titles: [],
        reason: "provider-error",
    });
    assert.deepEqual(
        rewardPicker.toRewardPickerState({ status: "ok", rewards: [] }),
        { status: "empty", rewards: [], titles: [] }
    );
    assert.deepEqual(
        rewardPicker.toRewardPickerState({
            status: "ok",
            rewards: [
                { id: "1", title: "Song Request" },
                { id: "2", title: "Song Request" },
                { id: "3", title: " VIP " },
            ],
        }),
        {
            status: "ready",
            rewards: [
                { id: "1", title: "Song Request" },
                { id: "2", title: "Song Request" },
                { id: "3", title: "VIP" },
            ],
            titles: ["Song Request", "VIP"],
        }
    );
    assert.deepEqual(
        rewardPicker.toRewardPickerState({
            status: "unavailable",
            reason: "missing-scope",
        }),
        {
            status: "unavailable",
            rewards: [],
            titles: [],
            reason: "missing-scope",
        }
    );
    assert.deepEqual(
        rewardPicker.toRewardPickerState({
            status: "ok",
            titles: ["Song Request"],
        }),
        {
            status: "unavailable",
            rewards: [],
            titles: [],
            reason: "provider-error",
        }
    );
});

test("manual titles only match an existing picker option", () => {
    assert.equal(rewardPicker.rewardPickerValue("Song Request", ["Song Request"]), "Song Request");
    assert.equal(rewardPicker.rewardPickerValue("Custom Request", ["Song Request"]), "");
    assert.equal(rewardPicker.rewardPickerValue(undefined, ["Song Request"]), "");
});

test("reward drafts stay isolated per platform and discard restores both", () => {
    let state = draft.createDraftState(
        {
            rewardTitle: "Song Request",
            rewardId: "kick-1",
            twitchRewardTitle: "Song Request",
            twitchRewardId: "twitch-1",
            saveCurrentSongToFile: true,
        },
        []
    );
    state = draft.editDraftConfig(state, "twitchRewardTitle", "VIP Song");
    state = draft.editDraftConfig(state, "twitchRewardId", "twitch-2");
    assert.equal(state.draftConfig.rewardTitle, "Song Request");
    assert.equal(state.draftConfig.rewardId, "kick-1");
    assert.equal(state.draftConfig.twitchRewardTitle, "VIP Song");
    assert.equal(state.draftConfig.twitchRewardId, "twitch-2");
    state = draft.editDraftConfig(state, "saveCurrentSongToFile", false);
    assert.equal(draft.settingsAreDirty(state), true);

    const discarded = draft.discardDraft(state);
    assert.equal(discarded.draftConfig.rewardTitle, "Song Request");
    assert.equal(discarded.draftConfig.rewardId, "kick-1");
    assert.equal(discarded.draftConfig.twitchRewardTitle, "Song Request");
    assert.equal(discarded.draftConfig.twitchRewardId, "twitch-1");
    assert.equal(discarded.draftConfig.saveCurrentSongToFile, true);
});

test("song-file controls and reward defaults follow the product rules", () => {
    assert.equal(requestsView.songFileControlsEnabled({ saveCurrentSongToFile: true }), true);
    assert.equal(requestsView.songFileControlsEnabled({ saveCurrentSongToFile: false }), false);
    assert.equal(requestsView.songFileControlsEnabled({}), false);
    assert.equal(requestsView.rewardTitleOrDefault("VIP Song"), "VIP Song");
    assert.equal(requestsView.rewardTitleOrDefault(""), "Song Request");
    assert.equal(requestsView.rewardTitleOrDefault(undefined), "Song Request");

    let state = draft.createDraftState(
        {
            saveCurrentSongToFile: true,
            currentSongFilePath: "C:\\Users\\Example\\current-song.txt",
        },
        []
    );
    state = draft.editDraftConfig(state, "saveCurrentSongToFile", false);
    state = draft.editDraftConfig(state, "saveCurrentSongToFile", true);
    assert.equal(
        state.draftConfig.currentSongFilePath,
        "C:\\Users\\Example\\current-song.txt"
    );
});

test("Requests uses Studio primitives, always-mounted file controls and matching reward labels", () => {
    const source = readSource("src/features/settings/components/sections/Requests.tsx");
    for (const component of ["SettingGroup", "Input", "Select", "Toggle", "IconButton"]) {
        assert.match(source, new RegExp(`\\b${component}\\b`), component);
    }
    assert.doesNotMatch(source, /settings-section/);
    assert.doesNotMatch(source, /<Input\s+type="password"/i);
    assert.match(source, /songFileControlsEnabled\(config\)/);
    assert.doesNotMatch(
        source,
        /customModerators|commands\.moderatorsList|requests-prefix|requests-moderator-input/
    );
    assert.match(source, /t\("requests\.chooseFilePath"\)/);
    assert.match(source, /t\("requests\.kickRewardTitle"\)/);
    assert.match(source, /t\("requests\.twitchRewardTitle"\)/);
    assert.match(source, /REWARD_ID_CONFIG_KEYS\.kick/);
    assert.match(source, /REWARD_ID_CONFIG_KEYS\.twitch/);
    assert.match(source, /REWARD_ID_CONFIG_KEYS\.kick,\s*reward\.id/);
    assert.match(source, /REWARD_ID_CONFIG_KEYS\.kick,\s*""/);
    assert.match(source, /resolution\.source === "id"/);
    assert.match(source, /rewardReselectDuplicate/);
    assert.match(source, /reselectKey/);
    assert.match(source, /saveCurrentSongToFile/);
});

test("Requests renders Studio groups, keeps the path row mounted, and labels the icon chooser", () => {
    const visible = renderRequests({
        saveCurrentSongToFile: true,
        currentSongFilePath: "C:\\Users\\Example\\current-song.txt",
        rewardTitle: "Song Request",
        rewardId: "reward-1",
        twitchRewardTitle: "Song Request",
        twitchRewardId: "reward-2",
        customModerators: ["modmira"],
    });
    assert.match(visible, /studio-settings-api/);
    assert.doesNotMatch(visible, /settings-section/);
    assert.match(visible, /requests\.kickRewardTitle/);
    assert.match(visible, /requests\.twitchRewardTitle/);
    assert.doesNotMatch(
        visible,
        /modmira|commands\.moderatorsList|commands\.addModerator|requests\.removeModerator|requests-moderator-input/
    );
    assert.match(visible, /requests\.chooseFilePath/);
    assert.match(visible, /title="requests\.chooseFilePathTitle"/);
    assert.match(visible, /data-icon-only="true"/);
    assert.match(visible, /readOnly/i);
    assert.match(visible, /role="status"/);
    const visiblePath = visible.match(/<input[^>]*id="requests-song-file-path"[^>]*>/)?.[0];
    assert.ok(visiblePath, "path row must render while file output is on");
    assert.doesNotMatch(visiblePath, /\sdisabled(=|\s|\/|>)/);

    const disabled = renderRequests({ saveCurrentSongToFile: false });
    const disabledPath = disabled.match(
        /<input[^>]*id="requests-song-file-path"[^>]*>/
    )?.[0];
    assert.ok(disabledPath, "path row must stay mounted while file output is off");
    assert.match(disabledPath, /\sdisabled(=|\s|\/|>)/);
    assert.match(disabled, /requests\.chooseFilePath/);
    const chooser = disabled.match(
        /<button[^>]*aria-label="requests\.chooseFilePath"[^>]*>/
    )?.[0];
    assert.ok(chooser, "the Choose path button must stay mounted");
    assert.match(chooser, /\sdisabled(=|\s|\/|>)/);
});

test("read-only reward handlers are allowlisted and gated before provider reads", () => {
    const { INVOKE_CHANNELS } = require("../src/shared/ipcChannels");
    assert.ok(INVOKE_CHANNELS.includes("twitch:listRewardTitles"));
    assert.ok(INVOKE_CHANNELS.includes("kick:listRewardTitles"));
    for (const file of [
        "src/features/twitch/rewards.ts",
        "src/features/kick/rewards.ts",
    ]) {
        const source = readSource(file);
        assert.match(source, /rewardReadiness/, file);
        assert.doesNotMatch(source, /method:\s*"POST"/, file);
        assert.doesNotMatch(source, /\.(create|update|delete)\w*Reward/i, file);
    }
    assert.match(
        readSource("src/features/kick/auth/server.ts"),
        /channel:rewards:read/,
        "Kick authorization must request the documented read scope"
    );
    assert.match(
        readSource("src/features/twitch/auth/server.ts"),
        /channel:read:redemptions/,
        "Twitch authorization must keep the redemption read scope"
    );
    assert.match(
        readSource("src/features/kick/chat/listener.ts"),
        /rewardId[\s\S]*rewardMatchesConfigured/,
        "Kick must gate redemptions by the saved provider ID"
    );
    assert.match(
        readSource("src/features/twitch/chat/listener.ts"),
        /twitchRewardId[\s\S]*rewardMatchesConfigured/,
        "Twitch must gate redemptions by the saved provider ID"
    );
    assert.match(
        readSource("src/features/twitch/chat/listener.ts"),
        /event\.reward\?\.id/,
        "Twitch must pass the redemption reward ID into the gate"
    );
});

test("Credential fields are confined to the password-protected setup dialog", () => {
    const secrets = readSource(
        "src/features/settings/components/sections/Secrets.tsx"
    );
    const dialog = readSource(
        "src/features/settings/components/sections/CredentialSetupDialog.tsx"
    );
    assert.doesNotMatch(secrets, /<Input/);
    assert.match(dialog, /label=\{t\("setup\.clientId"\)\}/);
    assert.match(dialog, /type="password"/);
});
