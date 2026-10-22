"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
    isPathInsideDirectory,
    validateUpdateArtifact,
    createUpdateController,
    statUpdateArtifact,
    INSTALLER_EXTENSIONS,
} = require("../src/main/updateController");

const TEMP_DIR = "C:\\Users\\tester\\AppData\\Local\\Temp";
const TEMP_EXE = path.join(TEMP_DIR, "Melodify.Setup.exe");

test("isPathInsideDirectory only accepts paths below the directory", () => {
    assert.equal(isPathInsideDirectory(TEMP_EXE, TEMP_DIR, "win32"), true);
    assert.equal(
        isPathInsideDirectory(
            path.join(TEMP_DIR, "nested", "Melodify.Setup.exe"),
            TEMP_DIR,
            "win32"
        ),
        true
    );
    // Case-insensitive on Windows.
    assert.equal(
        isPathInsideDirectory(
            "c:\\users\\TESTER\\appdata\\local\\temp\\Melodify.Setup.exe",
            TEMP_DIR,
            "win32"
        ),
        true
    );

    for (const candidate of [
        "C:\\Users\\tester\\evil.exe",
        "C:\\Users\\tester\\AppData\\Local\\Temp-evil\\evil.exe",
        path.join(TEMP_DIR, "..", "..", "evil.exe"),
        path.join(TEMP_DIR, "..", "evil.exe"),
        TEMP_DIR,
        "",
        "   ",
        42,
        null,
        undefined,
        {},
    ]) {
        assert.equal(
            isPathInsideDirectory(candidate, TEMP_DIR, "win32"),
            false,
            JSON.stringify(candidate)
        );
    }

    assert.equal(isPathInsideDirectory("/tmp/x.exe", "/tmp", "linux"), true);
    assert.equal(
        isPathInsideDirectory("/tmp/../etc/passwd", "/tmp", "linux"),
        false
    );
    assert.equal(isPathInsideDirectory("/tmp-evil/x", "/tmp", "linux"), false);
});

test("validateUpdateArtifact accepts only installer types inside the temp directory", () => {
    const valid = validateUpdateArtifact({
        filePath: TEMP_EXE,
        platform: "win32",
        tempDir: TEMP_DIR,
        exists: true,
        size: 1024,
    });
    assert.equal(valid.ok, true);
    assert.equal(valid.path, path.resolve(TEMP_EXE));

    assert.equal(
        validateUpdateArtifact({
            filePath: path.join(TEMP_DIR, "Melodify.Setup.msi"),
            platform: "win32",
            tempDir: TEMP_DIR,
            exists: true,
            size: 10,
        }).ok,
        true
    );

    const rejected = [
        { filePath: path.join(TEMP_DIR, "Melodify-1.0.7-full.nupkg"), exists: true, size: 10 },
        { filePath: path.join(TEMP_DIR, "RELEASES"), exists: true, size: 10 },
        { filePath: path.join(TEMP_DIR, "payload.zip"), exists: true, size: 10 },
        { filePath: path.join(TEMP_DIR, "run.bat"), exists: true, size: 10 },
        { filePath: path.join(TEMP_DIR, "run.ps1"), exists: true, size: 10 },
        { filePath: path.join(TEMP_DIR, "setup.exe.txt"), exists: true, size: 10 },
        { filePath: path.join(TEMP_DIR, "..", "..", "evil.exe"), exists: true, size: 10 },
        { filePath: "C:\\Users\\tester\\evil.exe", exists: true, size: 10 },
        { filePath: TEMP_EXE, exists: false, size: 0 },
        { filePath: TEMP_EXE, exists: true, size: 0 },
        { filePath: "", exists: true, size: 10 },
        { filePath: null, exists: true, size: 10 },
        { filePath: 42, exists: true, size: 10 },
    ];
    for (const input of rejected) {
        const result = validateUpdateArtifact({
            platform: "win32",
            tempDir: TEMP_DIR,
            ...input,
        });
        assert.equal(
            result.ok,
            false,
            `expected rejection for ${JSON.stringify(input)}`
        );
        assert.equal(typeof result.reason, "string");
        assert.equal(result.path, undefined);
    }

    // Platform-specific installer types stay allowed.
    assert.equal(
        validateUpdateArtifact({
            filePath: "/tmp/Melodify.dmg",
            platform: "darwin",
            tempDir: "/tmp",
            exists: true,
            size: 5,
        }).ok,
        true
    );
    assert.equal(
        validateUpdateArtifact({
            filePath: "/tmp/Melodify.AppImage",
            platform: "linux",
            tempDir: "/tmp",
            exists: true,
            size: 5,
        }).ok,
        true
    );
    assert.equal(
        validateUpdateArtifact({
            filePath: "/tmp/Melodify.tar.gz",
            platform: "linux",
            tempDir: "/tmp",
            exists: true,
            size: 5,
        }).ok,
        true
    );
    assert.equal(
        validateUpdateArtifact({
            filePath: "/tmp/Melodify.exe",
            platform: "freebsd",
            tempDir: "/tmp",
            exists: true,
            size: 5,
        }).ok,
        false
    );

    assert.deepEqual(Object.keys(INSTALLER_EXTENSIONS).sort(), [
        "darwin",
        "linux",
        "win32",
    ]);
});

