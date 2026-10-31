"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
const originalCss = require.extensions[".css"];

function loadModule(relativePath, fresh = false) {
    Module._resolveFilename = function (request, ...args) {
        return originalResolve.call(
            this,
            request.startsWith("@/")
                ? path.join(root, "src", request.slice(2))
                : request,
            ...args
        );
    };
    try {
        const resolved = require.resolve(path.join(root, relativePath));
        if (fresh) delete require.cache[resolved];
        return require(resolved);
    } finally {
        Module._resolveFilename = originalResolve;
    }
}

function withCssStub(callback) {
    require.extensions[".css"] = () => {};
    try {
        return callback();
    } finally {
        if (originalCss) require.extensions[".css"] = originalCss;
        else delete require.extensions[".css"];
    }
}

function renderComponent(component, props = {}) {
    return renderToStaticMarkup(React.createElement(component, props));
}

function renderWithI18n(relativePath, props = {}) {
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
                return {
                    useTranslation: () => ({
                        t: (key, options) =>
                            options && options.version
                                ? `${key}:${options.version}`
                                : key,
                    }),
                };
            }
            return originalLoad.call(this, request, parent, isMain);
        };
        try {
            const resolved = require.resolve(path.join(root, relativePath));
            const Component = require(resolved).default;
            return renderComponent(Component, props);
        } finally {
            Module._resolveFilename = originalResolve;
            Module._load = originalLoad;
        }
    });
}

function readSource(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function createBridge(snapshot = { status: null, data: null }) {
    const listeners = new Map();
    return {
        invocations: [],
        async invoke(channel) {
            assert.equal(channel, "update:getStatus");
            this.invocations.push(channel);
            return snapshot;
        },
        on(channel, listener) {
            listeners.set(channel, listener);
        },
        removeListener(channel, listener) {
            if (listeners.get(channel) === listener) listeners.delete(channel);
        },
        emit(...args) {
            listeners.get("update:status")?.(...args);
        },
        listenerCount() {
            return listeners.size;
        },
    };
}

const updateStatusStoreModule = loadModule(
    "src/ui/updateStatusStore.ts"
);
const useUpdateStatus =
    loadModule("src/ui/hooks/useUpdateStatus.ts").useUpdateStatus;

function UpdateProbe({ store }) {
    const state = useUpdateStatus(store);
    return React.createElement(
        "span",
        null,
        JSON.stringify({
            status: state.status,
            percent: state.progress?.percent ?? null,
            version: state.manifest?.version ?? null,
        })
    );
}

test("Home does not claim up to date before any update state arrives", () => {
    const singleton = updateStatusStoreModule.updateStatusStore;
    assert.equal(singleton.getSnapshot().status, null);

    const html = renderWithI18n("src/ui/components/HomePage.tsx");
    assert.match(html, /home\.updateStatusUnavailable/);
    assert.doesNotMatch(html, /home\.upToDate/);

    const dialog = renderWithI18n("src/ui/components/UpdateDialog.tsx");
    assert.equal(dialog, "");
});

test("a remounted consumer hydrates from update events received while unmounted", async () => {
    const store = updateStatusStoreModule.createUpdateStatusStore();
    const bridge = createBridge();
    await store.initialize(bridge);

    assert.equal(store.getSnapshot().status, null);
    bridge.emit("available", { version: "2.4.0" });
    bridge.emit("downloading", {
        percent: 37,
        transferred: 370,
        total: 1000,
    });

    assert.deepEqual(store.getSnapshot(), {
        status: "downloading",
        progress: { percent: 37, transferred: 370, total: 1000 },
        manifest: { version: "2.4.0" },
        errorMessage: null,
    });

    const html = renderComponent(UpdateProbe, { store });
    assert.match(html, /&quot;status&quot;:&quot;downloading&quot;/);
    assert.match(html, /&quot;percent&quot;:37/);
    assert.match(html, /&quot;version&quot;:&quot;2.4.0&quot;/);

    bridge.emit("downloaded");
    const remounted = renderComponent(UpdateProbe, { store });
    assert.match(remounted, /&quot;status&quot;:&quot;downloaded&quot;/);
});

test("the store hydrates the authoritative main-process snapshot", async () => {
    const store = updateStatusStoreModule.createUpdateStatusStore();
    const bridge = createBridge({
        status: "downloaded",
        data: null,
    });

    await store.initialize(bridge);

    assert.equal(bridge.invocations[0], "update:getStatus");
    assert.deepEqual(store.getSnapshot(), {
        status: "downloaded",
        progress: null,
        manifest: null,
        errorMessage: null,
    });
    const html = renderComponent(UpdateProbe, { store });
    assert.match(html, /&quot;status&quot;:&quot;downloaded&quot;/);
});

test("main retains the latest update status even when no renderer is listening", () => {
    const { createUpdateStatusSnapshot } = loadModule(
        "src/main/updateSnapshot.ts"
    );
    const snapshot = createUpdateStatusSnapshot();
    assert.deepEqual(snapshot.read(), { status: null, data: null });

    snapshot.record("available", { version: "3.0.0" });
    snapshot.record("downloading", { percent: 10 });
    assert.deepEqual(snapshot.read(), {
        status: "downloading",
        data: { percent: 10 },
    });

    snapshot.record("not-real", {});
    assert.deepEqual(snapshot.read(), {
        status: "downloading",
        data: { percent: 10 },
    });

    const mainSource = readSource("src/main/index.ts");
    assert.match(mainSource, /ipcMain\.handle\("update:getStatus"/);
    assert.match(mainSource, /updateStatusSnapshot\.record\(/);
    assert.match(
        readSource("src/shared/ipcChannels.ts"),
        /"update:getStatus"/
    );
});

test("the update dialog also reflects the shared downloaded state", () => {
    updateStatusStoreModule.updateStatusStore.applyEvent(
        "downloaded",
        null
    );
    const html = renderWithI18n("src/ui/components/UpdateDialog.tsx");
    assert.match(html, /updates\.readyTitle/);
    assert.doesNotMatch(html, /updates\.availableTitle/);
});
