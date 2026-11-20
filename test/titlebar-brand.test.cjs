"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readSource(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

test("titlebar uses the approved Melodify brand mark", () => {
    const titlebar = readSource("src/ui/components/Titlebar.tsx");
    const mark = readSource("src/ui/components/MelodifyMark.tsx");

    assert.match(titlebar, /MelodifyMark/);
    assert.doesNotMatch(titlebar, /\bMusic\b/);
    assert.match(mark, /#34d399/);
    assert.match(mark, /#c084fc/);
    assert.match(mark, /viewBox="0 0 64 64"/);
});

test("the public display brand is Melodify Live", () => {
    const en = JSON.parse(readSource("src/core/i18n/locales/en.json"));
    const tr = JSON.parse(readSource("src/core/i18n/locales/tr.json"));
    const html = readSource("src/renderer/index.html");
    const pkg = JSON.parse(readSource("package.json"));
    const readme = readSource("README.md");
    const security = readSource("SECURITY.md");

    assert.equal(en.app.name, "Melodify Live");
    assert.equal(tr.app.name, "Melodify Live");
    assert.match(html, /<title>Melodify Live<\/title>/);

    assert.match(
        pkg.description,
        /^Melodify Live is a desktop app/
    );
    assert.match(readme, /^# Melodify Live\b/m);
    assert.match(readme, /Melodify Live is a Windows desktop app/);
    assert.match(readme, /https:\/\/melodifylive\.app/);
    assert.match(security, /Melodify Live desktop application/);

    for (const [file, heading] of [
        ["docs/PRIVACY.md", "# Melodify Live — Privacy Notice"],
        ["docs/KVKK.md", "# Melodify Live — KVKK assessment"],
        [
            "docs/RELEASE-NOTES-1.1.0.md",
            "# Melodify Live 1.1.0 — release-note planning",
        ],
    ]) {
        assert.match(readSource(file), new RegExp(`^${heading}`, "m"), file);
    }
    assert.match(
        readSource("docs/PRIVACY.tr.md"),
        /^# Melodify Live — Kişisel Verilerin Korunması Aydınlatma Metni/m
    );
});

test("installer and internal identity stay Melodify for upgrade compatibility", () => {
    const pkg = JSON.parse(readSource("package.json"));
    const forge = readSource("forge.config.ts");
    const config = readSource("src/core/config/index.ts");
    const readme = readSource("README.md");
    const notes = readSource("docs/RELEASE-NOTES-1.1.0.md");

    assert.equal(pkg.name, "melodify");
    assert.equal(pkg.productName, "melodify");
    assert.match(forge, /name: "Melodify"/);
    assert.match(forge, /executableName: "Melodify"/);
    assert.match(forge, /setupExe: "Melodify\.Setup\.exe"/);
    assert.match(forge, /exe: "Melodify\.exe"/);
    assert.match(forge, /appBundleId: "com\.emirhanpisgin\.melodify"/);
    assert.match(forge, /owner: "MelodifyApp"/);
    assert.match(forge, /name: "melodify"/);
    assert.match(config, /config\.json/);
    assert.match(readme, /installer identity remains `Melodify`/i);
    assert.match(notes, /installer identity remains `Melodify`/i);
    assert.match(notes, /%APPDATA%\\melodify/);
});

test("the titlebar wordmark hides at the existing 380px breakpoint", () => {
    const css = readSource("src/ui/components/titlebarStudio.css");
    assert.match(
        css,
        /@media \(max-width: 380px\)\s*\{\s*\.studio-titlebar-name,\s*\.studio-titlebar-sep\s*\{\s*display:\s*none;/s
    );
});
