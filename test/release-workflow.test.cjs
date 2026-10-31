"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const yaml = require("js-yaml");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(
    root,
    ".github",
    "workflows",
    "build-and-publish.yml"
);
const checklistPath = path.join(root, "docs", "RELEASE-CHECKLIST.md");
const releaseScriptPath = path.join(root, "scripts", "release-assets.cjs");

function loadWorkflow() {
    return yaml.load(fs.readFileSync(workflowPath, "utf8"));
}

function triggerOf(workflow) {
    return workflow.on || workflow[true];
}

function allSteps(workflow) {
    return Object.values(workflow.jobs).flatMap((job) => job.steps || []);
}

function stepNamed(job, name) {
    const step = (job.steps || []).find((candidate) => candidate.name === name);
    assert.ok(step, `missing step: ${name}`);
    return step;
}

const PINNED_ACTIONS = {
    "actions/checkout": "11d5960a326750d5838078e36cf38b85af677262",
    "actions/setup-node": "49933ea5288caeca8642d1e84afbd3f7d6820020",
    "actions/upload-artifact": "ea165f8d65b6e75b540449e92b4886f43607fa02",
    "actions/download-artifact": "d3f86a106a0bac45b974a628896c90dbdf5c8093",
};

test("release workflow keeps read-only defaults and pins every action", () => {
    const workflow = loadWorkflow();
    assert.deepEqual(workflow.permissions, { contents: "read" });
    assert.deepEqual(triggerOf(workflow).push.tags, ["v*.*.*"]);

    for (const step of allSteps(workflow)) {
        if (!step.uses) continue;
        const match = /^(actions\/[a-z-]+)@([0-9a-f]{40})$/.exec(step.uses);
        assert.ok(match, `unpinned action: ${step.uses}`);
        assert.equal(
            match[2],
            PINNED_ACTIONS[match[1]],
            `${match[1]} must use the reviewed commit`
        );
    }
});

test("build job is read-only, uses npm ci, and uploads release assets", () => {
    const workflow = loadWorkflow();
    const build = workflow.jobs.build;
    assert.ok(build);
    assert.equal(build.permissions?.contents ?? "read", "read");
    assert.doesNotMatch(JSON.stringify(build), /contents"?\s*:\s*"write"/);

    const checkout = stepNamed(build, "Checkout code");
    assert.equal(
        checkout.uses,
        `actions/checkout@${PINNED_ACTIONS["actions/checkout"]}`
    );
    assert.equal(checkout.with?.["persist-credentials"], false);

    const setup = stepNamed(build, "Setup Node");
    assert.equal(
        setup.uses,
        `actions/setup-node@${PINNED_ACTIONS["actions/setup-node"]}`
    );

    const install = stepNamed(build, "Install dependencies");
    assert.match(install.run, /npm ci\b/);
    assert.doesNotMatch(install.run, /npm install\b/);

    const make = stepNamed(build, "Make Windows distributables");
    assert.match(make.run, /npm run make\b/);

    const prepare = stepNamed(build, "Prepare and verify release assets");
    assert.match(prepare.run, /release-assets\.cjs prepare/);

    const upload = stepNamed(build, "Upload release assets");
    assert.equal(
        upload.uses,
        `actions/upload-artifact@${PINNED_ACTIONS["actions/upload-artifact"]}`
    );
    assert.equal(upload.with?.path, "release-assets");
    assert.equal(upload.with?.["if-no-files-found"], "error");
});

test("publish job is write-scoped, protected, and does not install or build", () => {
    const workflow = loadWorkflow();
    const publish = workflow.jobs.publish;
    assert.ok(publish);
    assert.equal(publish.needs, "build");
    assert.equal(publish.environment, "release");
    assert.deepEqual(publish.permissions, { contents: "write" });
    assert.doesNotMatch(
        JSON.stringify(publish),
        /actions\/checkout|npm ci|npm install|npm run make|npm run publish|electron-forge/i
    );

    const download = stepNamed(
        publish,
        "Download Windows release artifacts"
    );
    assert.equal(
        download.uses,
        `actions/download-artifact@${PINNED_ACTIONS["actions/download-artifact"]}`
    );
    assert.equal(download.with?.path, "release-assets");

    const verify = stepNamed(publish, "Verify release assets");
    assert.match(verify.run, /release-assets\.cjs verify/);
    assert.match(verify.run, /GITHUB_REF_NAME/);

    const draft = stepNamed(
        publish,
        "Create or update draft release and upload assets"
    );
    assert.match(draft.run, /gh release create[^\n]*--draft/);
    assert.match(draft.run, /gh release delete-asset/);
    assert.match(draft.run, /gh release upload/);
    assert.match(draft.run, /--clobber/);
    assert.doesNotMatch(draft.run, /--draft=false/);

    const remote = stepNamed(publish, "Verify uploaded draft assets");
    assert.match(remote.run, /gh release view/);
    assert.match(remote.run, /size/);
    assert.match(remote.run, /unexpected asset/i);

    const publishStep = stepNamed(publish, "Publish release");
    assert.match(publishStep.run, /gh release edit[^\n]*--draft=false/);

    const names = publish.steps.map((step) => step.name);
    assert.ok(
        names.indexOf("Verify release assets") <
            names.indexOf("Create or update draft release and upload assets")
    );
    assert.ok(
        names.indexOf("Verify uploaded draft assets") <
            names.indexOf("Publish release")
    );
    assert.equal(names.at(-1), "Leave draft unpublished on failure");

    const failure = stepNamed(publish, "Leave draft unpublished on failure");
    assert.equal(failure.if, "failure()");
    assert.match(failure.run, /draft[^\n]*unpublished/i);
});

test("release checklist documents settings and the local Sandbox boundary", () => {
    const checklist = fs.readFileSync(checklistPath, "utf8");
    assert.match(checklist, /Windows Sandbox/);
    assert.match(checklist, /not a GitHub-hosted job/i);
    assert.match(checklist, /`release` environment/);
    assert.match(checklist, /v\*\.\*\.\*/);
    assert.match(checklist, /required reviewers?/i);
    assert.match(checklist, /update\.json/);
    assert.match(checklist, /RELEASE-NOTES-v<version>\.md/);
});

function write(filePath, contents) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
}

