"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const Module = require("node:module");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
const originalCss = require.extensions[".css"];
let studio, loadError;
Module._resolveFilename = function (request, ...args) {
    return originalResolve.call(this, request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request, ...args);
};
require.extensions[".css"] = () => {};
try { studio = require("../src/ui/components/studio"); } catch (error) { loadError = error; }
finally {
    Module._resolveFilename = originalResolve;
    if (originalCss) require.extensions[".css"] = originalCss;
    else delete require.extensions[".css"];
}
const h = React.createElement;
function render(name, props = {}, ...children) {
    assert.ok(studio, `Studio primitives must load: ${loadError?.message}`);
    return renderToStaticMarkup(h(studio[name], props, ...children));
}

test("Studio exports the isolated foundation without Electron/config imports", () => {
    assert.ok(studio, `Studio primitives must exist: ${loadError?.message}`);
    for (const name of ["StudioTheme", "Button", "IconButton", "Field", "Input", "Select", "Textarea", "Toggle", "StatusChip", "SettingCard", "SettingGroup", "SaveDock", "SectionNav", "ServiceCard"]) assert.ok(studio[name], name);
    assert.equal(Object.keys(require.cache).some(p => /src[\\/]core[\\/]config/.test(p)), false);
});

test("Button defaults to button and forwards native props, aria and classes", () => {
    const html = render("Button", { className: "custom", "aria-label": "Save now", "data-probe": "native", name: "save", type: "submit", variant: "primary" }, "Save");
    for (const text of ['type="submit"', 'aria-label="Save now"', 'data-probe="native"', 'name="save"', "custom"]) assert.ok(html.includes(text), text);
    assert.ok(render("Button", {}, "Action").includes('type="button"'));
});

test("loading Button is busy and natively disabled without losing its label", () => {
    const html = render("Button", { loading: true }, "Verify");
    assert.ok(html.includes("disabled")); assert.ok(html.includes('aria-busy="true"')); assert.ok(html.includes("Verify"));
    assert.equal(html.includes('role="status"'), false, "button must not create a second live status");
    assert.equal(render("Button", { loading: false }, "Ready").includes("studio-button-spinner"), false, "inactive loading must not reserve spinner space");
});

test("IconButton and icon-only Button require names and hide decorative content", () => {
    assert.throws(() => render("IconButton", { label: " " }, h("svg")), /label/i);
    const html = render("IconButton", { label: "Choose path", title: "Folder" }, h("svg", { viewBox: "0 0 16 16" }));
    assert.ok(html.includes('aria-label="Choose path"')); assert.ok(html.includes('title="Folder"')); assert.ok(html.includes('aria-hidden="true"'));
});

test("Input associates label/helper/error and preserves external descriptions", () => {
    const html = render("Input", { id: "client", label: "Client ID", helper: "Developer app ID", error: "Enter a client ID.", required: true, "aria-describedby": "external", name: "clientId", defaultValue: "example" });
    for (const text of ['for="client"', 'id="client"', 'id="client-helper"', 'id="client-error"', 'aria-invalid="true"', 'aria-describedby="external client-helper client-error"', 'name="clientId"', "required"]) assert.ok(html.includes(text), text);
});

test("generated Field IDs are unique and every high-level control is labelled", () => {
    assert.ok(studio);
    const html = renderToStaticMarkup(h("div", null, h(studio.Input, { label: "One" }), h(studio.Input, { label: "Two" })));
    const ids = [...html.matchAll(/<input[^>]*id="([^"]+)"/g)].map(m => m[1]);
    assert.equal(ids.length, 2); assert.notEqual(ids[0], ids[1]);
    assert.ok(render("Select", { id: "language", label: "Language", value: "en", options: [{ value: "en", label: "English" }], onChange() {} }).includes('for="language"'));
    assert.ok(render("Textarea", { id: "reply", label: "Reply", rows: 3, defaultValue: "Hello" }).includes('rows="3"'));
});

