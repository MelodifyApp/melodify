"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const scroll = require(path.join(
    root,
    "src/features/settings/components/logScroll"
));

test("the log list follows new entries only when it is already at the bottom", () => {
    assert.equal(
        scroll.isLogListAtBottom({ scrollTop: 0, scrollHeight: 340, clientHeight: 340 }),
        true
    );
    assert.equal(
        scroll.isLogListAtBottom({ scrollTop: 20, scrollHeight: 500, clientHeight: 340 }),
        false
    );
    assert.equal(
        scroll.isLogListAtBottom({ scrollTop: 160, scrollHeight: 500, clientHeight: 340 }),
        true
    );
});

test("the log list treats a small bottom gap as still following", () => {
    assert.equal(
        scroll.isLogListAtBottom({ scrollTop: 155, scrollHeight: 500, clientHeight: 340 }),
        true
    );
    assert.equal(
        scroll.isLogListAtBottom({ scrollTop: 150, scrollHeight: 500, clientHeight: 340 }),
        false
    );
});
