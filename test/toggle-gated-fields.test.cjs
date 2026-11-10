"use strict";

/**
 * Feature-toggle-gated fields stay mounted and are disabled while the
 * feature is off, so turning a toggle on never inserts new controls or
 * shifts the page. Status/progress conditionals are intentionally out of
 * scope; these contracts cover the Settings field rows only.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;

function withCssStub(callback) {
    const originalCss = require.extensions[".css"];
    require.extensions[".css"] = () => {};
    try {
        return callback();
    } finally {
        if (originalCss) require.extensions[".css"] = originalCss;
        else delete require.extensions[".css"];
    }
}

function loadSection(relativePath, props) {
    return withCssStub(() => {
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
                return { useTranslation: () => ({ t: (key) => key }) };
            }
            return originalLoad.call(this, request, parent, isMain);
        };
        try {
            const resolved = require.resolve(path.join(root, relativePath));
            delete require.cache[resolved];
            const Section = require(resolved).default;
            return renderToStaticMarkup(React.createElement(Section, props));
        } finally {
            Module._resolveFilename = originalResolve;
            Module._load = originalLoad;
        }
    });
}

function renderRequests(config) {
    return loadSection(
        "src/features/settings/components/sections/Requests.tsx",
        { config, onConfigChange() {} }
    );
}

function renderCommands(config, commands) {
    return loadSection(
        "src/features/settings/components/sections/Commands.tsx",
        { config, commands, onConfigChange() {}, onCommandToggle() {} }
    );
}

function readSource(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function tagById(html, tagName, id) {
    const match = html.match(
        new RegExp(`<${tagName}[^>]*\\bid="${id}"[^>]*>`)
    );
    assert.ok(match, `missing ${tagName}#${id}`);
    return match[0];
}

function tagByAriaLabel(html, tagName, label) {
    const match = html.match(
        new RegExp(`<${tagName}[^>]*\\baria-label="${label}"[^>]*>`)
    );
    assert.ok(match, `missing ${tagName}[aria-label="${label}"]`);
    return match[0];
}

function isDisabled(tag) {
    return /\sdisabled(=|>|\s|\/)/.test(tag);
}

const REQUEST_GATED_FIELDS = [
    ["requests-success-template", "replyOnSongRequest"],
    ["requests-error-template", "replyOnSongRequestError"],
    ["requests-global-cooldown-seconds", "globalCooldownEnabled"],
    ["requests-per-user-cooldown-seconds", "perUserCooldownEnabled"],
    ["requests-cooldown-template", "replyOnCooldown"],
    ["requests-song-file-path", "saveCurrentSongToFile"],
];

function requestConfig(overrides = {}) {
    return {
        canAnyonePlaySong: false,
        currentSongFormat: "{title} - {artist}",
        saveCurrentSongToFile: false,
        currentSongFilePath: "C:\\Users\\Example\\current-song.txt",
        replyOnSongRequest: false,
        replyOnSongRequestError: false,
        globalCooldownEnabled: false,
        perUserCooldownEnabled: false,
        replyOnCooldown: false,
        songRequestReplyTemplate: "Added {title}",
        songRequestErrorTemplate: "Failed: {error}",
        globalCooldownSeconds: "45",
        perUserCooldownSeconds: "90",
        cooldownMessageTemplate: "Wait {time}",
        rewardTitle: "Song Request",
        twitchRewardTitle: "Song Request",
        ...overrides,
    };
}

test("Song Request fields stay mounted and disabled while their toggles are off", () => {
    const html = renderRequests(requestConfig());

    for (const [id] of REQUEST_GATED_FIELDS) {
        const tag = tagById(html, "input", id);
        assert.ok(isDisabled(tag), `${id} must be disabled while its feature is off`);
    }

    const chooser = tagByAriaLabel(
        html,
        "button",
        "requests.chooseFilePath"
    );
    assert.ok(
        isDisabled(chooser),
        "the Choose path button must be disabled while file output is off"
    );

    for (const value of [
        "Added {title}",
        "Failed: {error}",
        "45",
        "90",
        "Wait {time}",
        "C:\\Users\\Example\\current-song.txt",
    ]) {
        assert.match(
            html,
            new RegExp(`value="${value.replace(/[\\{]/g, "\\$&")}"`),
            `value ${value} must survive the disabled state`
        );
    }

    assert.doesNotMatch(
        html,
        /requests-(success|error|cooldown)-template[^>]*aria-invalid="true"/
    );
    assert.doesNotMatch(html, /role="alert"/);
});

test("the same Song Request fields become enabled without being remounted", () => {
    const html = renderRequests(
        requestConfig({
            replyOnSongRequest: true,
            replyOnSongRequestError: true,
            globalCooldownEnabled: true,
            perUserCooldownEnabled: true,
            replyOnCooldown: true,
            saveCurrentSongToFile: true,
        })
    );

    for (const [id] of REQUEST_GATED_FIELDS) {
        const tag = tagById(html, "input", id);
        assert.equal(
            isDisabled(tag),
            false,
            `${id} must be enabled while its feature is on`
        );
    }

    const chooser = tagByAriaLabel(
        html,
        "button",
        "requests.chooseFilePath"
    );
    assert.equal(isDisabled(chooser), false);
});

test("disabled Request templates suppress stale validation errors until re-enabled", () => {
    const path = require("../src/features/settings/components/requestsView");
    assert.equal(
        path.enabledFieldError(false, "Template must include {title}"),
        undefined
    );
    assert.equal(path.enabledFieldError(true, "Template must include {title}"), "Template must include {title}");
    assert.equal(path.enabledFieldError(true, null), undefined);

    const source = readSource(
        "src/features/settings/components/sections/Requests.tsx"
    );
    assert.match(
        source,
        /error=\{enabledFieldError\(\s*config\.replyOnSongRequest === true,\s*validationErrors\.songRequestReplyTemplate\s*\)\}/
    );
    assert.match(
        source,
        /error=\{enabledFieldError\(\s*config\.replyOnSongRequestError === true,\s*validationErrors\.songRequestErrorTemplate\s*\)\}/
    );
});

const COMMAND_GATED_FIELDS = [
    ["command-sr-success-template", "command-sr-reply-success"],
    ["command-sr-error-template", "command-sr-reply-error"],
    ["command-volume-success-template", "command-volume-reply-success"],
    ["command-volume-error-template", "command-volume-reply-error"],
    ["command-volume-get-template", "command-volume-reply-get"],
];

function commandConfig(overrides = {}) {
    return {
        prefix: "!",
        commands: {
            sr: { aliases: ["songrequest"] },
            volume: { aliases: ["vol"] },
        },
        replyOnSongRequest: false,
        replyOnSongRequestError: false,
        replyOnVolumeChange: false,
        replyOnVolumeError: false,
        replyOnVolumeGet: false,
        songRequestReplyTemplate: "Added {title}",
        songRequestErrorTemplate: "Failed: {error}",
        volumeChangeReplyTemplate: "Volume {volume}",
        volumeErrorTemplate: "Volume failed: {error}",
        volumeGetReplyTemplate: "Current volume {volume}",
        ...overrides,
    };
}

test("Command reply templates stay mounted and disabled while their toggles are off", () => {
    const html = renderCommands(commandConfig(), [
        { name: "sr", enabled: true },
        { name: "volume", enabled: true },
    ]);

    for (const [id] of COMMAND_GATED_FIELDS) {
        const tag = tagById(html, "input", id);
        assert.ok(isDisabled(tag), `${id} must be disabled while its toggle is off`);
    }

    for (const value of [
        "Added {title}",
        "Failed: {error}",
        "Volume {volume}",
        "Volume failed: {error}",
        "Current volume {volume}",
    ]) {
        assert.match(html, new RegExp(`value="${value.replace(/[\\{]/g, "\\$&")}"`));
    }
});

test("Command reply templates become enabled when their toggles are on", () => {
    const html = renderCommands(
        commandConfig({
            replyOnSongRequest: true,
            replyOnSongRequestError: true,
            replyOnVolumeChange: true,
            replyOnVolumeError: true,
            replyOnVolumeGet: true,
        }),
        [
            { name: "sr", enabled: true },
            { name: "volume", enabled: true },
        ]
    );

    for (const [id] of COMMAND_GATED_FIELDS) {
        const tag = tagById(html, "input", id);
        assert.equal(
            isDisabled(tag),
            false,
            `${id} must be enabled while its toggle is on`
        );
    }
});

test("the command-specific reply block remains conditional on command support", () => {
    const html = renderCommands(commandConfig(), [
        { name: "skip", enabled: true },
    ]);

    assert.doesNotMatch(html, /studio-command-replies/);
    assert.doesNotMatch(html, /command-skip-success-template/);
    assert.doesNotMatch(html, /command-skip-error-template/);
});

test("Settings sections no longer conditionally render feature-gated fields", () => {
    const requests = readSource(
        "src/features/settings/components/sections/Requests.tsx"
    );
    const commands = readSource(
        "src/features/settings/components/sections/Commands.tsx"
    );

    for (const [toggle] of [
        ["replyOnSongRequest"],
        ["replyOnSongRequestError"],
        ["globalCooldownEnabled"],
        ["perUserCooldownEnabled"],
        ["replyOnCooldown"],
    ]) {
        assert.doesNotMatch(
            requests,
            new RegExp(`config\\.${toggle}\\s*&&\\s*\\(?\\s*<(Input|Field)`),
            `${toggle} must not gate the field's presence`
        );
    }
    assert.doesNotMatch(requests, /showSongFileControls\(config\)\s*&&/);

    assert.doesNotMatch(
        commands,
        /config\[\s*replyConfig\.(successToggle|errorToggle|getToggle)\s*\]\s*&&\s*\(?\s*<(Input|Field)/
    );
    assert.match(
        commands,
        /\{replyConfig && \(\s*<div className="studio-command-replies">/
    );
});

test("no Settings section couples a config toggle to a field's presence", () => {
    const sectionsDir = path.join(
        root,
        "src/features/settings/components/sections"
    );
    for (const file of fs.readdirSync(sectionsDir)) {
        if (!file.endsWith(".tsx")) continue;
        const source = fs.readFileSync(path.join(sectionsDir, file), "utf8");
        assert.doesNotMatch(
            source,
            /config(?:\.[A-Za-z0-9_]+|\[[^\]]+\])\s*&&\s*\(?\s*<(Input|Field|Select|Textarea|Toggle|Button|IconButton)\b/,
            `${file} must keep toggle-gated controls mounted`
        );
    }
});
