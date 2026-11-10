"use strict";

/**
 * Motion-polish contracts: dialog enter/exit, Settings section switch,
 * update-latest reveal and the theme-surface crossfade. Timing must stay
 * token-driven and reduced motion must suppress every new animation.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) =>
    fs.readFileSync(path.join(root, relativePath), "utf8");

test("the credential dialog uses one exit duration and resolves instantly for reduced motion", () => {
    const {
        CREDENTIAL_DIALOG_EXIT_MS,
        dialogExitDuration,
    } = require("../src/features/settings/components/sections/dialogMotion");

    assert.equal(CREDENTIAL_DIALOG_EXIT_MS, 180);
    assert.equal(dialogExitDuration(false), CREDENTIAL_DIALOG_EXIT_MS);
    assert.equal(dialogExitDuration(true), 0);
});

test("CredentialSetupDialog owns a guarded closing state for every close path", () => {
    const dialog = read(
        "src/features/settings/components/sections/CredentialSetupDialog.tsx"
    );

    assert.match(dialog, /const \[closing, setClosing\] = useState\(false\)/);
    assert.match(dialog, /const closeAction = useRef</);
    assert.match(dialog, /const beginExit = \(/);
    assert.match(dialog, /if \(closing\) return;/);
    assert.match(dialog, /if \(busy\) return;/);
    assert.match(dialog, /dialogExitDuration\(/);
    assert.match(dialog, /prefers-reduced-motion: reduce/);
    assert.match(dialog, /data-closing=\{closing \|\| undefined\}/);
    assert.match(dialog, /beginExit\(\(\) => onConnected/);
    assert.match(dialog, /beginExit\(\(\) => onClose/);
    assert.match(dialog, /onKeyDown[\s\S]*?Escape[\s\S]*?closeDialog\(\)/);
    assert.match(dialog, /event\.target === event\.currentTarget\) closeDialog\(\)/);

    // The existing focus trap, modal semantics, busy fields and focus
    // restoration survive the exit animation unchanged.
    assert.match(dialog, /aria-modal="true"/);
    assert.match(dialog, /aria-labelledby/);
    assert.match(dialog, /addEventListener\("keydown"/);
    assert.match(dialog, /previousFocus\.current/);
    assert.match(dialog, /disabled=\{busy\}/);
});

test("dialog enter and exit animate the overlay and panel with token timing", () => {
    const css = read(
        "src/features/settings/components/settingsStudio.css"
    );

    assert.match(
        css,
        /\.studio-setup-overlay\s*\{[^}]*animation:\s*studio-dialog-overlay-in\s+var\(--studio-motion-base\)\s+var\(--studio-motion-ease\)/s
    );
    assert.match(
        css,
        /\.studio-setup-dialog\s*\{[^}]*animation:\s*studio-dialog-panel-in\s+var\(--studio-motion-base\)\s+var\(--studio-motion-ease\)/s
    );
    assert.match(
        css,
        /\.studio-setup-overlay\[data-closing="true"\]\s*\{[^}]*animation:\s*studio-dialog-overlay-out\s+var\(--studio-motion-base\)/s
    );
    assert.match(
        css,
        /\.studio-setup-dialog\[data-closing="true"\]\s*\{[^}]*animation:\s*studio-dialog-panel-out\s+var\(--studio-motion-base\)/s
    );
    assert.match(
        css,
        /@keyframes studio-dialog-panel-in\s*\{[^}]*from\s*\{[^}]*scale\(\.98\)\s+translateY\(4px\)[^}]*\}[^}]*to\s*\{[^}]*transform:\s*none/s
    );
    assert.match(
        css,
        /@keyframes studio-dialog-panel-out\s*\{[^}]*from\s*\{[^}]*transform:\s*none[^}]*\}[^}]*to\s*\{[^}]*scale\(\.98\)\s+translateY\(4px\)/s
    );
});

test("Settings remounts the active section through a keyed 140ms enter", () => {
    const settings = read("src/features/settings/components/Settings.tsx");
    const css = read(
        "src/features/settings/components/settingsStudio.css"
    );

    assert.match(settings, /const \[hasNavigated, setHasNavigated\] = useState\(false\)/);
    assert.match(settings, /const \[animateSections, setAnimateSections\] = useState\(false\)/);
    assert.match(settings, /key=\{activeSection\}/);
    assert.match(settings, /className="studio-settings-section"/);
    assert.match(settings, /data-enter=\{animateSections \? "true" : undefined\}/);
    assert.match(settings, /setAnimateSections\(true\)/);
    assert.equal(
        (settings.match(/setAnimateSections\(true\)/g) || []).length,
        1,
        "only an explicit navigation may start the section enter"
    );
    const requestedBlock = settings.match(
        /useEffect\(\(\) => \{\s*if \(!requestedSection\) return;[\s\S]*?\}, \[requestedSection/
    )?.[0];
    assert.ok(requestedBlock, "requestedSection effect must exist");
    assert.doesNotMatch(requestedBlock, /setAnimateSections/);

    assert.match(
        css,
        /\.studio-settings-section\[data-enter="true"\]\s*\{[^}]*animation:\s*studio-settings-section-in\s+var\(--studio-motion-switch\)\s+var\(--studio-motion-ease\)/s
    );
    assert.match(
        css,
        /@keyframes studio-settings-section-in\s*\{[^}]*from\s*\{[^}]*opacity:\s*0[^}]*translateY\(4px\)[^}]*\}[^}]*to\s*\{[^}]*opacity:\s*1[^}]*transform:\s*none/s
    );

    const studio = read("src/ui/components/studio/studio.css");
    assert.match(
        studio,
        /\.studio-nav-item\[aria-current="page"\]::before\s*\{[^}]*animation:\s*studio-nav-marker-in\s+var\(--studio-motion-switch\)/s
    );
    assert.match(
        studio,
        /@keyframes studio-nav-marker-in\s*\{[^}]*from\s*\{[^}]*opacity:\s*0[^}]*scaleY\(\.4\)/s
    );
});

test("the update latest block gets an opacity and 4px rise without height machinery", () => {
    const general = read(
        "src/features/settings/components/sections/General.tsx"
    );
    const css = read(
        "src/features/settings/components/settingsStudio.css"
    );

    assert.match(general, /studio-update-latest/);
    assert.match(
        css,
        /\.studio-update-latest\s*\{[^}]*animation:\s*studio-update-latest-in\s+var\(--studio-motion-base\)\s+var\(--studio-motion-ease\)/s
    );
    assert.match(
        css,
        /@keyframes studio-update-latest-in\s*\{[^}]*from\s*\{[^}]*opacity:\s*0[^}]*translateY\(4px\)[^}]*\}[^}]*to\s*\{[^}]*opacity:\s*1[^}]*transform:\s*none/s
    );
    assert.doesNotMatch(
        css,
        /\.studio-update-latest\s*\{[^}]*grid-template-rows/s
    );

    // Existing arrival, beacon and progress motion is untouched.
    assert.match(css, /studio-update-arrive/);
    assert.match(css, /studio-update-beacon/);
    assert.match(css, /\.studio-update-progress/);
});

test("theme switching crossfades surfaces for 160ms without transitioning text or layout", () => {
    const motion = read("src/ui/components/studio/motion.css");
    const studio = read("src/ui/components/studio/studio.css");

    assert.match(motion, /--studio-motion-switch:\s*140ms;/);
    assert.match(motion, /--studio-motion-theme:\s*160ms;/);
    assert.match(
        motion,
        /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.studio,\s*\.studio \*/s
    );
    assert.match(
        motion,
        /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?transition:\s*none\s*!important;[\s\S]*?animation:\s*none\s*!important;/s
    );

    const start = studio.indexOf(".studio-titlebar,");
    assert.notEqual(start, -1, "theme surface rule must exist");
    const block = studio.slice(start, studio.indexOf("}", start) + 1);
    for (const selector of [
        ".studio",
        ".studio-titlebar",
        ".studio-settings-rail",
        ".studio-settings-main",
        ".studio-settings-content",
        ".studio-home",
        ".studio-home-rail",
        ".studio-home-footer",
        ".studio-card",
        ".studio-input",
    ]) {
        assert.match(block, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?=[,\\s])"));
    }
    assert.match(block, /background-color\s+var\(--studio-motion-theme\)/);
    assert.match(block, /border-color\s+var\(--studio-motion-theme\)/);
    assert.match(block, /box-shadow\s+var\(--studio-motion-theme\)/);
    assert.doesNotMatch(block, /(?:^|[\s,])color\s+var\(/);
    assert.doesNotMatch(block, /transform|width|height|padding|margin/);
});
