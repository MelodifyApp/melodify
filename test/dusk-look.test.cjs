"use strict";

/**
 * The approved Dusk look is the product default. These contracts pin the
 * token-driven field, shared card wash, rail/nav tint, typography, artwork and
 * primary-button treatment, plus the gallery's Dusk default.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
const read = (relativePath) =>
    fs.readFileSync(path.join(root, relativePath), "utf8");

function loadStudio() {
    const originalResolve = Module._resolveFilename;
    const originalCss = require.extensions[".css"];
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
            path.join(root, "src/ui/components/studio/index.ts")
        );
        delete require.cache[resolved];
        return require(resolved);
    } finally {
        Module._resolveFilename = originalResolve;
        if (originalCss) require.extensions[".css"] = originalCss;
        else delete require.extensions[".css"];
    }
}

test("StudioTheme defaults to Dusk and exposes a look override", () => {
    const studio = loadStudio();
    const defaultHtml = renderToStaticMarkup(
        React.createElement(studio.StudioTheme, null, "content")
    );
    const plainHtml = renderToStaticMarkup(
        React.createElement(
            studio.StudioTheme,
            { look: "studio" },
            "content"
        )
    );

    assert.match(defaultHtml, /data-studio-look="dusk"/);
    assert.match(plainHtml, /data-studio-look="studio"/);
});

test("the Dusk look is product CSS imported after Studio and scoped to the app root", () => {
    const index = read("src/ui/components/studio/index.ts");
    const dusk = read("src/ui/components/studio/dusk.css");

    assert.match(index, /import "\.\/dusk\.css";/);
    assert.match(index, /import "\.\/studio\.css";[\s\S]*import "\.\/dusk\.css";/);
    assert.match(dusk, /\.studio-app\[data-studio-look="dusk"\]\s*\{/);
    assert.doesNotMatch(dusk, /(^|\n)\s*(?:body|html|:root)\b/);

    const field = dusk.match(
        /\.studio-app\[data-studio-look="dusk"\]\s*\{([^}]*)\}/s
    )?.[1];
    assert.ok(field, "Dusk app field must exist");
    assert.match(
        field,
        /background-color:\s*color-mix\(in srgb, var\(--studio-canvas\) 96%, #000\)/
    );
    assert.match(
        field,
        /radial-gradient\(70% 55% at 0% 0%, color-mix\(in srgb, var\(--studio-secondary\) 15%, transparent\), transparent 68%\)/
    );
    assert.match(
        field,
        /radial-gradient\(62% 55% at 100% 100%, color-mix\(in srgb, var\(--studio-accent\) 20%, transparent\), transparent 70%\)/
    );
    assert.match(
        field,
        /linear-gradient\(180deg, var\(--studio-canvas\) 0%, color-mix\(in srgb, var\(--studio-canvas\) 96%, #000\) 100%\)/
    );
});

test("Dusk lets the product field show through Home and Settings", () => {
    const dusk = read("src/ui/components/studio/dusk.css");

    assert.match(
        dusk,
        /\.studio-app\[data-studio-look="dusk"\] \.studio-home\s*\{[^}]*background-color:\s*transparent/s
    );
    assert.match(
        dusk,
        /\.studio-app\[data-studio-look="dusk"\] \.studio-home-main::before\s*\{[^}]*background:\s*none/s
    );
    const settingsMain = dusk.match(
        /\.studio-app\[data-studio-look="dusk"\] \.studio-settings-main\s*\{([^}]*)\}/s
    )?.[1];
    assert.ok(settingsMain, "Dusk Settings field must exist");
    assert.match(settingsMain, /background-color:\s*transparent/);
    assert.match(
        settingsMain,
        /radial-gradient\(70% 60% at 0% 0%, color-mix\(in srgb, var\(--studio-secondary\) 19%, transparent\), transparent 66%\)/
    );
    assert.match(
        settingsMain,
        /radial-gradient\(65% 60% at 100% 100%, color-mix\(in srgb, var\(--studio-accent\) 20%, transparent\), transparent 68%\)/
    );
});

test("Dusk cards share one violet-to-green wash, edge and shadow", () => {
    const dusk = read("src/ui/components/studio/dusk.css");
    const cardRule = dusk.match(
        /\.studio-app\[data-studio-look="dusk"\] \.studio-card,[\s\S]*?\.studio-updates\s*\{([^}]*)\}/s
    )?.[0];

    assert.ok(cardRule, "Dusk card group must exist");
    for (const selector of [
        ".studio-card",
        ".studio-settings-content",
        ".studio-home-now-playing",
        ".studio-home-queue",
        ".studio-home-summary",
        ".studio-updates",
    ]) {
        assert.match(
            cardRule,
            new RegExp(
                `\\.studio-app\\[data-studio-look="dusk"\\] ${selector.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&"
                )}(?=[,\\s])`
            )
        );
    }
    assert.match(
        cardRule,
        /radial-gradient\(120% 80% at 0% 0%, color-mix\(in srgb, var\(--studio-secondary\) 8%, transparent\), transparent 62%\)/
    );
    assert.match(
        cardRule,
        /radial-gradient\(110% 75% at 100% 100%, color-mix\(in srgb, var\(--studio-accent\) 8%, transparent\), transparent 60%\)/
    );
    assert.match(
        cardRule,
        /linear-gradient\(180deg, color-mix\(in srgb, var\(--studio-ink\) 4%, transparent\), transparent 46%\)/
    );
    assert.match(
        cardRule,
        /linear-gradient\(135deg, color-mix\(in srgb, var\(--studio-secondary\) 7%, transparent\), transparent 52%\)/
    );
    assert.match(
        cardRule,
        /border-color:\s*color-mix\(in srgb, var\(--studio-ink\) 11%, transparent\)/
    );
    assert.match(cardRule, /inset 0 1px 0 color-mix\(in srgb, var\(--studio-ink\) 7%, transparent\)/);
    assert.match(cardRule, /0 10px 26px color-mix\(in srgb, #000 26%, transparent\)/);

    assert.match(
        dusk,
        /\.studio-app\[data-studio-look="dusk"\] \.studio-updates\[data-state="available"\]\s*\{[^}]*background-image:/s
    );
    assert.doesNotMatch(
        dusk,
        /linear-gradient\(135deg, color-mix\(in srgb, var\(--studio-accent\) 5%, transparent\)/
    );
});

test("Dusk tints rails, active navigation and the two title sizes", () => {
    const dusk = read("src/ui/components/studio/dusk.css");

    assert.match(
        dusk,
        /\.studio-app\[data-studio-look="dusk"\] \.studio-settings-rail\s*\{[^}]*linear-gradient\(180deg, color-mix\(in srgb, var\(--studio-secondary\) 4%, transparent\), transparent 44%\)[^}]*linear-gradient\(180deg, var\(--studio-menu-top\), var\(--studio-menu-bottom\)\)/s
    );
    assert.match(
        dusk,
        /\.studio-app\[data-studio-look="dusk"\] \.studio-home-rail\s*\{[^}]*linear-gradient\(180deg, color-mix\(in srgb, var\(--studio-secondary\) 4%, transparent\), transparent 44%\)/s
    );
    assert.match(
        dusk,
        /\.studio-app\[data-studio-look="dusk"\] \.studio-home-footer\s*\{[^}]*linear-gradient\(90deg, color-mix\(in srgb, var\(--studio-secondary\) 4%, transparent\), transparent 45%\)/s
    );
    assert.match(
        dusk,
        /\.studio-app\[data-studio-look="dusk"\] \.studio-nav-item\[aria-current="page"\]\s*\{[^}]*linear-gradient\(90deg, color-mix\(in srgb, var\(--studio-accent\) 18%, transparent\), color-mix\(in srgb, var\(--studio-accent\) 5%, transparent\)\)[^}]*inset 0 0 0 1px color-mix\(in srgb, var\(--studio-accent\) 14%, transparent\)/s
    );
    assert.match(
        dusk,
        /\.studio-app\[data-studio-look="dusk"\] \.studio-settings-title\s*\{[^}]*font-size:\s*30px[^}]*letter-spacing:\s*-0?\.9px/s
    );
    assert.match(
        dusk,
        /\.studio-app\[data-studio-look="dusk"\] \.studio-home-request-title\s*\{[^}]*font-size:\s*24px/s
    );
});

test("Dusk keeps mobile art sizes and gives desktop art the approved edge and shadow", () => {
    const dusk = read("src/ui/components/studio/dusk.css");
    const home = read("src/ui/components/homeStudio.css");

    assert.match(
        dusk,
        /@media \(min-width: 641px\)\s*\{[\s\S]*?\.studio-home-art\s*\{[^}]*width:\s*128px[^}]*height:\s*128px[^}]*border-color:\s*color-mix\(in srgb, var\(--studio-accent\) 34%, transparent\)[^}]*box-shadow:\s*0 8px 22px color-mix\(in srgb, var\(--studio-secondary\) 6%, transparent\)/s
    );
    assert.match(home, /@media \(max-width: 640px\)[\s\S]*?\.studio-home-art\s*\{[^}]*width:\s*84px/s);
    assert.match(home, /@media \(max-width: 420px\)[\s\S]*?\.studio-home-art\s*\{[^}]*width:\s*72px/s);
});

test("Dusk primary buttons keep the tonal gradient and get the subtle shadow pair", () => {
    const dusk = read("src/ui/components/studio/dusk.css");

    assert.match(
        dusk,
        /\.studio-app\[data-studio-look="dusk"\] \.studio-button\[data-variant="primary"\]\s*\{[^}]*box-shadow:\s*inset 0 1px 0 color-mix\(in srgb, #fff 30%, transparent\),\s*0 2px 8px color-mix\(in srgb, var\(--studio-accent\) 5%, transparent\)/s
    );
    assert.match(
        dusk,
        /\.studio-app\[data-studio-look="dusk"\] \.studio-button\[data-variant="primary"\]:not\(:disabled\):hover\s*\{[^}]*inset 0 1px 0 color-mix\(in srgb, #fff 36%, transparent\)[^}]*0 6px 16px color-mix\(in srgb, var\(--studio-accent\) 10%, transparent\)/s
    );
    assert.doesNotMatch(dusk, /background-image:\s*linear-gradient\([^}]*data-variant="primary"/s);
});

test("the gallery defaults to Dusk and uses the product look scope for comparison", () => {
    const gallery = read("src/features/settings/components/appGallery.tsx");
    const galleryCss = read("src/features/settings/components/appGallery.css");

    assert.match(gallery, /const \[look, setLook\] = useState\("dusk"\)/);
    assert.match(gallery, /params\.get\("look"\) \|\| "dusk"/);
    assert.match(gallery, /<StudioTheme[\s\S]*?look=\{look\}/);
    assert.match(gallery, /look === "studio" \|\| look === "dusk"/);
    assert.doesNotMatch(galleryCss, /\.look-dusk\s*\{/);
});
