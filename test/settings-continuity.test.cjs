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
const originalCss = require.extensions[".css"];

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

function loadFresh(relativePath) {
    return load(relativePath);
}

function readSource(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function withCssStub(callback) {
    require.extensions[".css"] = () => {};
    try {
        return callback();
    } finally {
        if (originalCss) require.extensions[".css"] = originalCss;
        else delete require.extensions[".css"];
    }
}

const studio = withCssStub(() => load("src/ui/components/studio/index.ts"));
const legacyInputPath = "src/ui/components/Input.tsx";
const en = require("../src/core/i18n/locales/en.json");
const tr = require("../src/core/i18n/locales/tr.json");

function render(element) {
    return renderToStaticMarkup(element);
}

function renderStudio(name, props, ...children) {
    return withCssStub(() =>
        render(React.createElement(studio[name], props, ...children))
    );
}

function renderRequests(config) {
    return withCssStub(() => {
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
            if (request === "react-i18next") {
                return { useTranslation: () => ({ t: (key) => key }) };
            }
            return originalLoad.call(this, request, parent, isMain);
        };
        try {
            const resolved = require.resolve(
                path.join(
                    root,
                    "src/features/settings/components/sections/Requests.tsx"
                )
            );
            delete require.cache[resolved];
            const Requests = require(resolved).default;
            return render(
                React.createElement(Requests, {
                    config,
                    onConfigChange() {},
                })
            );
        } finally {
            Module._resolveFilename = originalResolve;
            Module._load = originalLoad;
        }
    });
}

function inputTag(html, id) {
    const match = html.match(
        new RegExp(`<input[^>]*id="${id}"[^>]*>`)
    );
    assert.ok(match, `missing input ${id}`);
    return match[0];
}

test("Settings navigation groups are localized in English and Turkish", () => {
    const keys = [
        "settings.groups.application",
        "settings.groups.requests",
        "settings.groups.diagnostics",
        "settings.sections",
    ];
    for (const key of keys) {
        const parts = key.split(".");
        const read = (locale) =>
            parts.reduce(
                (node, part) =>
                    node && typeof node === "object" ? node[part] : undefined,
                locale
            );
        assert.equal(typeof read(en), "string", `en missing ${key}`);
        assert.equal(typeof read(tr), "string", `tr missing ${key}`);
    }
    assert.notEqual(
        en.settings.groups.diagnostics,
        tr.settings.groups.diagnostics
    );
    assert.notEqual(en.settings.groups.requests, tr.settings.groups.requests);

    const settingsSource = readSource(
        "src/features/settings/components/Settings.tsx"
    );
    for (const key of keys) {
        assert.match(
            settingsSource,
            new RegExp(`t\\("${key.replace(/\./g, "\\.")}"\\)`),
            key
        );
    }
    assert.doesNotMatch(settingsSource, /label:\s*"Application"/);
    assert.doesNotMatch(settingsSource, /label:\s*"Requests"/);
    assert.doesNotMatch(settingsSource, /label:\s*"Diagnostics"/);
});

test("every Settings nav category uses the same Studio label treatment", () => {
    const html = renderStudio("SectionNav", {
        groups: [
            {
                id: "application",
                label: "Application",
                items: [{ id: "general", label: "General" }],
            },
            {
                id: "requests",
                label: "Requests",
                items: [{ id: "requests", label: "Song Requests" }],
            },
            {
                id: "diagnostics",
                label: "Diagnostics",
                items: [{ id: "logs", label: "Logs" }],
            },
        ],
        activeId: "general",
        onSelect() {},
        onHome() {},
        "aria-label": "Settings sections",
    });
    const labels = [
        ...html.matchAll(
            /<h3 class="studio-nav-label"[^>]*>([^<]+)<\/h3>/g
        ),
    ].map((match) => match[1]);
    assert.deepEqual(labels, ["Application", "Requests", "Diagnostics"]);
});

