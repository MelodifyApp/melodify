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
