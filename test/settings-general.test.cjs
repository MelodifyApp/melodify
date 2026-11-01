"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = path.resolve(__dirname, "..");
const en = require("../src/core/i18n/locales/en.json");
const tr = require("../src/core/i18n/locales/tr.json");

function renderGeneral(config = {}, locale = en) {
    const resolve = Module._resolveFilename;
    const load = Module._load;
    const css = require.extensions[".css"];
    Module._resolveFilename = function (request, ...args) {
        return resolve.call(this, request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request, ...args);
    };
    // SSR avoids browser bridge effects; only translation context is replaced.
    Module._load = function (request, ...args) {
        if (request === "react-i18next") return { useTranslation: () => ({ t: key => key.split(".").reduce((value, part) => value[part], locale) }) };
        return load.call(this, request, ...args);
    };
    require.extensions[".css"] = () => {};
    try {
        const file = require.resolve("../src/features/settings/components/sections/General");
        delete require.cache[file];
        const General = require(file).default;
        return renderToStaticMarkup(React.createElement(General, { config, onConfigChange() {} }));
    } finally {
        Module._resolveFilename = resolve;
        Module._load = load;
        if (css) require.extensions[".css"] = css;
        else delete require.extensions[".css"];
    }
}

test("General keeps only decision-critical help, with reply and manual-update explanations", () => {
    for (const locale of [en, tr]) {
        const html = renderGeneral({}, locale);
        assert.equal((html.match(/class="studio-field-helper"/g) || []).length, 2);
        assert.ok(html.includes(locale.general.autoFollowDefaultsDesc));
        assert.ok(html.includes(locale.general.autoUpdateDesc));
    }
});

test("General exposes every switch and language label with the same draft defaults", () => {
    const html = renderGeneral();
    for (const id of ["start-with-system", "minimize-to-tray", "auto-follow", "auto-update"]) {
        assert.match(html, new RegExp(`<label[^>]*for="general-${id}"`));
        assert.match(html, new RegExp(`<input[^>]*id="general-${id}"[^>]*role="switch"`));
    }
    assert.match(html, /id="general-auto-follow"[^>]*aria-checked="true"/);
    assert.match(html, /id="general-auto-update"[^>]*aria-checked="true"/);
    assert.match(html, /id="general-start-with-system"[^>]*aria-checked="false"/);
    assert.match(html, /id="general-minimize-to-tray"[^>]*aria-checked="false"/);
    assert.match(html, /id="general-language"[^>]*role="combobox"/);
    assert.doesNotMatch(html, /id="general-defaults-language"/);
});

test("independent reply language stays available without redundant helper copy", () => {
    for (const locale of [en, tr]) {
        const html = renderGeneral({ autoFollowLanguageDefaults: false, defaultsLanguage: "tr", language: "en" }, locale);
        assert.match(html, /id="general-defaults-language"[^>]*role="combobox"/);
        assert.match(html, /id="general-defaults-language-value"[^>]*>Türkçe</);
        assert.equal((html.match(/class="studio-field-helper"/g) || []).length, 2);
    }
});
