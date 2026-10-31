"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const Module = require("node:module");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
const projectRoot = path.resolve(root, "..");
const originalResolve = Module._resolveFilename;
const originalCss = require.extensions[".css"];

function loadStudio() {
    Module._resolveFilename = function (request, ...args) {
        return originalResolve.call(
            this,
            request.startsWith("@/")
                ? path.join(root, "src", request.slice(2))
                : request,
            ...args
        );
    };
    require.extensions[".css"] = () => {};
    try {
        const resolved = require.resolve(
            path.join(root, "src/ui/components/studio")
        );
        delete require.cache[resolved];
        return require(resolved);
    } finally {
        Module._resolveFilename = originalResolve;
        if (originalCss) require.extensions[".css"] = originalCss;
        else delete require.extensions[".css"];
    }
}

function loadComponent(relativePath) {
    const originalLoad = Module._load;
    Module._resolveFilename = function (request, ...args) {
        return originalResolve.call(
            this,
            request.startsWith("@/")
                ? path.join(root, "src", request.slice(2))
                : request,
            ...args
        );
    };
    Module._load = function (request, parent, isMain) {
        if (request === "react-i18next") {
            return {
                useTranslation: () => ({
                    t: (key, options) =>
                        options && options.count !== undefined
                            ? `${key} (${options.count})`
                            : key,
                }),
            };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    require.extensions[".css"] = () => {};
    try {
        const resolved = require.resolve(path.join(root, relativePath));
        delete require.cache[resolved];
        return require(resolved).default;
    } finally {
        Module._resolveFilename = originalResolve;
        Module._load = originalLoad;
        if (originalCss) require.extensions[".css"] = originalCss;
        else delete require.extensions[".css"];
    }
}

const studio = loadStudio();
const h = React.createElement;
const render = (name, props = {}, ...children) =>
    renderToStaticMarkup(h(studio[name], props, ...children));
const read = (relativePath) =>
    fs.readFileSync(path.join(root, relativePath), "utf8");
const readProject = (relativePath) =>
    fs.readFileSync(path.join(projectRoot, relativePath), "utf8");

const options = [
    { value: "en", label: "English" },
    { value: "tr", label: "Türkçe" },
    { value: "de", label: "Deutsch", disabled: true },
];

test("Select is a custom Studio combobox with label/value association and no native select", () => {
    const html = render("Select", {
        id: "language",
        label: "Interface language",
        helper: "Used in Melodify.",
        value: "en",
        options,
        onChange() {},
    });
    for (const text of [
        'role="combobox"',
        'aria-haspopup="listbox"',
        'aria-expanded="false"',
        'aria-controls="language-listbox"',
        'aria-labelledby="language-label language-value"',
        'for="language"',
        'id="language-label"',
        'id="language-value"',
        "English",
        'aria-hidden="true"',
        'id="language-helper"',
    ]) {
        assert.ok(html.includes(text), text);
    }
    assert.equal(/<select\b/.test(html), false);
    assert.equal(/<option\b/.test(html), false);
});

test("Select renders listbox/option semantics, selected check and active descendant when open", () => {
    const html = render("Select", {
        id: "language",
        label: "Interface language",
        value: "tr",
        options,
        onChange() {},
        defaultOpen: true,
    });
    for (const text of [
        'aria-expanded="true"',
        'aria-activedescendant="language-listbox-1"',
        'role="listbox"',
        'aria-labelledby="language-label"',
        'role="option"',
        'id="language-listbox-1"',
        'aria-selected="true"',
        'aria-selected="false"',
        'aria-disabled="true"',
        "studio-select-check",
    ]) {
        assert.ok(html.includes(text), text);
    }
    assert.equal((html.match(/role="option"/g) || []).length, 3);
});

test("Select exposes disabled, required, helper, error and invalid state", () => {
    const html = render("Select", {
        id: "language",
        label: "Interface language",
        helper: "Used in Melodify.",
        error: "Choose a language.",
        value: "en",
        options,
        onChange() {},
        disabled: true,
        required: true,
    });
    for (const text of [
        "disabled",
        'data-disabled="true"',
        'aria-required="true"',
        'aria-invalid="true"',
        'aria-describedby="language-helper language-error"',
        'id="language-error"',
        "Choose a language.",
    ]) {
        assert.ok(html.includes(text), text);
    }
});

test("select keyboard actions cover open, move, home/end, select and escape", () => {
    const logic = require("../src/ui/components/studio/selectLogic");
    const base = {
        options,
        selectedValue: "en",
        open: false,
        activeIndex: -1,
    };
    assert.deepEqual(logic.selectKeyAction("ArrowDown", base), {
        type: "open",
        activeIndex: 0,
        preventDefault: true,
    });
    assert.deepEqual(logic.selectKeyAction("Enter", base), {
        type: "open",
        activeIndex: 0,
        preventDefault: true,
    });
    assert.deepEqual(logic.selectKeyAction(" ", base), {
        type: "open",
        activeIndex: 0,
        preventDefault: true,
    });
    assert.deepEqual(
        logic.selectKeyAction("ArrowDown", {
            ...base,
            open: true,
            activeIndex: 0,
        }),
        { type: "move", activeIndex: 1, preventDefault: true }
    );
    assert.deepEqual(
        logic.selectKeyAction("ArrowUp", {
            ...base,
            open: true,
            activeIndex: 0,
        }),
        { type: "move", activeIndex: 1, preventDefault: true }
    );
    assert.deepEqual(
        logic.selectKeyAction("End", {
            ...base,
            open: true,
            activeIndex: 0,
        }),
        { type: "move", activeIndex: 1, preventDefault: true }
    );
    assert.deepEqual(
        logic.selectKeyAction("Home", {
            ...base,
            open: true,
            activeIndex: 1,
        }),
        { type: "move", activeIndex: 0, preventDefault: true }
    );
    assert.deepEqual(
        logic.selectKeyAction("Enter", {
            ...base,
            open: true,
            activeIndex: 1,
        }),
        {
            type: "select",
            activeIndex: 1,
            preventDefault: true,
            restoreFocus: true,
        }
    );
    assert.deepEqual(
        logic.selectKeyAction(" ", {
            ...base,
            open: true,
            activeIndex: 1,
        }),
        {
            type: "select",
            activeIndex: 1,
            preventDefault: true,
            restoreFocus: true,
        }
    );
    assert.deepEqual(
        logic.selectKeyAction("Escape", {
            ...base,
            open: true,
            activeIndex: 1,
        }),
        { type: "close", preventDefault: true, restoreFocus: true }
    );
    assert.deepEqual(
        logic.selectKeyAction("Tab", {
            ...base,
            open: true,
            activeIndex: 1,
        }),
        { type: "close", preventDefault: false, restoreFocus: false }
    );
});

test("select keyboard navigation skips disabled options and wraps", () => {
    const logic = require("../src/ui/components/studio/selectLogic");
    assert.equal(logic.stepEnabledIndex(options, 1, 1), 0);
    assert.equal(logic.stepEnabledIndex(options, 0, -1), 1);
    assert.equal(logic.firstEnabledIndex(options), 0);
    assert.equal(logic.lastEnabledIndex(options), 1);
    assert.equal(logic.openIndex(options, "de", 1), 0);
    assert.equal(logic.openIndex(options, "missing", 1), 0);
});

test("outside click dismisses and restores trigger focus only for non-focusable targets", () => {
    const logic = require("../src/ui/components/studio/selectLogic");
    assert.deepEqual(
        logic.outsidePointerAction({
            open: true,
            inside: false,
            targetFocusable: false,
        }),
        { close: true, restoreFocus: true }
    );
    assert.deepEqual(
        logic.outsidePointerAction({
            open: true,
            inside: false,
            targetFocusable: true,
        }),
        { close: true, restoreFocus: false }
    );
    assert.deepEqual(
        logic.outsidePointerAction({
            open: true,
            inside: true,
            targetFocusable: false,
        }),
        { close: false, restoreFocus: false }
    );
});

test("responsive menu placement stays inside 1200/390/320 viewports and flips near the dock", () => {
    const logic = require("../src/ui/components/studio/selectLogic");
    const wide = logic.fitSelectPosition({
        top: 100,
        bottom: 136,
        left: 500,
        width: 300,
        viewportWidth: 1200,
        viewportHeight: 800,
        desiredHeight: 250,
    });
    assert.equal(wide.placement, "bottom");
    assert.equal(wide.left, 500);
    assert.equal(wide.width, 300);
    assert.equal(wide.top, 142);

    const narrow = logic.fitSelectPosition({
        top: 80,
        bottom: 116,
        left: 40,
        width: 300,
        viewportWidth: 390,
        viewportHeight: 844,
        desiredHeight: 250,
    });
    assert.equal(narrow.left, 40);
    assert.equal(narrow.width, 300);
    assert.equal(narrow.bottom, undefined);

    const smallest = logic.fitSelectPosition({
        top: 80,
        bottom: 116,
        left: 100,
        width: 270,
        viewportWidth: 320,
        viewportHeight: 700,
        desiredHeight: 250,
    });
    assert.equal(smallest.left, 42);
    assert.equal(smallest.width, 270);
    assert.ok(smallest.left + smallest.width <= 312);

    const dock = logic.fitSelectPosition({
        top: 600,
        bottom: 636,
        left: 24,
        width: 270,
        viewportWidth: 320,
        viewportHeight: 700,
        desiredHeight: 300,
    });
    assert.equal(dock.placement, "top");
    assert.equal(dock.top, undefined);
    assert.ok(dock.bottom > 0);
    assert.ok(dock.maxHeight > 0);
});

test("Settings consumers use the custom Select and preserve value/draft updates", () => {
    const files = {
        "src/features/settings/components/sections/General.tsx": [
            "Select",
            'onConfigChange("language", value)',
            'onConfigChange("defaultsLanguage", value)',
        ],
        "src/features/settings/components/sections/Requests.tsx": [
            "Select",
            "onSelect(reward)",
            "options={state.rewards",
            "${pickerId}-status",
        ],
        "src/features/settings/components/sections/Logs.tsx": [
            "Select",
            "onChange={setFilter}",
            "options={levelOptions}",
        ],
    };
    for (const [file, needles] of Object.entries(files)) {
        const source = read(file);
        assert.doesNotMatch(source, /<select[\s>]|<\/select>/, file);
        for (const needle of needles) assert.ok(source.includes(needle), `${file}: ${needle}`);
    }
    assert.equal(/<select[\s>]|<\/select>/.test(read("src/ui/components/studio/Field.tsx")), false);
    assert.equal(/<select[\s>]|<\/select>/.test(read("src/ui/components/HomePage.tsx")), false);

    const source = read("src/ui/components/studio/Select.tsx");
    assert.match(source, /document\.addEventListener\("pointerdown"/);
    assert.match(source, /action\.restoreFocus/);
    assert.match(source, /triggerRef\.current\?\.focus\(\)/);

    const walk = (directory) =>
        fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
            const full = path.join(directory, entry.name);
            if (entry.isDirectory()) return walk(full);
            return /\.(?:tsx?|jsx?)$/.test(entry.name) ? [full] : [];
        });
    for (const file of walk(path.join(root, "src"))) {
        const text = fs.readFileSync(file, "utf8");
        assert.doesNotMatch(
            text,
            /<select[\s>]|<\/select>/,
            path.relative(root, file)
        );
    }
});

test("Logs renders its custom level dropdown without a native select", () => {
    const Logs = loadComponent(
        "src/features/settings/components/sections/Logs.tsx"
    );
    const html = renderToStaticMarkup(
        h(Logs, {
            logs: [
                {
                    level: "info",
                    message: "Settings loaded",
                    timestamp: Date.now(),
                },
            ],
        })
    );
    assert.match(html, /role="combobox"/);
    assert.match(html, /aria-controls="logs-filter-listbox"/);
    assert.match(html, /logs\.all \(1\)/);
    assert.doesNotMatch(html, /<select[\s>]|<\/select>/);
});

test("titlebar keeps the 14.5px wordmark and 24px mark in both app and mockup", () => {
    const appCss = read("src/ui/components/titlebarStudio.css");
    assert.match(appCss, /\.studio-titlebar-name\s*\{[^}]*font-size:\s*14\.5px/);
    assert.match(appCss, /\.studio-titlebar-mark\s*\{[^}]*width:\s*24px[^}]*height:\s*24px/);
    const mockup = readProject(
        "design-previews/app-2026-10-27/index.html"
    );
    assert.match(mockup, /\.titlebar-name\s*\{[^}]*font-size:\s*14\.5px/);
    assert.match(mockup, /\.titlebar-mark\s*\{\s*width:\s*24px;\s*height:\s*24px/);
});

test("Studio mockup source and standalone copy stay byte-identical and use the custom dropdown", () => {
    const source = readProject(
        ".superpowers/brainstorm/284-1793046711/content/studio-app-v2.html"
    );
    const preview = readProject(
        "design-previews/app-2026-10-27/index.html"
    );
    assert.equal(
        Buffer.compare(Buffer.from(source), Buffer.from(preview)),
        0,
        "mockup source and design preview must be byte-identical"
    );
    for (const text of [
        "studio-select-trigger",
        "studio-select-menu",
        "data-select-option",
        "data-select-input",
        'aria-haspopup="listbox"',
        "aria-activedescendant",
        'role="listbox"',
        'role="option"',
        "function studioSelectMarkup",
        "ArrowDown",
        "Escape",
        "pointerdown",
    ]) {
        assert.ok(preview.includes(text), text);
    }
    assert.equal(/<select\b/.test(preview), false);
    const scripts = [...preview.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.ok(scripts.length > 0);
    assert.doesNotThrow(() =>
        new Function(scripts[scripts.length - 1][1])
    );
});