function releaseFixture(version = "9.9.9") {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "melodify-release-"));
    const sourceDir = path.join(temp, "source");
    const outputDir = path.join(temp, "release-assets");
    write(path.join(sourceDir, "Melodify.Setup.exe"), "setup-binary");
    write(
        path.join(sourceDir, `Melodify-${version}-full.nupkg`),
        "nupkg-binary"
    );
    write(
        path.join(sourceDir, "RELEASES"),
        `ABC123 ${`Melodify-${version}-full.nupkg`} 123\n`
    );
    write(
        path.join(temp, "update.json"),
        JSON.stringify({
            version,
            platforms: {
                "win32-x64": {
                    url: `https://github.com/MelodifyApp/melodify/releases/download/v${version}/Melodify.Setup.exe`,
                },
            },
        })
    );
    write(
        path.join(temp, `RELEASE-NOTES-v${version}.md`),
        `# Melodify ${version}\n`
    );
    return { temp, sourceDir, outputDir };
}

test("prepare records hashes, metadata, and only expected files", (t) => {
    const release = require(releaseScriptPath);
    const fixture = releaseFixture();
    t.after(() => fs.rmSync(fixture.temp, { recursive: true, force: true }));

    const manifest = release.prepareReleaseAssets({
        rootDir: fixture.temp,
        sourceDir: fixture.sourceDir,
        outputDir: fixture.outputDir,
        tag: "v9.9.9",
        version: "9.9.9",
    });

    assert.equal(manifest.tag, "v9.9.9");
    assert.equal(manifest.version, "9.9.9");
    assert.deepEqual(
        manifest.files.map((file) => file.name),
        [
            "Melodify-9.9.9-full.nupkg",
            "Melodify.Setup.exe",
            "RELEASES",
            "SHA256SUMS.txt",
            "update.json",
        ]
    );
    for (const file of manifest.files) {
        assert.ok(file.size > 0);
        assert.match(file.sha256, /^[a-f0-9]{64}$/);
    }
    const checksums = fs.readFileSync(
        path.join(fixture.outputDir, "SHA256SUMS.txt"),
        "utf8"
    );
    assert.match(checksums, /Melodify\.Setup\.exe/);
    assert.match(checksums, /Melodify-9\.9\.9-full\.nupkg/);
    assert.match(checksums, /update\.json/);
    assert.ok(
        fs.existsSync(path.join(fixture.outputDir, "release-notes.md"))
    );

    const verified = release.verifyReleaseAssets({
        dir: fixture.outputDir,
        tag: "v9.9.9",
    });
    assert.equal(verified.version, "9.9.9");
});