test("Toggle is a controlled labelled native switch", () => {
    const html = render("Toggle", { id: "tray", label: "Minimize to tray", helper: "Keep running", checked: true, disabled: true, onCheckedChange() {} });
    for (const text of ['type="checkbox"', 'role="switch"', 'aria-checked="true"', 'for="tray"', "checked", "disabled", 'aria-describedby="tray-helper"']) assert.ok(html.includes(text), text);
});

test("StatusChip has six explicit credential states and a single announcement", () => {
    const states = { verified: "Verified", unverified: "Unverified", verifying: "Verifying", failed: "Verification failed", needed: "Needs credentials", "api-draft": "API draft pending" };
    for (const [status, label] of Object.entries(states)) {
        const html = render("StatusChip", { status });
        assert.ok(html.includes(label)); assert.equal((html.match(/role="status"/g) || []).length, 1);
        assert.ok(html.includes('aria-live="polite"')); assert.ok(html.includes('aria-hidden="true"'));
        assert.equal(html.includes('data-verified-entered="true"'), false, "no initial Verified entrance");
    }
    assert.equal(render("StatusChip", { status: "verified", announce: false }).includes('role="status"'), false);
});

test("Setting surfaces preserve semantic headings and native attributes", () => {
    assert.ok(render("SettingCard", { heading: "Credentials", id: "credentials", headingLevel: 2 }, "Fields").includes("<h2"));
    assert.ok(render("SettingGroup", { heading: "Language", headingLevel: 3 }, "Controls").includes("<h3"));
});

test("SaveDock uses Saved for local config and never equates it to Verified", () => {
    const html = render("SaveDock", { dirty: false, onSave() {}, onDiscard() {} });
    assert.ok(html.includes("Saved")); assert.equal(html.includes("Verified"), false);
    assert.ok(html.includes('aria-label="Save settings"')); assert.ok(html.includes('title="Discard unsaved settings and command edits."'));
    assert.ok(render("SaveDock", { dirty: true, onSave() {}, onDiscard() {} }).includes("Unsaved changes"));
});

test("API SaveDock reserves a hidden pending status and never renders global actions", () => {
    const html = render("SaveDock", { mode: "api", draftPending: false });
    assert.ok(html.includes("Credentials save per service")); assert.ok(html.includes('data-hidden="true"'));
    assert.equal(html.includes("<button"), false); assert.equal(html.includes(">Saved<"), false);
    assert.ok(render("SaveDock", { mode: "api", draftPending: true }).includes("API draft pending"));
});

test("SectionNav and ServiceCard compose real headings, current rows and brand icons", () => {
    const nav = render("SectionNav", { groups: [{ id: "app", label: "Application", items: [{ id: "general", label: "General" }, { id: "api", label: "API Keys" }] }], activeId: "api", onSelect() {}, onHome() {} });
    assert.ok(nav.includes('aria-current="page"')); assert.ok(nav.includes('aria-label="Return Home"'));
    for (const service of ["spotify", "kick", "twitch"]) {
        const html = render("ServiceCard", { service, status: "needed" }, "Fields");
        assert.ok(html.includes(`data-service="${service}"`)); assert.ok(html.includes('<svg')); assert.ok(html.includes('aria-hidden="true"'));
        assert.ok(html.includes("Needs credentials")); assert.equal(html.includes("Connected"), false);
    }
});

test("Studio CSS is scoped and all motion timing lives in one reduced-motion-safe source", () => {
    const dir = path.join(root, "src/ui/components/studio");
    const css = fs.readFileSync(path.join(dir, "studio.css"), "utf8");
    const motion = fs.readFileSync(path.join(dir, "motion.css"), "utf8");
    assert.equal(/(^|\n)\s*(?:body|html|:root)\b/.test(css), false);
    assert.equal(/\b\d+(?:ms|s)\b/.test(css), false, "use shared motion variables");
    assert.ok(motion.includes("prefers-reduced-motion: reduce")); assert.ok(motion.includes("animation: none"));
    assert.equal(/app-enter|page-enter|fade-up/.test(css + motion), false);
});
