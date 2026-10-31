"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

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

const rewards = load("src/shared/rewards/rewardTitles.ts");
const picker = load("src/features/settings/rewardPicker.ts");
const draft = load("src/features/settings/components/draftState.ts");
const rendererConfig = load("src/core/config/rendererConfig.ts");

const OPTIONS = [
    { id: "reward-1", title: "Song Request" },
    { id: "reward-3", title: "Song Request" },
    { id: "reward-2", title: "VIP Song" },
];

test("reward reads retain provider IDs and duplicate titles", () => {
    const options = rewards.mapRewardOptions({
        data: [
            { id: "reward-3", title: " Song Request " },
            { id: 2, title: "VIP Song" },
            { id: "reward-1", title: "Song Request" },
            { id: "reward-1", title: "Duplicate ID" },
            { title: "Missing ID" },
            { id: "reward-4", title: "   " },
        ],
    });
    assert.deepEqual(options, [
        { id: "reward-1", title: "Song Request" },
        { id: "reward-3", title: "Song Request" },
        { id: "2", title: "VIP Song" },
    ]);
    assert.deepEqual(rewards.mapRewardTitles({
        data: [
            { id: "reward-1", title: "Song Request" },
            { id: "reward-3", title: "Song Request" },
            { id: "reward-2", title: "VIP Song" },
        ],
    }), ["Song Request", "VIP Song"]);
});

test("stable IDs take precedence over titles for incoming redemptions", () => {
    assert.equal(rewards.rewardMatchesConfigured({
        configuredId: "reward-1",
        configuredTitle: "Old display title",
        eventId: "reward-1",
        eventTitle: "Renamed reward",
    }), true);
    assert.equal(rewards.rewardMatchesConfigured({
        configuredId: "reward-1",
        configuredTitle: "Song Request",
        eventId: "reward-3",
        eventTitle: "Song Request",
    }), false);
    assert.equal(rewards.rewardMatchesConfigured({
        configuredId: "reward-1",
        configuredTitle: "Song Request",
        eventTitle: "Song Request",
    }), false, "an ID-configured selection must not fall back to a title");
});

test("legacy title-only selections continue matching by exact title", () => {
    assert.equal(rewards.rewardMatchesConfigured({
        configuredTitle: "Song Request",
        eventTitle: "Song Request",
    }), true);
    assert.equal(rewards.rewardMatchesConfigured({
        configuredTitle: "Song Request",
        eventTitle: "VIP Song",
    }), false);
});

test("legacy selections resolve uniquely, duplicate titles, or missing titles", () => {
    assert.deepEqual(
        rewards.resolveRewardSelection("", "VIP Song", OPTIONS),
        {
            status: "selected",
            source: "title",
            option: { id: "reward-2", title: "VIP Song" },
        }
    );
    assert.deepEqual(
        rewards.resolveRewardSelection("", "Song Request", OPTIONS),
        { status: "reselect", reason: "duplicate-title" }
    );
    assert.deepEqual(
        rewards.resolveRewardSelection("", "Gone", OPTIONS),
        { status: "reselect", reason: "missing-title" }
    );
    assert.deepEqual(
        rewards.resolveRewardSelection("gone", "Song Request", OPTIONS),
        { status: "reselect", reason: "missing-id" }
    );
    assert.deepEqual(
        rewards.resolveRewardSelection("reward-3", "Renamed", OPTIONS),
        {
            status: "selected",
            source: "id",
            option: { id: "reward-3", title: "Song Request" },
        }
    );
});

test("picker state retains reward IDs and never invents an ID", () => {
    assert.deepEqual(
        picker.toRewardPickerState({
            status: "ok",
            rewards: OPTIONS,
        }),
        {
            status: "ready",
            rewards: OPTIONS,
            titles: ["Song Request", "VIP Song"],
        }
    );
    assert.deepEqual(
        picker.toRewardPickerState({
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

test("selected reward ID and title persist together in drafts and save patches", () => {
    let state = draft.createDraftState({
        rewardId: "",
        rewardTitle: "Old Title",
        twitchRewardId: "",
        twitchRewardTitle: "Song Request",
    }, []);
    state = draft.editDraftConfig(state, "rewardId", "reward-1");
    state = draft.editDraftConfig(state, "rewardTitle", "Song Request");

    assert.deepEqual(draft.buildConfigSavePatch(state), {
        commands: {},
        rewardId: "reward-1",
        rewardTitle: "Song Request",
    });
    const discarded = draft.discardDraft(state);
    assert.equal(discarded.draftConfig.rewardId, "");
    assert.equal(discarded.draftConfig.rewardTitle, "Old Title");
});

test("reward ID and reselect copy exists in English and Turkish", () => {
    const en = require("../src/core/i18n/locales/en.json");
    const tr = require("../src/core/i18n/locales/tr.json");
    for (const key of [
        "rewardOptionWithId",
        "rewardReselectDuplicate",
        "rewardReselectMissingTitle",
        "rewardReselectMissingId",
    ]) {
        assert.equal(typeof en.requests[key], "string", `en missing ${key}`);
        assert.equal(typeof tr.requests[key], "string", `tr missing ${key}`);
    }
});

test("reward ID config keys are renderer-settable and bounded", () => {
    assert.deepEqual(
        rendererConfig.sanitizeConfigUpdate({
            rewardId: "reward-1",
            twitchRewardId: "reward-2",
        }),
        { rewardId: "reward-1", twitchRewardId: "reward-2" }
    );
    assert.equal(
        Object.prototype.hasOwnProperty.call(
            rendererConfig.sanitizeConfigUpdate({
                rewardId: "x".repeat(201),
            }),
            "rewardId"
        ),
        false
    );
});
