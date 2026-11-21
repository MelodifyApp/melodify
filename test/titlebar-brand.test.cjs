"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readSource(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

const brand = JSON.parse(readSource("src/shared/brand.json"));

test("titlebar uses the approved product brand mark", () => {
    const titlebar = readSource("src/ui/components/Titlebar.tsx");
    const mark = readSource("src/ui/components/BrandMark.tsx");

    assert.match(titlebar, /BrandMark/);
    assert.doesNotMatch(titlebar, /MelodifyMark/);
    assert.doesNotMatch(titlebar, /\bMusic\b/);
    assert.match(mark, /#34d399/);
    assert.match(mark, /#c084fc/);
    assert.match(mark, /viewBox="0 0 64 64"/);
});

test("the brand is defined in one source of truth", () => {
    assert.equal(brand.displayName, "Quelody");
    assert.equal(brand.packageName, "quelody");
    assert.equal(brand.productName, "Quelody");
    assert.equal(brand.executableName, "Quelody");
    assert.equal(brand.installerName, "Quelody.Setup.exe");
    assert.equal(brand.appId, "com.emirhanpisgin.quelody");
    assert.equal(brand.profileName, "quelody");
    assert.equal(brand.legacyProfileName, "melodify");
});

test("public UI, HTML, package and docs use the brand value", () => {
    const en = JSON.parse(readSource("src/core/i18n/locales/en.json"));
    const tr = JSON.parse(readSource("src/core/i18n/locales/tr.json"));
    const html = readSource("src/renderer/index.html");
    const pkg = JSON.parse(readSource("package.json"));
    const readme = readSource("README.md");
    const security = readSource("SECURITY.md");

    assert.equal(en.app.name, brand.displayName);
    assert.equal(tr.app.name, brand.displayName);
    assert.match(html, new RegExp(`<title>${brand.displayName}</title>`));

    assert.equal(pkg.name, brand.packageName);
    assert.equal(pkg.productName, brand.productName);
    assert.match(pkg.description, new RegExp(`^${brand.displayName} is a desktop app`));
    assert.match(readme, new RegExp(`^# ${brand.displayName}\\b`, "m"));
    assert.match(readme, new RegExp(`${brand.displayName} is a Windows desktop app`));
    assert.match(security, new RegExp(`${brand.displayName} desktop application`));

    for (const [file, heading] of [
        ["docs/PRIVACY.md", `# ${brand.displayName} — Privacy Notice`],
        ["docs/KVKK.md", `# ${brand.displayName} — KVKK assessment`],
        [
            "RELEASE-NOTES-v1.1.0.md",
            `# ${brand.displayName} 1.1.0`,
        ],
    ]) {
        assert.match(
            readSource(file),
            new RegExp(`^${heading}`, "m"),
            file
        );
    }
    assert.match(
        readSource("docs/PRIVACY.tr.md"),
        new RegExp(
            `^# ${brand.displayName} — Kişisel Verilerin Korunması Aydınlatma Metni`,
            "m"
        )
    );
});

test("installer identity comes from the brand config", () => {
    const pkg = JSON.parse(readSource("package.json"));
    const forge = readSource("forge.config.ts");
    const config = readSource("src/core/config/index.ts");

    assert.equal(pkg.name, brand.packageName);
    assert.equal(pkg.productName, brand.productName);
    assert.match(forge, /import brand from "\.\/src\/shared\/brand\.json"/);
    assert.match(forge, /name: brand\.productName/);
    assert.match(forge, /executableName: brand\.executableName/);
    assert.match(forge, /setupExe: brand\.installerName/);
    assert.match(forge, /appBundleId: brand\.appId/);
    assert.match(config, /LEGACY_PROFILE_NAME/);
    assert.match(config, /migrateLegacyProfile/);
    assert.match(config, /config\.json/);
});

test("the titlebar wordmark hides at the existing 380px breakpoint", () => {
    const css = readSource("src/ui/components/titlebarStudio.css");
    assert.match(
        css,
        /@media \(max-width: 380px\)\s*\{\s*\.studio-titlebar-name,\s*\.studio-titlebar-sep\s*\{\s*display:\s*none;/s
    );
});
