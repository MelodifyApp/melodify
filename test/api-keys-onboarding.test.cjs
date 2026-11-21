"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) =>
    fs.readFileSync(path.join(root, relativePath), "utf8");
const en = require("../src/core/i18n/locales/en.json");
const tr = require("../src/core/i18n/locales/tr.json");

test("credential cards map store states without flashing Unverified", () => {
    const {
        credentialCardView,
    } = require("../src/features/settings/credentialCardState");

    const cases = [
        [undefined, false, true, "not-set-up", "needed", "common.notSetUp", "set-up"],
        [undefined, true, false, "checking", "verifying", "common.checking", null],
        ["unverified", true, true, "checking", "verifying", "common.checking", null],
        ["verifying", true, true, "checking", "verifying", "common.checking", null],
        ["verified", true, true, "connected", "verified", "common.credentialsSaved", "replace"],
        [
            "verification-failed",
            true,
            true,
            "verification-failed",
            "failed",
            "common.couldntVerify",
            "update",
        ],
        [
            "verification-unavailable",
            true,
            true,
            "verification-unavailable",
            "unavailable",
            "common.couldntReachProvider",
            "try-again",
        ],
        ["verification-unavailable", false, true, "not-set-up", "needed", "common.notSetUp", "set-up"],
    ];
    for (const [status, stored, ready, state, chipStatus, labelKey, action] of cases) {
        assert.deepEqual(
            credentialCardView(status, stored, ready),
            { state, chipStatus, labelKey, action },
            `${String(status)} stored=${stored} ready=${ready}`
        );
    }
});

test("Connect failures map to accurate dialog messages", () => {
    const {
        connectErrorMessageKey,
    } = require("../src/features/settings/connectErrorMessage");
    assert.equal(connectErrorMessageKey("required"), "common.pleaseCompleteFields");
    assert.equal(connectErrorMessageKey("invalid"), "common.invalidCredentials");
    assert.equal(
        connectErrorMessageKey("unavailable"),
        "common.verificationUnavailable"
    );
    assert.equal(
        connectErrorMessageKey("persistence"),
        "common.secretsPersistenceError"
    );
    assert.equal(connectErrorMessageKey("failed"), "common.secretsSaveError");
    assert.equal(connectErrorMessageKey(undefined), "common.secretsSaveError");
});