function harness(overrides = {}) {
    const broadcasts = [];
    const logs = [];
    const calls = { check: 0, download: 0, apply: 0 };
    const stat = overrides.stat ?? {
        exists: true,
        size: 4096,
        isSymlink: false,
        linkCount: 1,
        realPath: path.resolve(TEMP_EXE),
    };
    const updater =
        overrides.updater === undefined
            ? {
                  checkForUpdates: async () => {
                      calls.check += 1;
                  },
                  downloadUpdate: async () => {
                      calls.download += 1;
                      return TEMP_EXE;
                  },
                  applyUpdate: () => {
                      calls.apply += 1;
                  },
              }
            : overrides.updater;

    const controller = createUpdateController({
        updater,
        platform: "win32",
        tempDir: TEMP_DIR,
        realTempDir: TEMP_DIR,
        statFile: () => stat,
        broadcast: (channel, ...args) => broadcasts.push([channel, ...args]),
        log: {
            info: (message) => logs.push(["info", message]),
            warn: (message) => logs.push(["warn", message]),
            error: (error, message) => logs.push(["error", message, error]),
        },
    });

    return { controller, broadcasts, logs, calls, stat };
}

function statuses(broadcasts) {
    return broadcasts
        .filter(([channel]) => channel === "update:status")
        .map(([, status]) => status);
}

test("a validated download unlocks install and emits downloaded once", async () => {
    const h = harness();

    await h.controller.downloadUpdate();
    assert.deepEqual(statuses(h.broadcasts), ["downloaded"]);
    assert.equal(h.controller.getValidatedArtifactPath(), path.resolve(TEMP_EXE));

    h.controller.installUpdate();
    assert.equal(h.calls.apply, 1);
});

test("an artifact outside the temp directory or of the wrong type is rejected", async () => {
    for (const downloadPath of [
        "C:\\Users\\tester\\evil.exe",
        path.join(TEMP_DIR, "..", "..", "evil.exe"),
        path.join(TEMP_DIR, "Melodify-1.0.7-full.nupkg"),
        path.join(TEMP_DIR, "run.bat"),
    ]) {
        const h = harness({
            updater: {
                checkForUpdates: async () => {},
                downloadUpdate: async () => downloadPath,
                applyUpdate: () => {
                    h.calls.apply += 1;
                },
            },
        });

        await h.controller.downloadUpdate();

        assert.equal(
            statuses(h.broadcasts).includes("downloaded"),
            false,
            `must not announce ${downloadPath}`
        );
        assert.deepEqual(statuses(h.broadcasts), ["error"]);
        assert.equal(h.controller.getValidatedArtifactPath(), null);

        h.controller.installUpdate();
        assert.equal(h.calls.apply, 0, "install must stay blocked");
        assert.deepEqual(statuses(h.broadcasts), ["error", "error"]);
    }
});