test("Studio and legacy Settings text controls disable spellcheck by default", () => {
    const input = renderStudio("Input", {
        id: "studio-name",
        label: "Name",
        defaultValue: "Song Request",
    });
    const textarea = renderStudio("Textarea", {
        id: "studio-notes",
        label: "Notes",
        defaultValue: "Text",
    });
    const legacy = withCssStub(() => {
        const Input = load(legacyInputPath).default;
        return render(
            React.createElement(Input, {
                label: "Legacy name",
                defaultValue: "Song Request",
            })
        );
    });

    for (const html of [input, textarea, legacy]) {
        assert.match(html, /spellCheck="false"/);
        assert.match(html, /autoCorrect="off"/);
        assert.match(html, /autoCapitalize="off"/);
    }

    const overridden = renderStudio("Input", {
        id: "studio-override",
        label: "Code",
        spellCheck: true,
    });
    assert.match(overridden, /spellCheck="true"/);
});

test("Requests raw inputs also disable spellcheck and autocorrect", () => {
    const html = renderRequests({
        saveCurrentSongToFile: true,
        currentSongFilePath: "C:\\Users\\Example\\current-song.txt",
        customModerators: ["modmira"],
        globalCooldownEnabled: true,
        perUserCooldownEnabled: true,
    });
    for (const id of [
        "requests-song-file-path",
        "requests-global-cooldown-seconds",
        "requests-per-user-cooldown-seconds",
    ]) {
        const tag = inputTag(html, id);
        assert.match(tag, /spellCheck="false"/, id);
        assert.match(tag, /autoCorrect="off"/, id);
        assert.match(tag, /autoCapitalize="off"/, id);
    }
});

test("Studio inputs have one focus border while buttons and toggles keep their outline", () => {
    const css = readSource("src/ui/components/studio/studio.css");
    const generic = css.match(
        /\.studio :is\(([^\n]+)\):focus-visible\s*\{([^}]*)\}/
    );
    assert.ok(generic, "generic Studio focus-visible rule must exist");
    assert.doesNotMatch(generic[1], /\binput\b|\bselect\b|\btextarea\b/);
    assert.match(generic[1], /\.studio-toggle/);
    assert.match(generic[1], /\[tabindex\]:not\(\.studio-settings-title\)/);
    assert.match(generic[2], /outline:\s*2px solid var\(--studio-focus\)/);

    const inputFocus = css.match(/\.studio-input:focus\s*\{([^}]*)\}/);
    assert.ok(inputFocus, "input focus rule must exist");
    assert.match(inputFocus[1], /outline:\s*none/);
    assert.match(inputFocus[1], /border-color:\s*var\(--studio-accent\)/);
    assert.match(inputFocus[1], /box-shadow/);

    const errorFocus = css.match(
        /\.studio-input\[aria-invalid="true"\]:focus\s*\{([^}]*)\}/
    );
    assert.ok(errorFocus, "error focus rule must exist");
    assert.match(errorFocus[1], /box-shadow/);

    const motion = readSource("src/ui/components/studio/motion.css");
    assert.match(motion, /prefers-reduced-motion:\s*reduce/);
    assert.match(motion, /animation:\s*none\s*!important/);
});

test("Settings visibility keeps the panel mounted when Home is shown", () => {
    const visibility = load("src/renderer/settingsVisibility.ts");
    let state = visibility.INITIAL_SETTINGS_VISIBILITY;
    assert.equal(state.mounted, false);
    assert.equal(state.open, false);

    state = visibility.openSettingsView(state);
    assert.deepEqual(state, { mounted: true, open: true });
    state = visibility.closeSettingsView(state);
    assert.deepEqual(state, { mounted: true, open: false });
    state = visibility.openSettingsView(state);
    assert.deepEqual(state, { mounted: true, open: true });
    state = visibility.toggleSettingsView(state);
    assert.deepEqual(state, { mounted: true, open: false });
    state = visibility.toggleSettingsView(state);
    assert.deepEqual(state, { mounted: true, open: true });
});

