"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("General exposes one reply-language selector with a same-as-interface option", () => {
    const source = read("src/features/settings/components/sections/General.tsx");
    assert.match(source, /id="general-reply-language"/);
    assert.match(source, /\bvalue:\s*"auto"/);
    assert.doesNotMatch(source, /general-auto-follow/);
    assert.doesNotMatch(source, /general-defaults-language/);
});

test("Song Requests no longer duplicates the command prefix or moderator controls", () => {
    const source = read("src/features/settings/components/sections/Requests.tsx");
    assert.doesNotMatch(source, /requests-prefix/);
    assert.doesNotMatch(source, /requests-moderator-input/);
    assert.doesNotMatch(source, /commands\.moderatorsList/);
});

test("Commands owns the prefix control with the real ten-character validation", () => {
    const source = read("src/features/settings/components/sections/Commands.tsx");
    assert.match(source, /id="commands-prefix"/);
    assert.match(source, /maxLength=\{10\}/);
    assert.match(source, /validateField\(\s*"prefix"/);
});

test("Settings renders no bottom dock and keeps API credentials per-service", () => {
    const source = read("src/features/settings/components/Settings.tsx");
    assert.doesNotMatch(source, /SaveDock/);
    assert.doesNotMatch(source, /studio-settings-dock/);
    assert.doesNotMatch(source, /onDiscard=/);
    assert.doesNotMatch(source, /mode="auto"|mode="api"/);
    assert.match(source, /<Secrets/);
    assert.match(source, /onCredentialsSaved=\{handleCredentialsSaved\}/);
    assert.doesNotMatch(source, /secretDrafts|credentialDrafts|credentialBaseline/);
});

test("Settings has no success-save status UI or sticky status header", () => {
    const source = read("src/features/settings/components/Settings.tsx");
    const css = read("src/features/settings/components/settingsStudio.css");

    assert.doesNotMatch(
        source,
        /saveStatus|SaveStatus|SAVED_STATUS|studio-settings-(header|save-slot|save-status|save-label|save-progress)|common\.saved|saveDock\.saving|Saving…|CheckIcon/
    );
    assert.doesNotMatch(source, /studio-settings-toast|SaveDock|studio-settings-dock/);
    assert.doesNotMatch(source, /data-state=\{saveStatus\}/);
    assert.match(source, /<InlineError message=\{autoSaveError\}/);
    assert.match(source, /studio-settings-save-alert/);
    assert.match(source, /buildConfigSavePatch/);
    assert.match(source, /config:save/);
    assert.match(source, /saveInFlight\.current/);

    assert.doesNotMatch(
        css,
        /studio-settings-(header|save-slot|save-status|save-label|save-progress)|studio-settings-toast|position:\s*sticky|@keyframes studio-settings-save|data-state="saving"/
    );
    assert.match(
        css,
        /\.studio-settings-title\s*\{[^}]*margin:\s*0 0 20px/s
    );
    assert.match(
        css,
        /@media \(max-width: 700px\)[\s\S]*?\.studio-settings-title\s*\{[^}]*margin-bottom:\s*18px/s
    );
    assert.match(css, /\.studio-settings-save-alert\s*\{/);

    assert.equal(
        fs.existsSync(
            path.join(
                root,
                "src/features/settings/components/saveStatus.ts"
            )
        ),
        false
    );
    assert.equal(
        fs.existsSync(path.join(root, "test/settings-save-status.test.cjs")),
        false
    );
    assert.equal(
        fs.existsSync(path.join(root, "test/settings-sticky-header.test.cjs")),
        false
    );
});

test("Narrow settings navigation wraps instead of requiring horizontal scrolling", () => {
    const css = read("src/features/settings/components/settingsStudio.css");
    assert.match(css, /\.studio-settings-rail \.studio-nav\s*\{[^}]*flex-wrap:\s*wrap/s);
    assert.match(css, /\.studio-settings-rail \.studio-nav-items\s*\{[^}]*display:\s*contents/s);
});

test("The settings title is excluded from the generic focus ring", () => {
    const css = read("src/ui/components/studio/studio.css");
    assert.match(css, /\[tabindex\]:not\(\.studio-settings-title\)/);
});

test("Turkish alias terminology is consistent", () => {
    const tr = require("../src/core/i18n/locales/tr.json");
    assert.match(tr.commands.aliases, /takma ad/i);
    assert.match(tr.commands.addAlias, /takma ad/i);
    assert.match(tr.commands.addAliasAction, /takma ad/i);
});

test("The permission toggle explains the restricted state", () => {
    const source = read("src/features/settings/components/sections/Requests.tsx");
    assert.match(source, /requests\.allowedRolesOnly/);
});

test("Settings keeps credential drafts in the dialog and flushes ordinary text edits", () => {
    const source = read("src/features/settings/components/Settings.tsx");
    const dialog = read(
        "src/features/settings/components/sections/CredentialSetupDialog.tsx"
    );
    assert.match(source, /onBlurCapture=\{handleBlurCapture\}/);
    assert.match(source, /saveInFlight\.current/);
    assert.match(source, /pendingAutoSave\.current/);
    assert.match(source, /commitAcknowledgedDraft\(\s*draftsRef\.current/);
    assert.match(source, /autoSaveError &&/);
    assert.match(source, /studio-settings-save-alert/);
    assert.match(source, /InlineError message=\{autoSaveError\}/);
    assert.doesNotMatch(source, /SaveDock|studio-settings-dock/);
    assert.doesNotMatch(source, /setAutoSaveStatus|apiDraftPending/);
    assert.doesNotMatch(source, /onDiscard=/);
    assert.doesNotMatch(source, /secretDrafts|credentialDrafts|credentialBaseline/);
    assert.match(dialog, /setClientSecret/);
    assert.doesNotMatch(dialog, /onDraftsChange|secretDrafts/);
});
