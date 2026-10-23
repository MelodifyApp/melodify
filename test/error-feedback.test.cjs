"use strict";

/**
 * Error-feedback regressions: accessible, red, subtly animated in-app errors
 * for the service cards and Settings > Secrets. Native alert() dialogs must
 * not come back, and no raw service/error/input text may be displayed.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const ROOT = path.join(__dirname, "..");

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function loadInlineError() {
    const module = require("../src/ui/components/InlineError");
    return module.default ?? module;
}

test("InlineError renders nothing when there is no message", () => {
    const InlineError = loadInlineError();
    for (const message of [undefined, null, "", "   "]) {
        assert.equal(
            renderToStaticMarkup(React.createElement(InlineError, { message })),
            ""
        );
    }
});

test("InlineError renders an accessible red alert with a subtle entrance", () => {
    const InlineError = loadInlineError();
    const html = renderToStaticMarkup(
        React.createElement(InlineError, { message: "Please enter a valid Client ID" })
    );

    assert.match(html, /role="alert"/);
    assert.match(html, /aria-live="assertive"/);
    assert.match(html, /aria-atomic="true"/);
    assert.match(html, /inline-error/);
    assert.match(html, /text-red-\d{3}/);
    assert.match(html, /border-red-500\/40/);
    assert.match(html, /bg-red-500\/10/);
    assert.match(html, /Please enter a valid Client ID/);
});

test("InlineError escapes unsafe message text", () => {
    const InlineError = loadInlineError();
    const html = renderToStaticMarkup(
        React.createElement(InlineError, {
            message: '<img src=x onerror="alert(1)">',
        })
    );

    assert.doesNotMatch(html, /<img/);
    assert.match(html, /&lt;img/);
});

test("error animation is a short single entrance disabled by reduced motion", () => {
    const css = read("src/renderer/globals.css");
    const rule = css.match(/\.inline-error\s*\{[^}]*\}/);
    assert.ok(rule, "globals.css must define the .inline-error entrance");

    const animation = rule[0].match(/animation\s*:\s*([^;]+);/);
    assert.ok(animation, "the rule must declare an animation");
    assert.doesNotMatch(animation[1], /infinite/);
    const duration = animation[1].match(/(\d+(?:\.\d+)?)\s*(ms|s)\b/);
    assert.ok(duration, "the animation must declare a duration");
    const ms =
        duration[2] === "s" ? Number(duration[1]) * 1000 : Number(duration[1]);
    assert.ok(ms > 0 && ms <= 400, `entrance should be short, got ${ms}ms`);
    assert.doesNotMatch(animation[1], /shake|flash|pulse|blink/i);

    assert.match(
        css,
        /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.inline-error\s*\{[^}]*animation\s*:\s*none/
    );

    // Helper-text errors reuse the same entrance without changing their layout.
    const motionRule = css.match(/\.error-motion\s*\{[^}]*\}/);
    assert.ok(motionRule, "globals.css must define the .error-motion class");
    assert.match(motionRule[0], /animation\s*:[^;]*160ms[^;]*;/);
    assert.doesNotMatch(motionRule[0], /infinite|shake|flash|pulse|blink/i);
});

const CARDS = [
    "src/features/spotify/components/SpotifyCard.tsx",
    "src/features/kick/components/KickCard.tsx",
    "src/features/twitch/components/TwitchCard.tsx",
];

test("service cards use in-app feedback instead of native alerts", () => {
    for (const relativePath of CARDS) {
        const source = read(relativePath);
        const name = path.basename(relativePath);

        assert.doesNotMatch(source, /\balert\s*\(/, `${name} still calls alert()`);
        assert.match(
            source,
            /import CredentialSetupFeedback from "@\/ui\/components\/CredentialSetupFeedback"/,
            `${name} must import the shared feedback slot`
        );
        assert.match(source, /<CredentialSetupFeedback/, `${name} must render feedback`);
        // Exactly one slot is visible: body when closed, overlay when open.
        assert.match(source, /visible=\{!(?:showSetup|setup\.showSetup)\}/);
        assert.match(source, /visible=\{(?:showSetup|setup\.showSetup)\}/);
    }

    // Spotify keeps its lifecycle in the headless-tested hook.
    const spotifyHook = read(
        "src/features/spotify/components/useSpotifyCredentialSetup.ts"
    );
    assert.match(read(CARDS[0]), /useSpotifyCredentialSetup\(/);
    assert.match(spotifyHook, /setError\(null\)/);
    assert.match(spotifyHook, /setError\(translate\("common\.pleaseCompleteFields"\)\)/);
    assert.match(spotifyHook, /setError\(translate\("common\.secretsRequired"\)\)/);

    // Kick/Twitch keep local state but report the same translated copy.
    for (const relativePath of CARDS.slice(1)) {
        const source = read(relativePath);
        assert.match(source, /setError\(t\("common\.pleaseCompleteFields"\)\)/);
        assert.match(source, /setError\(t\("common\.secretsRequired"\)\)/);
        assert.match(source, /setError\(null\)/);
    }
});

test("Spotify credentials submit through the safe outcome helper", async () => {
    const view = require("../src/features/spotify/components/spotifyCredentialView");
    const { submitSpotifyCredentials } = view;

    const calls = [];
    const invoke = async (channel, payload) => {
        calls.push([channel, payload]);
        return { success: true };
    };
    assert.deepEqual(
        await submitSpotifyCredentials(invoke, {
            spotifyClientId: "id",
            spotifyClientSecret: "secret",
        }),
        { ok: true }
    );
    assert.deepEqual(calls, [
        ["spotify:setSecrets", { spotifyClientId: "id", spotifyClientSecret: "secret" }],
    ]);

    const invalid = await submitSpotifyCredentials(
        async () => ({ success: false, code: "invalid_credentials" }),
        { spotifyClientId: "id", spotifyClientSecret: "secret" }
    );
    assert.deepEqual(invalid, {
        ok: false,
        messageKey: "common.invalidCredentials",
    });

    const unavailable = await submitSpotifyCredentials(
        async () => ({ success: false, code: "verification_unavailable" }),
        { spotifyClientId: "id", spotifyClientSecret: "secret" }
    );
    assert.deepEqual(unavailable, {
        ok: false,
        messageKey: "common.verificationUnavailable",
    });

    for (const malformed of [undefined, null, {}, { success: false }]) {
        assert.deepEqual(
            await submitSpotifyCredentials(async () => malformed, {
                spotifyClientId: "id",
                spotifyClientSecret: "secret",
            }),
            { ok: false, messageKey: "common.secretsSaveError" }
        );
    }

    const rejected = await submitSpotifyCredentials(
        async () => {
            throw new Error("network down");
        },
        { spotifyClientId: "id", spotifyClientSecret: "secret" }
    );
    assert.deepEqual(rejected, {
        ok: false,
        messageKey: "common.verificationUnavailable",
    });

    // Raw service text or submitted values never reach the UI payload.
    const serialized = JSON.stringify([invalid, unavailable, rejected]);
    assert.doesNotMatch(
        serialized,
        /network down|invalid_client|spotifyClientSecret|client-secret/
    );
});

test("Settings > Secrets treats every failure status as a red error", () => {
    const {
        isSecretErrorStatus,
        secretStatusMessageKey,
    } = require("../src/features/settings/secretsSave");

    for (const status of ["required", "failed", "invalid", "unavailable"]) {
        assert.equal(isSecretErrorStatus(status), true, status);
        assert.equal(typeof secretStatusMessageKey(status), "string", status);
    }
    for (const status of ["idle", "saving", "saved"]) {
        assert.equal(isSecretErrorStatus(status), false, status);
    }

    const source = read("src/features/settings/components/sections/Secrets.tsx");
    assert.match(source, /InlineError/);
    assert.match(source, /isSecretErrorStatus/);
    assert.match(source, /role="status"/);
    assert.doesNotMatch(source, /\balert\s*\(/);
});

test("Input shows real validation errors as alerting, animated helper text", () => {
    const Module = require("node:module");
    const originalLoad = Module._load;
    let Input;
    try {
        Module._load = function (request, parent, isMain) {
            if (request === "@/shared/utils") {
                return {
                    cn: (...values) =>
                        values.filter((value) => typeof value === "string" && value).join(" "),
                };
            }
            return originalLoad.call(this, request, parent, isMain);
        };
        const resolved = require.resolve("../src/ui/components/Input");
        delete require.cache[resolved];
        Input = require(resolved).default;
    } finally {
        Module._load = originalLoad;
    }

    const errorHtml = renderToStaticMarkup(
        React.createElement(Input, {
            error: true,
            helperText: "Client ID appears to be too short",
            maxLength: 100,
            showCharacterCount: true,
            value: "abc",
            onChange: () => {},
        })
    );
    assert.match(errorHtml, /role="alert"/);
    assert.match(errorHtml, /aria-live="assertive"/);
    assert.match(errorHtml, /aria-atomic="true"/);
    assert.match(errorHtml, /aria-invalid="true"/);
    assert.match(errorHtml, /aria-describedby="[^"]+"/);
    assert.match(errorHtml, /error-motion/);
    assert.match(errorHtml, /text-red-400/);
    assert.match(errorHtml, /Client ID appears to be too short/);
    // Layout/character count preserved.
    assert.match(errorHtml, /3\/100/);

    const normalHtml = renderToStaticMarkup(
        React.createElement(Input, {
            helperText: "Client ID can only contain letters",
            value: "abc",
            onChange: () => {},
        })
    );
    assert.doesNotMatch(normalHtml, /role="alert"/);
    assert.doesNotMatch(normalHtml, /error-motion/);
    assert.doesNotMatch(normalHtml, /aria-invalid/);
    assert.match(normalHtml, /text-zinc-400/);

    const emptyErrorHtml = renderToStaticMarkup(
        React.createElement(Input, { error: true, value: "" })
    );
    assert.doesNotMatch(emptyErrorHtml, /role="alert"/);
    assert.doesNotMatch(emptyErrorHtml, /error-motion/);
});

test("General renders updater errors with the shared error treatment", () => {
    const source = read("src/features/settings/components/sections/General.tsx");
    assert.match(source, /import InlineError from "@\/ui\/components\/InlineError"/);
    assert.match(
        source,
        /status === "error"[\s\S]*?<InlineError[\s\S]*?general\.errorDownloading/
    );
    // Render-only check: this test never invokes the updater or the bridge.
    assert.match(source, /useUpdateStatus\(\)/);
});

test("failed credential saves keep drafts with mocked bridges only", async () => {
    const {
        saveServiceSecrets,
    } = require("../src/features/settings/secretsSave");
    const drafts = { spotifyClientSecret: "draft-secret" };
    const config = { spotifyClientId: "client-id" };

    const invalid = await saveServiceSecrets(
        "spotify",
        config,
        drafts,
        {
            invoke: async () => ({ success: false, code: "invalid_credentials" }),
            send: () => {
                throw new Error("send must not be used for spotify");
            },
        }
    );
    assert.deepEqual(invalid, { ok: false, error: "invalid", drafts });

    const rejected = await saveServiceSecrets("spotify", config, drafts, {
        invoke: async () => {
            throw new Error("ipc unavailable");
        },
        send: () => {
            throw new Error("send must not be used for spotify");
        },
    });
    assert.deepEqual(rejected, { ok: false, error: "unavailable", drafts });

    // Only the status code is surfaced; the draft value stays local state.
    assert.equal(invalid.error, "invalid");
    assert.equal(rejected.error, "unavailable");
    assert.equal(
        JSON.stringify([invalid.error, rejected.error]).includes("draft-secret"),
        false
    );
});

function loadHook(relativePath, hookName) {
    const Module = require("node:module");
    const originalLoad = Module._load;
    const runtime = { slots: [], cursor: 0 };
    const fakeReact = {
        useState(initial) {
            const index = runtime.cursor++;
            if (!(index in runtime.slots)) {
                runtime.slots[index] =
                    typeof initial === "function" ? initial() : initial;
            }
            return [
                runtime.slots[index],
                (next) => {
                    runtime.slots[index] =
                        typeof next === "function"
                            ? next(runtime.slots[index])
                            : next;
                },
            ];
        },
    };
    let hookModule;
    try {
        Module._load = function (request, parent, isMain) {
            if (request === "react") return fakeReact;
            return originalLoad.call(this, request, parent, isMain);
        };
        const resolved = require.resolve(path.join(__dirname, "..", relativePath));
        delete require.cache[resolved];
        hookModule = require(resolved);
    } finally {
        Module._load = originalLoad;
    }
    const run = (props) => {
        runtime.cursor = 0;
        return hookModule[hookName](props);
    };
    return { run };
}

test("Spotify setup hook drives the full error lifecycle", async () => {
    const { run } = loadHook(
        "src/features/spotify/components/useSpotifyCredentialSetup.ts",
        "useSpotifyCredentialSetup"
    );
    const calls = [];
    let saved = 0;
    let auth = 0;
    const options = (overrides = {}) => ({
        translate: (key) => key,
        hasSecrets: false,
        requestAuth: () => {
            auth += 1;
        },
        onSaved: () => {
            saved += 1;
        },
        invoke: async (channel, payload) => {
            calls.push([channel, payload]);
            return { success: false, code: "invalid_credentials" };
        },
        ...overrides,
    });

    let base = options();
    let api = run(base);
    assert.equal(api.showSetup, false);
    assert.equal(api.error, null);

    // Save with empty fields is refused before any IPC.
    await api.submit();
    api = run(base);
    assert.equal(api.error, "common.pleaseCompleteFields");
    assert.deepEqual(calls, []);

    // Opening clears stale state; typing clears errors.
    api.openSetup();
    api = run(base);
    assert.equal(api.showSetup, true);
    api.changeClientId("bad-id");
    api = run(base);
    api.changeClientSecret("bad-secret");
    api = run(base);
    assert.equal(api.error, null);

    // A rejected credential keeps the typed values and shows the mapped copy.
    await api.submit();
    api = run(base);
    assert.equal(api.error, "common.invalidCredentials");
    assert.equal(api.clientId, "bad-id");
    assert.equal(api.clientSecret, "bad-secret");
    assert.equal(api.showSetup, true);
    assert.deepEqual(calls, [
        [
            "spotify:setSecrets",
            { spotifyClientId: "bad-id", spotifyClientSecret: "bad-secret" },
        ],
    ]);

    // Editing the ID clears the stale error (root review item).
    api.changeClientId("better-id");
    api = run(base);
    assert.equal(api.error, null);
    assert.equal(api.clientId, "better-id");

    // Cancel clears and closes; reopening starts clean.
    api.cancelSetup();
    api = run(base);
    assert.equal(api.showSetup, false);
    assert.equal(api.error, null);
    api.openSetup();
    api = run(base);
    assert.equal(api.showSetup, true);
    assert.equal(api.error, null);

    // A rejected invoke reports the connectivity guidance and retains input.
    const rejecting = options({
        invoke: async () => {
            throw new Error("network down");
        },
    });
    api.changeClientId("id-2");
    api = run(rejecting);
    api.changeClientSecret("secret-2");
    api = run(rejecting);
    await api.submit();
    api = run(rejecting);
    assert.equal(api.error, "common.verificationUnavailable");
    assert.equal(api.clientId, "id-2");
    assert.equal(api.clientSecret, "secret-2");

    // Success clears values, closes the overlay and reports the save.
    const success = options({ invoke: async () => ({ success: true }) });
    api = run(success);
    await api.submit();
    api = run(success);
    assert.equal(api.error, null);
    assert.equal(api.clientId, "");
    assert.equal(api.clientSecret, "");
    assert.equal(api.showSetup, false);
    assert.equal(saved, 1);

    // Login without secrets shows the required copy and never authorizes.
    const noSecrets = options({ hasSecrets: false });
    api = run(noSecrets);
    api.login();
    api = run(noSecrets);
    assert.equal(api.error, "common.secretsRequired");
    assert.equal(auth, 0);

    const withSecrets = options({ hasSecrets: true });
    api = run(withSecrets);
    api.login();
    api = run(withSecrets);
    assert.equal(api.error, null);
    assert.equal(auth, 1);
});

test("only the visible slot announces the setup error", () => {
    const Feedback =
        require("../src/ui/components/CredentialSetupFeedback").default;
    const render = (message, showSetup) =>
        renderToStaticMarkup(
            React.createElement(
                React.Fragment,
                null,
                React.createElement(Feedback, {
                    message,
                    visible: !showSetup,
                    className: "mt-2",
                }),
                React.createElement(Feedback, {
                    message,
                    visible: showSetup,
                    className: "mb-2",
                })
            )
        );
    const alerts = (html) => (html.match(/role="alert"/g) ?? []).length;

    assert.equal(alerts(render("boom", false)), 1);
    assert.equal(alerts(render("boom", true)), 1);
    assert.equal(alerts(render(null, false)), 0);
    assert.equal(alerts(render(null, true)), 0);
    // The closed-state slot must not render underneath an open overlay.
    assert.equal(render("boom", true).includes("mt-2"), false);
    assert.equal(render("boom", false).includes("mb-2"), false);
});

test("Secrets section hook clears stale errors and keeps drafts on failure", async () => {
    const { run } = loadHook(
        "src/features/settings/useSecretsSection.ts",
        "useSecretsSection"
    );
    const clientIdChanges = [];
    const saveCalls = [];
    const options = (overrides = {}) => ({
        validate: (key, value) => (value.trim().length === 0 ? "required" : null),
        onClientIdChange: (key, value) => clientIdChanges.push([key, value]),
        save: async (serviceId, drafts) => {
            saveCalls.push([serviceId, drafts]);
            return { ok: false, error: "invalid", drafts };
        },
        ...overrides,
    });

    let base = options();
    let api = run(base);
    assert.deepEqual(api.drafts, {});
    assert.deepEqual(api.statuses, {});

    // Typing a secret keeps it in the draft and clears the status.
    api.editField("spotify", "spotifyClientSecret", "draft", true);
    api = run(base);
    assert.deepEqual(api.drafts, { spotifyClientSecret: "draft" });
    assert.equal(api.statuses.spotify, "idle");

    // Failed save keeps the draft and reports the mapped status.
    await api.saveService("spotify");
    api = run(base);
    assert.equal(api.statuses.spotify, "invalid");
    assert.deepEqual(api.drafts, { spotifyClientSecret: "draft" });
    assert.deepEqual(saveCalls[0][1], { spotifyClientSecret: "draft" });

    // Editing the CLIENT ID clears that service's stale error (root item 2).
    api.editField("spotify", "spotifyClientId", "client-id", false);
    api = run(base);
    assert.equal(api.statuses.spotify, "idle");
    assert.deepEqual(clientIdChanges, [["spotifyClientId", "client-id"]]);

    // Local validation errors surface and clear as the input is corrected.
    api.editField("spotify", "spotifyClientId", "", false);
    api = run(base);
    assert.equal(api.validationErrors.spotifyClientId, "required");
    api.editField("spotify", "spotifyClientId", "ok", false);
    api = run(base);
    assert.equal(api.validationErrors.spotifyClientId, null);

    // Success clears the drafts and reports saved.
    const success = options({
        save: async () => ({ ok: true, drafts: {} }),
    });
    api = run(success);
    await api.saveService("spotify");
    api = run(success);
    assert.equal(api.statuses.spotify, "saved");
    assert.deepEqual(api.drafts, {});
});