test("App mounts Settings once, hides it at Home, and initializes the shared status store", () => {
    const app = readSource("src/renderer/App.tsx");
    assert.match(app, /settingsVisibility\.mounted/);
    assert.match(app, /hidden=\{!settingsVisibility\.open\}/);
    assert.match(app, /active=\{settingsVisibility\.open\}/);
    assert.match(app, /initializeCredentialStatusStore/);
    assert.doesNotMatch(app, /\{showSettings \?/);
});

function mockBridge(handlers) {
    const calls = [];
    return {
        calls,
        invoke: async (channel, data) => {
            calls.push({ channel, data });
            const handler = handlers[channel];
            return typeof handler === "function" ? handler(data) : handler;
        },
    };
}

const CONFIG = {
    spotifyClientId: "spotify-id",
    kickClientId: "kick-id",
    twitchClientId: "twitch-id",
};

test("startup snapshot reads config and stored flags without requesting secrets", async () => {
    const store = loadFresh("src/features/settings/credentialStatusStore.ts");
    const bridge = mockBridge({
        "config:get": CONFIG,
        "spotify:hasSecrets": true,
        "kick:hasSecrets": false,
        "twitch:hasSecrets": true,
    });
    const snapshot = await store.loadStoredCredentialSnapshot(bridge);

    assert.deepEqual(snapshot.storedSecrets, {
        spotify: true,
        kick: false,
        twitch: true,
    });
    assert.deepEqual(snapshot.clientIds, {
        spotify: "spotify-id",
        kick: "kick-id",
        twitch: "twitch-id",
    });
    assert.deepEqual(
        bridge.calls.map((call) => call.channel).sort(),
        [
            "config:get",
            "kick:hasSecrets",
            "spotify:hasSecrets",
            "twitch:hasSecrets",
        ]
    );
    assert.equal(
        bridge.calls.some((call) =>
            Object.keys(call.data || {}).some((key) =>
                key.endsWith("ClientSecret")
            )
        ),
        false
    );
    assert.deepEqual(
        store.initialCredentialStatuses(snapshot),
        {
            spotify: "unverified",
            kick: "needs-credentials",
            twitch: "unverified",
        },
        "stored pairs start Unverified until the startup check completes"
    );
});

test("startup verification checks only stored pairs and never sends stored secrets", async () => {
    const store = loadFresh("src/features/settings/credentialStatusStore.ts");
    const seen = [];
    const bridge = mockBridge({
        "spotify:verifySecrets": { success: true },
        "twitch:verifySecrets": {
            success: false,
            code: "invalid_credentials",
        },
    });
    const snapshot = {
        clientIds: {
            spotify: "spotify-id",
            kick: "kick-id",
            twitch: "twitch-id",
        },
        storedSecrets: { spotify: true, kick: false, twitch: true },
    };
    const statuses = await store.verifyStoredCredentials(
        bridge,
        snapshot,
        (id, status) => seen.push([id, status])
    );

    assert.deepEqual(statuses, {
        spotify: "verified",
        kick: "needs-credentials",
        twitch: "verification-failed",
    });
    assert.deepEqual(
        seen.filter(([id]) => id === "spotify"),
        [
            ["spotify", "verifying"],
            ["spotify", "verified"],
        ]
    );
    assert.deepEqual(
        seen.filter(([id]) => id === "twitch"),
        [
            ["twitch", "verifying"],
            ["twitch", "verification-failed"],
        ]
    );
    for (const call of bridge.calls) {
        assert.match(call.channel, /:verifySecrets$/);
        assert.equal(
            Object.keys(call.data).some((key) =>
                key.endsWith("ClientSecret")
            ),
            false
        );
    }
    assert.equal(
        bridge.calls.some((call) => call.channel.startsWith("kick:")),
        false
    );

    const noStore = loadFresh(
        "src/features/settings/credentialStatusStore.ts"
    );
    const emptyBridge = mockBridge({});
    const emptyStatuses = await noStore.verifyStoredCredentials(
        emptyBridge,
        {
            clientIds: { spotify: "", kick: "", twitch: "" },
            storedSecrets: { spotify: false, kick: false, twitch: false },
        }
    );
    assert.deepEqual(emptyStatuses, {
        spotify: "needs-credentials",
        kick: "needs-credentials",
        twitch: "needs-credentials",
    });
    assert.equal(emptyBridge.calls.length, 0);
});

test("startup verification maps provider failures to unavailable without raw errors", async () => {
    const store = loadFresh("src/features/settings/credentialStatusStore.ts");
    const bridge = mockBridge({
        "spotify:verifySecrets": () => {
            throw new Error("provider secret detail");
        },
        "twitch:verifySecrets": { success: false, code: "verification_unavailable" },
    });
    const statuses = await store.verifyStoredCredentials(bridge, {
        clientIds: {
            spotify: "spotify-id",
            kick: "",
            twitch: "twitch-id",
        },
        storedSecrets: { spotify: true, kick: false, twitch: true },
    });
    assert.equal(statuses.spotify, "verification-unavailable");
    assert.equal(statuses.twitch, "verification-unavailable");
    assert.doesNotMatch(JSON.stringify(statuses), /provider secret detail/);
});

test("shared credential status cache survives consumers and marks new saves", async () => {
    const store = loadFresh("src/features/settings/credentialStatusStore.ts");
    let notifications = 0;
    const unsubscribe = store.subscribeCredentialStatuses(() => {
        notifications += 1;
    });
    const bridge = mockBridge({
        "config:get": CONFIG,
        "spotify:hasSecrets": true,
        "kick:hasSecrets": false,
        "twitch:hasSecrets": false,
        "spotify:verifySecrets": { success: true },
    });

    await store.initializeCredentialStatusStore(bridge);
    let snapshot = store.getCredentialStatusSnapshot();
    assert.equal(snapshot.ready, true);
    assert.equal(snapshot.statuses.spotify, "verified");
    assert.equal(snapshot.statuses.kick, "needs-credentials");
    assert.equal(snapshot.storedSecrets.spotify, true);
    assert.ok(notifications > 0);

    store.markCredentialSaved("kick", "kick-new-id");
    snapshot = store.getCredentialStatusSnapshot();
    assert.equal(snapshot.statuses.kick, "verified");
    assert.equal(snapshot.baselineStatuses.kick, "verified");
    assert.equal(snapshot.storedSecrets.kick, true);
    assert.equal(snapshot.clientIds.kick, "kick-new-id");

    const verifyCalls = bridge.calls.filter(
        (call) => call.channel === "spotify:verifySecrets"
    ).length;
    await store.initializeCredentialStatusStore(bridge);
    assert.equal(
        bridge.calls.filter(
            (call) => call.channel === "spotify:verifySecrets"
        ).length,
        verifyCalls,
        "the store must initialize once per app session"
    );
    unsubscribe();
});

test("one-service retry verifies a stored pair without sending the secret", async () => {
    const store = loadFresh("src/features/settings/credentialStatusStore.ts");
    const verifyPayloads = [];
    const bridge = mockBridge({
        "config:get": { spotifyClientId: "stored-id", kickClientId: "", twitchClientId: "" },
        "spotify:hasSecrets": true,
        "kick:hasSecrets": false,
        "twitch:hasSecrets": false,
        "spotify:verifySecrets": (payload) => {
            verifyPayloads.push(payload);
            return verifyPayloads.length === 1
                ? { success: false, code: "verification_unavailable" }
                : { success: true };
        },
    });

    await store.initializeCredentialStatusStore(bridge);
    assert.equal(
        store.getCredentialStatusSnapshot().statuses.spotify,
        "verification-unavailable"
    );

    const retried = await store.retryStoredCredentialVerification(
        bridge,
        "spotify"
    );
    assert.equal(retried, "verified");
    const snapshot = store.getCredentialStatusSnapshot();
    assert.equal(snapshot.statuses.spotify, "verified");
    assert.equal(snapshot.baselineStatuses.spotify, "verified");
    assert.equal(snapshot.storedSecrets.spotify, true);
    assert.equal(verifyPayloads.length, 2);
    for (const payload of verifyPayloads) {
        assert.deepEqual(payload, { spotifyClientId: "stored-id" });
        assert.equal(
            Object.keys(payload).some((key) => key.endsWith("ClientSecret")),
            false
        );
    }
});

test("API Keys consumes the shared status cache and one-service retry", () => {
    const secrets = readSource(
        "src/features/settings/components/sections/Secrets.tsx"
    );
    const dialog = readSource(
        "src/features/settings/components/sections/CredentialSetupDialog.tsx"
    );
    assert.match(secrets, /useCredentialStatuses/);
    assert.match(secrets, /credentialStatuses\.statuses/);
    assert.match(secrets, /credentialStatuses\.storedSecrets/);
    assert.match(secrets, /markCredentialSaved/);
    assert.match(secrets, /retryStoredCredentialVerification/);
    assert.match(secrets, /active/);
    assert.match(secrets, /if \(!active\) setDialog\(null\)/);
    assert.doesNotMatch(secrets, /useSecretsSection|statusOverrides/);
    assert.match(dialog, /saveServiceSecrets/);
});