test("prepare rejects version/tag mismatches and missing metadata", (t) => {
    const release = require(releaseScriptPath);
    const fixture = releaseFixture();
    t.after(() => fs.rmSync(fixture.temp, { recursive: true, force: true }));

    assert.throws(
        () =>
            release.prepareReleaseAssets({
                rootDir: fixture.temp,
                sourceDir: fixture.sourceDir,
                outputDir: fixture.outputDir,
                tag: "v9.9.10",
                version: "9.9.9",
            }),
        /tag|version/i
    );

    fs.writeFileSync(
        path.join(fixture.temp, "update.json"),
        JSON.stringify({
            version: "9.9.8",
            platforms: {
                "win32-x64": {
                    url: "https://github.com/MelodifyApp/melodify/releases/download/v9.9.8/Melodify.Setup.exe",
                },
            },
        })
    );
    assert.throws(
        () =>
            release.prepareReleaseAssets({
                rootDir: fixture.temp,
                sourceDir: fixture.sourceDir,
                outputDir: fixture.outputDir,
                tag: "v9.9.9",
                version: "9.9.9",
            }),
        /update\.json|version/i
    );
});

test("prepare rejects missing, empty, and unpublished-notes assets", (t) => {
    const release = require(releaseScriptPath);
    const fixture = releaseFixture();
    t.after(() => fs.rmSync(fixture.temp, { recursive: true, force: true }));

    fs.rmSync(path.join(fixture.sourceDir, "Melodify.Setup.exe"));
    assert.throws(
        () =>
            release.prepareReleaseAssets({
                rootDir: fixture.temp,
                sourceDir: fixture.sourceDir,
                outputDir: fixture.outputDir,
                tag: "v9.9.9",
                version: "9.9.9",
            }),
        /Melodify\.Setup\.exe|missing/i
    );

    fs.writeFileSync(path.join(fixture.sourceDir, "Melodify.Setup.exe"), "");
    assert.throws(
        () =>
            release.prepareReleaseAssets({
                rootDir: fixture.temp,
                sourceDir: fixture.sourceDir,
                outputDir: fixture.outputDir,
                tag: "v9.9.9",
                version: "9.9.9",
            }),
        /empty|non-zero|size/i
    );

    fs.writeFileSync(
        path.join(fixture.sourceDir, "Melodify.Setup.exe"),
        "setup-binary"
    );
    fs.rmSync(path.join(fixture.temp, "RELEASE-NOTES-v9.9.9.md"));
    assert.throws(
        () =>
            release.prepareReleaseAssets({
                rootDir: fixture.temp,
                sourceDir: fixture.sourceDir,
                outputDir: fixture.outputDir,
                tag: "v9.9.9",
                version: "9.9.9",
            }),
        /release notes|RELEASE-NOTES/i
    );
});

test("verify rejects tampered files and mismatched release identity", (t) => {
    const release = require(releaseScriptPath);
    const fixture = releaseFixture();
    t.after(() => fs.rmSync(fixture.temp, { recursive: true, force: true }));

    release.prepareReleaseAssets({
        rootDir: fixture.temp,
        sourceDir: fixture.sourceDir,
        outputDir: fixture.outputDir,
        tag: "v9.9.9",
        version: "9.9.9",
    });

    fs.writeFileSync(
        path.join(fixture.outputDir, "Melodify.Setup.exe"),
        "tampered-binary"
    );
    assert.throws(
        () =>
            release.verifyReleaseAssets({
                dir: fixture.outputDir,
                tag: "v9.9.9",
            }),
        /hash|size|mismatch/i
    );

    fs.writeFileSync(
        path.join(fixture.outputDir, "Melodify.Setup.exe"),
        "setup-binary"
    );
    assert.throws(
        () =>
            release.verifyReleaseAssets({
                dir: fixture.outputDir,
                tag: "v9.9.10",
            }),
        /tag|version/i
    );
});