test("API Keys cards are state-only with one action and purpose copy", () => {
    const secrets = read(
        "src/features/settings/components/sections/Secrets.tsx"
    );
    const card = read("src/ui/components/studio/ServiceCard.tsx");
    const css = read("src/ui/components/studio/studio.css");

    assert.match(secrets, /credentialCardView/);
    assert.match(secrets, /<ServiceCard/);
    assert.match(secrets, /description=\{t\(purposeKey\)\}/);
    assert.doesNotMatch(secrets, /\bInput\b/);
    assert.doesNotMatch(secrets, /verifyService|saveService\(|cancelService/);
    assert.doesNotMatch(secrets, /common\.(verifyCredentials|save|cancel|setupGuide)/);
    assert.doesNotMatch(secrets, /showNote|studio-service-note|remember|secretDrafts/);
    assert.doesNotMatch(secrets, /useSecretsSection/);
    assert.match(secrets, /home\.connections\.(spotifyRole|kickRole|twitchRole)/);

    assert.match(card, /description\?:/);
    assert.match(card, /\{children && <div className="studio-service-fields">/);
    assert.match(card, /studio-service-purpose/);
    assert.match(css, /\.studio-service-head \+ \.studio-service-actions/);
});

test("Setup dialog is a real two-step focused flow with in-dialog connect", () => {
    const dialog = read(
        "src/features/settings/components/sections/CredentialSetupDialog.tsx"
    );
    const secrets = read(
        "src/features/settings/components/sections/Secrets.tsx"
    );

    assert.match(dialog, /role="dialog"/);
    assert.match(dialog, /aria-modal="true"/);
    assert.match(dialog, /aria-labelledby/);
    assert.match(dialog, /studio-credential-stepper/);
    assert.match(dialog, /aria-current=\{step === 1 \? "step"/);
    assert.match(dialog, /common\.setupStepCreate/);
    assert.match(dialog, /common\.setupStepRedirect/);
    assert.match(dialog, /common\.copy/);
    assert.match(dialog, /common\.copied/);
    assert.match(dialog, /common\.continue/);
    assert.match(dialog, /common\.back/);
    assert.match(dialog, /common\.credentialsVerifiedOnConnect/);
    assert.match(dialog, /saveServiceSecrets\(/);
    assert.match(dialog, /loading=\{busy\}/);
    assert.match(dialog, /disabled=\{!canConnect \|\| busy\}/);
    assert.match(dialog, /type="password"/);
    assert.match(dialog, /InlineError/);
    assert.match(dialog, /Escape/);
    assert.match(dialog, /previousFocus/);
    assert.match(dialog, /addEventListener\("keydown"/);
    assert.match(dialog, /onMouseDown/);

    assert.match(secrets, /CredentialSetupDialog/);
    assert.match(secrets, /markCredentialSaved/);
    assert.match(secrets, /retryStoredCredentialVerification/);
    assert.match(secrets, /onCredentialsSaved/);
});

test("card secondary and ghost actions retain visible control surfaces", () => {
    const css = read("src/ui/components/studio/studio.css");
    const secondary =
        css.match(
            /\.studio-service-actions \.studio-button\[data-variant="secondary"\]\s*\{([^}]*)\}/s
        )?.[1] ?? "";
    const ghost =
        css.match(
            /\.studio-service-actions \.studio-button\[data-variant="ghost"\]\s*\{([^}]*)\}/s
        )?.[1] ?? "";
    assert.match(secondary, /background-color:/);
    assert.match(secondary, /border-color:/);
    assert.match(ghost, /border-color:/);
    assert.match(ghost, /background-color:/);
    assert.match(ghost, /color:/);
    assert.match(
        css,
        /\.studio-button\[data-variant="ghost"\]\s*\{[^}]*color:\s*color-mix\(/s
    );
});

test("global disabled button styling remains in place", () => {
    const css = read("src/ui/components/studio/studio.css");
    const block =
        css.match(
            /\.studio-button:disabled:not\(\[data-loading="true"\]\)\s*\{([^}]*)\}/s
        )?.[1] ?? "";
    assert.match(block, /opacity:\s*\.55/);
    assert.match(block, /font-weight:\s*500/);
    assert.match(css, /\.studio-button:disabled\s*\{[^}]*cursor:\s*not-allowed/s);
});

test("onboarding copy and card state labels exist in both locales", () => {
    const expected = {
        notSetUp: "Not set up",
        credentialsSaved: "Credentials saved",
        connected: "Connected",
        couldntVerify: "Couldn't verify",
        couldntReachProvider: "Couldn't reach provider",
        setUp: "Set up",
        replaceCredentials: "Replace credentials",
        updateCredentials: "Update credentials",
        tryAgain: "Try again",
        continue: "Continue",
        copy: "Copy",
        copied: "Copied",
        connect: "Connect",
        saveAndConnect: "Save and connect",
        setUpServiceTitle: "Set up {{service}}",
        replaceCredentialsTitle: "Replace {{service}} credentials",
        pasteCredentialsTitle: "Paste {{service}} credentials",
        createAppStep: "Create the app",
        pasteCredentialsStep: "Paste credentials",
        setupSteps: "Setup steps",
        credentialsVerifiedOnConnect:
            "Credentials are verified automatically before they are saved.",
        secretsPersistenceError:
            "Credentials were verified, but couldn't be saved. Please try again.",
    };
    for (const [key, value] of Object.entries(expected)) {
        assert.equal(en.common[key], value, `en.common.${key}`);
        assert.equal(typeof tr.common[key], "string", `tr.common.${key}`);
    }
    assert.equal(en.home.connections.spotifyRole, "Playback");
    assert.equal(en.home.connections.kickRole, "Chat and requests");
    assert.equal(en.home.connections.twitchRole, "Chat and requests");
});

test("the old card form, helper hook and guide dialog are gone", () => {
    assert.equal(
        fs.existsSync(
            path.join(root, "src/features/settings/useSecretsSection.ts")
        ),
        false
    );
    assert.equal(
        fs.existsSync(
            path.join(
                root,
                "src/features/settings/components/modals/SecretsSetupModal.tsx"
            )
        ),
        false
    );
    const secrets = read(
        "src/features/settings/components/sections/Secrets.tsx"
    );
    assert.doesNotMatch(secrets, /SetupGuideDialog|setupGuide|ClientSecret/);
    assert.doesNotMatch(secrets, /validateField|canSaveCredentials|canVerifyCredentials/);
    const state = read("src/features/settings/credentialState.ts");
    assert.doesNotMatch(state, /canSaveCredentials|canVerifyCredentials/);
});