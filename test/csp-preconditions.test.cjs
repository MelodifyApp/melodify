"use strict";

/**
 * Static preconditions for the deferred renderer CSP.
 *
 * The renderer Content-Security-Policy is intentionally NOT implemented yet:
 * verifying a policy needs a real page load (style-loader injects <style> at
 * runtime, dev HMR needs eval + a dev-server websocket, and the packaged
 * file:// document can only be confirmed by opening the app). These tests lock
 * the facts the recommendation depends on, so a future CSP round starts from a
 * known state and any regression (remote script, inline script, weakened
 * webPreferences) fails loudly here first.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return entry.isFile() ? [full] : [];
    });
}

test("renderer HTML ships no inline scripts, stylesheet links or remote resources", () => {
    const html = read("src/renderer/index.html");

    // HtmlWebpackPlugin injects the bundle as an external <script src>, so a
    // future CSP can use script-src 'self' without 'unsafe-inline'.
    assert.doesNotMatch(html, /<script\b/i);
    assert.doesNotMatch(html, /<link\b/i);
    assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']https?:/i);

    // Documented exception: the inline style attribute is why a future CSP
    // still needs style-src 'unsafe-inline'.
    assert.match(html, /<body style=/);
});

test("renderer sources never load remote scripts or modules", () => {
    const offenders = [];
    for (const file of walk(path.join(ROOT, "src"))) {
        if (!/\.(ts|tsx|html)$/.test(file)) continue;
        const text = fs.readFileSync(file, "utf8");
        const relative = path.relative(ROOT, file);
        if (/sdk\.scdn\.co|spotify-player\.js/i.test(text)) {
            offenders.push(`${relative}: remote SDK reference`);
        }
        if (/\bfrom\s+["']https?:/.test(text)) {
            offenders.push(`${relative}: remote module import`);
        }
        if (/\bimport\s*\(\s*["']https?:/.test(text)) {
            offenders.push(`${relative}: remote dynamic import`);
        }
        if (/<script[^>]+src\s*=\s*["']https?:/i.test(text)) {
            offenders.push(`${relative}: remote script tag`);
        }
    }
    assert.deepEqual(offenders, []);
});

test("windows keep hardened webPreferences and no insecure flags", () => {
    const main = read("src/main/index.ts");

    assert.doesNotMatch(main, /webSecurity\s*:\s*false/);
    assert.doesNotMatch(main, /allowRunningInsecureContent\s*:\s*true/);
    assert.doesNotMatch(main, /nodeIntegrationInWorker\s*:\s*true/);
    assert.doesNotMatch(main, /enableRemoteModule\s*:\s*true/);
    assert.doesNotMatch(main, /webviewTag\s*:\s*true/);

    const isolated = main.match(/contextIsolation\s*:\s*true/g) ?? [];
    const nodeDisabled = main.match(/nodeIntegration\s*:\s*false/g) ?? [];
    assert.ok(
        isolated.length >= 2,
        "the main and UI-test windows must both keep contextIsolation"
    );
    assert.ok(
        nodeDisabled.length >= 2,
        "the main and UI-test windows must both keep nodeIntegration disabled"
    );
});

test("inline styles in the renderer are runtime-injected, so CSP must allow them", () => {
    // style-loader keeps CSS inside the bundle and injects <style> at runtime;
    // switching to an extracted stylesheet would be a separate, verifiable
    // change. Until then any CSP needs style-src 'unsafe-inline'.
    assert.match(read("webpack.renderer.config.ts"), /style-loader/);
});