test("install is refused without a validated artifact or when it disappeared", async () => {
    const never = harness();
    never.controller.installUpdate();
    assert.equal(never.calls.apply, 0);
    assert.deepEqual(statuses(never.broadcasts), ["error"]);

    const h = harness();
    await h.controller.downloadUpdate();
    h.stat.exists = false;
    h.controller.installUpdate();
    assert.equal(h.calls.apply, 0);
    assert.deepEqual(statuses(h.broadcasts), ["downloaded", "error"]);
    assert.equal(h.controller.getValidatedArtifactPath(), null);
});

test("download failures clear the validated artifact and block install", async () => {
    const h = harness({
        updater: {
            checkForUpdates: async () => {},
            downloadUpdate: async () => {
                throw new Error("network down");
            },
            applyUpdate: () => {
                h.calls.apply += 1;
            },
        },
    });

    await h.controller.downloadUpdate();
    assert.deepEqual(statuses(h.broadcasts), ["error"]);
    assert.equal(h.controller.getValidatedArtifactPath(), null);

    h.controller.installUpdate();
    assert.equal(h.calls.apply, 0);
});

test("a missing updater is reported and never applied", async () => {
    const h = harness({ updater: null });

    await h.controller.checkForUpdates();
    await h.controller.downloadUpdate();
    h.controller.installUpdate();

    assert.equal(h.calls.apply, 0);
    assert.deepEqual(statuses(h.broadcasts), ["error", "error", "error"]);
});

test("checkForUpdates delegates once and reports errors", async () => {
    const ok = harness();
    await ok.controller.checkForUpdates();
    assert.equal(ok.calls.check, 1);
    assert.deepEqual(ok.broadcasts, []);

    const failing = harness({
        updater: {
            checkForUpdates: async () => {
                throw new Error("github unreachable");
            },
            downloadUpdate: async () => TEMP_EXE,
            applyUpdate: () => {},
        },
    });
    await failing.controller.checkForUpdates();
    assert.deepEqual(statuses(failing.broadcasts), ["error"]);
});

test("a rejecting applyUpdate is reported instead of escaping unhandled", async () => {
    const h = harness({
        updater: {
            checkForUpdates: async () => {},
            downloadUpdate: async () => TEMP_EXE,
            applyUpdate: () => Promise.reject(new Error("installer refused")),
        },
    });

    await h.controller.downloadUpdate();
    h.controller.installUpdate();
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(statuses(h.broadcasts), ["downloaded", "error"]);
});

