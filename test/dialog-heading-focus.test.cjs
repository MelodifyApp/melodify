"use strict";

/**
 * The step heading is focused programmatically so assistive technology
 * announces the new step. It must not paint the global Studio focus ring.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) =>
    fs.readFileSync(path.join(root, relativePath), "utf8");

test("the credential step heading keeps programmatic focus without the global ring", () => {
    const dialog = read(
        "src/features/settings/components/sections/CredentialSetupDialog.tsx"
    );
    const css = read(
        "src/features/settings/components/settingsStudio.css"
    );

    assert.match(dialog, /headingRef\.current\?\.focus\(\)/);
    assert.match(dialog, /ref=\{headingRef\}/);
    assert.match(dialog, /tabIndex=\{-1\}/);

    assert.match(
        css,
        /\.studio-credential-dialog \.studio-setup-head h2\[tabindex="-1"\]:focus,\s*\.studio-credential-dialog \.studio-setup-head h2\[tabindex="-1"\]:focus-visible\s*\{[^}]*outline:\s*none;[^}]*box-shadow:\s*none;/s
    );
});

test("real controls keep the Studio focus treatment", () => {
    const studio = read("src/ui/components/studio/studio.css");

    assert.match(
        studio,
        /\.studio :is\(button, \.studio-toggle, \[tabindex\]:not\(\.studio-settings-title\)\):focus-visible\s*\{[^}]*outline:\s*2px solid var\(--studio-focus\)/s
    );
    assert.match(
        studio,
        /\.studio-input:focus\s*\{[^}]*border-color:\s*var\(--studio-accent\)[^}]*box-shadow:/s
    );
    assert.match(studio, /\.studio-input\[aria-invalid="true"\]:focus\s*\{[^}]*box-shadow:/s);
});
