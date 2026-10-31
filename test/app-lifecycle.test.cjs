"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const { createAppLifecycle } = require(path.join(
    root,
    "src/main/appLifecycle.ts"
));

function harness({
    lock = true,
    minimizeToTray = true,
    isMac = false,
    minimized = false,
} = {}) {
    const order = [];
    const listeners = new Map();
    let tray = null;
    const win = {
        destroyed: false,
        hidden: false,
        minimized,
        show() {
            this.hidden = false;
            order.push("window.show");
        },
        focus() {
            order.push("window.focus");
        },
        hide() {
            this.hidden = true;
            order.push("window.hide");
        },
        close() {
            order.push("window.close");
        },
        isDestroyed() {
            return this.destroyed;
        },
        isMinimized() {
            return this.minimized;
        },
        restore() {
            this.minimized = false;
            order.push("window.restore");
        },
    };
    const app = {
        requestSingleInstanceLock() {
            order.push("lock");
            return lock;
        },
        on(event, listener) {
            order.push(`on:${event}`);
            const current = listeners.get(event) || [];
            current.push(listener);
            listeners.set(event, current);
        },
        quit() {
            order.push("quit");
            for (const listener of listeners.get("before-quit") || []) {
                listener();
            }
        },
    };
    const lifecycle = createAppLifecycle({
        app,
        getMainWindow: () => win,
        getTray: () => tray,
        createTray: () => {
            tray = { id: "tray" };
            order.push("tray.create");
        },
        getMinimizeToTray: () => minimizeToTray,
        isMac,
        log: {
            info() {},
            warn() {},
        },
    });
    return {
        app,
        lifecycle,
        order,
        win,
        emit(event, ...args) {
            for (const listener of listeners.get(event) || []) {
                listener(...args);
            }
        },
    };
}

test("a duplicate launch does not start background work and quits immediately", () => {
    const h = harness({ lock: false });
    const started = h.lifecycle.acquireSingleInstanceLock();
    if (started) h.order.push("background.start");
    assert.equal(started, false);
    assert.deepEqual(h.order, ["lock", "quit"]);
    assert.equal(h.lifecycle.isPrimaryInstance(), false);
});

test("the primary instance focuses and restores the existing window on second launch", () => {
    const h = harness({ minimized: true });
    assert.equal(h.lifecycle.acquireSingleInstanceLock(), true);
    h.emit("second-instance");
    assert.deepEqual(h.order.slice(-3), [
        "window.restore",
        "window.show",
        "window.focus",
    ]);
});

test("native close respects close-to-tray and otherwise records a quit intent", () => {
    const trayHarness = harness({ minimizeToTray: true });
    trayHarness.lifecycle.acquireSingleInstanceLock();
    const trayEvent = { prevented: false, preventDefault() { this.prevented = true; } };
    assert.equal(
        trayHarness.lifecycle.handleWindowClose(trayEvent),
        "hide"
    );
    assert.equal(trayEvent.prevented, true);
    assert.equal(trayHarness.win.hidden, true);
    assert.ok(trayHarness.order.includes("tray.create"));
    assert.ok(!trayHarness.order.includes("quit"));

    const closeHarness = harness({ minimizeToTray: false });
    closeHarness.lifecycle.acquireSingleInstanceLock();
    const closeEvent = { prevented: false, preventDefault() { this.prevented = true; } };
    assert.equal(
        closeHarness.lifecycle.handleWindowClose(closeEvent),
        "close"
    );
    assert.equal(closeEvent.prevented, false);
    assert.equal(closeHarness.lifecycle.getQuitReason(), "native-close");
    closeHarness.lifecycle.handleWindowAllClosed();
    assert.equal(closeHarness.order.filter((entry) => entry === "quit").length, 1);
});

test("titlebar and tray quit share one explicit intent and bypass close-to-tray", () => {
    for (const reason of ["titlebar-close", "tray-quit"]) {
        const h = harness({ minimizeToTray: true });
        h.lifecycle.acquireSingleInstanceLock();
        h.lifecycle.requestQuit(reason);
        assert.equal(h.lifecycle.getQuitReason(), reason);
        assert.equal(h.order.filter((entry) => entry === "quit").length, 1);
        const event = { prevented: false, preventDefault() { this.prevented = true; } };
        assert.equal(h.lifecycle.handleWindowClose(event), "close");
        assert.equal(event.prevented, false);
        assert.equal(h.win.hidden, false);
    }
});

test("an installer app.quit marks the intent before close handlers run", () => {
    const h = harness({ minimizeToTray: true });
    h.lifecycle.acquireSingleInstanceLock();
    h.app.quit();
    assert.equal(h.lifecycle.getQuitReason(), "external");
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    assert.equal(h.lifecycle.handleWindowClose(event), "close");
    assert.equal(event.prevented, false);
    assert.equal(h.win.hidden, false);
    assert.equal(h.order.filter((entry) => entry === "quit").length, 1);
});

test("an installer intent is cleared when the installer cannot start", () => {
    const h = harness({ minimizeToTray: true });
    h.lifecycle.acquireSingleInstanceLock();
    h.lifecycle.beginInstallerQuit();
    assert.equal(h.lifecycle.getQuitReason(), "installer");
    h.lifecycle.cancelInstallerQuit();
    assert.equal(h.lifecycle.getQuitReason(), null);
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    assert.equal(h.lifecycle.handleWindowClose(event), "hide");
    assert.equal(event.prevented, true);
});

test("main acquires the lock before ready and routes every close path through the lifecycle", () => {
    const source = fs.readFileSync(
        path.join(root, "src/main/index.ts"),
        "utf8"
    );
    const lock = source.indexOf("appLifecycle.acquireSingleInstanceLock()");
    const ready = source.indexOf('app.on("ready"');
    assert.ok(lock > 0);
    assert.ok(ready > lock, "lock must precede app-ready/provider work");
    assert.match(
        source,
        /mainWindow\.on\("close", \(event\) => \{\s*appLifecycle\.handleWindowClose\(event\);/
    );
    assert.match(
        source,
        /label: "Quit",\s*click: \(\) => \{\s*appLifecycle\.requestQuit\("tray-quit"\)/
    );
    assert.match(
        source,
        /ipcMain\.on\("window:close"[\s\S]*appLifecycle\.requestQuit\("titlebar-close"\)/
    );
    assert.match(
        source,
        /createUpdateController\(\{[\s\S]*beforeApplyUpdate: \(\) => appLifecycle\.beginInstallerQuit\(\)[\s\S]*onInstallFailure: \(\) => appLifecycle\.cancelInstallerQuit\(\)/
    );
    assert.match(
        source,
        /window-all-closed[\s\S]*appLifecycle\.handleWindowAllClosed\(\)/
    );
});
