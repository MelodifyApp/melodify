"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SRC_ROOT = path.join(__dirname, "..", "src");
const LOCALE_PATH = path.join(SRC_ROOT, "core", "i18n", "locales", "en.json");
const KEY_PATTERN = /\bt\(\s*["']([^"']+)["']/g;

function walk(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(entryPath) : [entryPath];
    });
}

function lookup(source, key) {
    let current = source;
    for (const part of key.split(".")) {
        if (!current || typeof current !== "object" || !(part in current)) {
            return false;
        }
        current = current[part];
    }
    return typeof current === "string";
}

test("every static translation key used by feature UI exists in the English locale", () => {
    const locale = JSON.parse(fs.readFileSync(LOCALE_PATH, "utf8"));
    const missing = new Set();
    const files = walk(SRC_ROOT).filter(
        (filePath) =>
            filePath.endsWith(".tsx") && !filePath.includes(`${path.sep}node_modules${path.sep}`)
    );

    for (const filePath of files) {
        const source = fs.readFileSync(filePath, "utf8");
        for (const match of source.matchAll(KEY_PATTERN)) {
            const key = match[1];
            if (!lookup(locale, key)) {
                missing.add(`${key} (${path.relative(SRC_ROOT, filePath)})`);
            }
        }
    }

    assert.deepEqual([...missing].sort(), []);
});

test("English locale uses an English back-to-home label", () => {
    const locale = JSON.parse(fs.readFileSync(LOCALE_PATH, "utf8"));
    assert.equal(locale.navigation.homePage, "Home");
});

test("update label describes startup checks and helper keeps only manual download/install", () => {
    const en = JSON.parse(fs.readFileSync(LOCALE_PATH, "utf8"));
    const trPath = path.join(
        SRC_ROOT,
        "core",
        "i18n",
        "locales",
        "tr.json"
    );
    const tr = JSON.parse(fs.readFileSync(trPath, "utf8"));

    assert.match(en.general.autoUpdate, /check.*updates.*startup/i);
    assert.doesNotMatch(en.general.autoUpdateDesc, /startup|check.*updates/i);
    assert.match(en.general.autoUpdateDesc, /manual/i);
    assert.doesNotMatch(
        en.general.autoUpdateDesc,
        /download.*automatically|automatically.*download/i
    );

    assert.match(tr.general.autoUpdate, /başlangıçta.*güncellemeleri.*kontrol/i);
    assert.doesNotMatch(tr.general.autoUpdateDesc, /başlangıçta|kontrol/i);
    assert.match(tr.general.autoUpdateDesc, /manuel/i);
    assert.doesNotMatch(
        tr.general.autoUpdateDesc,
        /indirmeyi otomatik|otomatik indir/i
    );
});