test("main process wires the controller and never applies a path directly", () => {
    const source = fs.readFileSync(
        path.join(__dirname, "..", "src", "main", "index.ts"),
        "utf8"
    );

    assert.match(source, /createUpdateController\(/);
    assert.match(source, /updateController\.checkForUpdates\(/);
    assert.match(source, /updateController\.downloadUpdate\(/);
    assert.match(source, /updateController\.installUpdate\(/);
    // applyUpdate must only be reachable through the validating controller.
    assert.doesNotMatch(source, /updater\.applyUpdate\(/);
    assert.doesNotMatch(source, /updater\.downloadUpdate\(/);
    // The library's own "downloaded" event fires before validation, so the UI
    // status must come from the controller instead.
    assert.doesNotMatch(source, /updater\.on\("downloaded"/);
    // The stat boundary must not follow links into the artifact.
    assert.match(source, /statUpdateArtifact\(/);
});

test("validateUpdateArtifact rejects symlinks, hardlinks and out-of-root real paths", () => {
    const base = {
        filePath: TEMP_EXE,
        platform: "win32",
        tempDir: TEMP_DIR,
        exists: true,
        size: 4096,
        realTempDir: TEMP_DIR,
    };

    const symlink = validateUpdateArtifact({
        ...base,
        isSymlink: true,
        linkCount: 1,
        realPath: TEMP_EXE,
    });
    assert.equal(symlink.ok, false);
    assert.match(symlink.reason, /symbolic link/i);

    const hardlink = validateUpdateArtifact({
        ...base,
        isSymlink: false,
        linkCount: 2,
        realPath: TEMP_EXE,
    });
    assert.equal(hardlink.ok, false);
    assert.match(hardlink.reason, /hard link/i);

    const escaped = validateUpdateArtifact({
        ...base,
        isSymlink: false,
        linkCount: 1,
        realPath: "C:\\Users\\tester\\evil.exe",
    });
    assert.equal(escaped.ok, false);
    assert.match(escaped.reason, /real path/i);

    // A resolved path that could not be computed must not be trusted either.
    const unresolved = validateUpdateArtifact({
        ...base,
        isSymlink: false,
        linkCount: 1,
        realPath: undefined,
    });
    assert.equal(unresolved.ok, false);

    const accepted = validateUpdateArtifact({
        ...base,
        isSymlink: false,
        linkCount: 1,
        realPath: path.resolve(TEMP_EXE),
    });
    assert.equal(accepted.ok, true);
    assert.equal(accepted.path, path.resolve(TEMP_EXE));
});

test("controller keeps install blocked when the artifact is a link", async () => {
    const linkedStats = [
        {
            exists: true,
            size: 4096,
            isSymlink: true,
            linkCount: 1,
            realPath: path.resolve(TEMP_EXE),
        },
        {
            exists: true,
            size: 4096,
            isSymlink: false,
            linkCount: 2,
            realPath: path.resolve(TEMP_EXE),
        },
        {
            exists: true,
            size: 4096,
            isSymlink: false,
            linkCount: 1,
            realPath: "C:\\Users\\tester\\evil.exe",
        },
    ];

    for (const stat of linkedStats) {
        const h = harness({ stat });
        await h.controller.downloadUpdate();

        assert.deepEqual(statuses(h.broadcasts), ["error"]);
        assert.equal(h.controller.getValidatedArtifactPath(), null);

        h.controller.installUpdate();
        assert.equal(h.calls.apply, 0);
    }
});

test("statUpdateArtifact detects a real hardlink on disk", (t) => {
    const os = require("node:os");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "melodify-update-test-"));
    const realTempDir = fs.realpathSync(root);
    try {
        const target = path.join(root, "target.exe");
        const link = path.join(root, "Melodify.Setup.exe");
        fs.writeFileSync(target, "payload");

        // A normal file is accepted.
        const plain = statUpdateArtifact(target, fs, realTempDir);
        assert.equal(plain.exists, true);
        assert.equal(plain.isSymlink, false);
        assert.equal(plain.linkCount, 1);
        assert.equal(
            validateUpdateArtifact({
                filePath: target,
                platform: "win32",
                tempDir: root,
                exists: plain.exists,
                size: plain.size,
                isSymlink: plain.isSymlink,
                linkCount: plain.linkCount,
                realPath: plain.realPath,
                realTempDir,
            }).ok,
            true
        );

        // A hardlink reports more than one link and is rejected.
        fs.linkSync(target, link);
        const hardlinked = statUpdateArtifact(link, fs, realTempDir);
        assert.equal(hardlinked.exists, true);
        assert.equal(hardlinked.linkCount, 2);
        const check = validateUpdateArtifact({
            filePath: link,
            platform: "win32",
            tempDir: root,
            exists: hardlinked.exists,
            size: hardlinked.size,
            isSymlink: hardlinked.isSymlink,
            linkCount: hardlinked.linkCount,
            realPath: hardlinked.realPath,
            realTempDir,
        });
        assert.equal(check.ok, false);
        assert.match(check.reason, /hard link/i);

        // A symlink is reported as such when the platform allows creating one.
        const symlinkPath = path.join(root, "Symlink.Setup.exe");
        let symlinkCreated = false;
        try {
            fs.symlinkSync(target, symlinkPath);
            symlinkCreated = true;
        } catch {
            // Windows without Developer Mode/admin cannot create symlinks.
        }
        if (symlinkCreated) {
            const linked = statUpdateArtifact(symlinkPath, fs, realTempDir);
            assert.equal(linked.isSymlink, true);
            const symlinkCheck = validateUpdateArtifact({
                filePath: symlinkPath,
                platform: "win32",
                tempDir: root,
                exists: linked.exists,
                size: linked.size,
                isSymlink: linked.isSymlink,
                linkCount: linked.linkCount,
                realPath: linked.realPath,
                realTempDir,
            });
            assert.equal(symlinkCheck.ok, false);
            assert.match(symlinkCheck.reason, /symbolic link/i);
        } else {
            t.diagnostic(
                "symlink creation not permitted on this host; the pure symlink test still covers the rule"
            );
        }
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
        assert.equal(fs.existsSync(root), false);
    }
});
