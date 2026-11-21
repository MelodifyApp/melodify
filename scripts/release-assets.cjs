"use strict";

/**
 * Release-artifact gate. The workflow runs this after the Windows build and
 * again in the write-scoped publish job. It intentionally has no dependencies
 * so the publish job never needs npm install.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const brand = require("../src/shared/brand.json");

const REPOSITORY = brand.githubRepo;
const UPDATE_METADATA_FILE = "update.json";
const CHECKSUM_FILE = "SHA256SUMS.txt";
const MANIFEST_FILE = "release-manifest.json";
const NOTES_FILE = "release-notes.md";
const STABLE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function fail(message) {
    throw new Error(message);
}

function normalizeVersion(value, label = "version") {
    const version = typeof value === "string" ? value.trim() : "";
    if (!STABLE_VERSION.test(version)) {
        fail(`${label} must be stable X.Y.Z, got ${JSON.stringify(value)}`);
    }
    return version;
}

function normalizeTag(value) {
    const tag = typeof value === "string" ? value.trim() : "";
    if (!STABLE_TAG.test(tag)) {
        fail(`tag must be vX.Y.Z, got ${JSON.stringify(value)}`);
    }
    return tag;
}

function validateReleaseIdentity({ tag, version }) {
    const normalizedTag = normalizeTag(tag);
    const normalizedVersion = normalizeVersion(version, "package version");
    if (normalizedTag !== `v${normalizedVersion}`) {
        fail(
            `tag ${normalizedTag} does not match package version ${normalizedVersion}`
        );
    }
    return { tag: normalizedTag, version: normalizedVersion };
}

function expectedAssetNames(version) {
    const normalized = normalizeVersion(version);
    return [
        brand.installerName,
        `${brand.productName}-${normalized}-full.nupkg`,
        "RELEASES",
    ];
}

function expectedUpdateUrl(tag) {
    return `https://github.com/${REPOSITORY}/releases/download/${tag}/${brand.installerName}`;
}

function validateUpdateMetadata(metadata, { tag, version }) {
    const identity = validateReleaseIdentity({ tag, version });
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        fail("update.json must contain a JSON object");
    }
    if (metadata.version !== identity.version) {
        fail(
            `update.json version ${JSON.stringify(
                metadata.version
            )} does not match ${identity.version}`
        );
    }
    const url = metadata.platforms?.["win32-x64"]?.url;
    const expected = expectedUpdateUrl(identity.tag);
    if (url !== expected) {
        fail(`update.json win32-x64 url must be ${expected}`);
    }
    return metadata;
}

function readJson(filePath, label) {
    let raw;
    try {
        raw = fs.readFileSync(filePath, "utf8");
    } catch (error) {
        if (error.code === "ENOENT") fail(`${label} is missing: ${filePath}`);
        fail(`cannot read ${label}: ${error.message}`);
    }
    try {
        return JSON.parse(raw);
    } catch (error) {
        fail(`cannot parse ${label}: ${error.message}`);
    }
}

function statReleaseFile(filePath, label) {
    let stat;
    try {
        stat = fs.statSync(filePath);
    } catch (error) {
        if (error.code === "ENOENT") fail(`${label} is missing: ${filePath}`);
        fail(`cannot inspect ${label}: ${error.message}`);
    }
    if (!stat.isFile()) fail(`${label} is not a regular file: ${filePath}`);
    if (!Number.isFinite(stat.size) || stat.size <= 0) {
        fail(`${label} is empty (non-zero size required): ${filePath}`);
    }
    return stat;
}

function sha256File(filePath) {
    const hash = crypto.createHash("sha256");
    hash.update(fs.readFileSync(filePath));
    return hash.digest("hex");
}

function hashRecord(outputDir, name) {
    const filePath = path.join(outputDir, name);
    const stat = statReleaseFile(filePath, `release asset ${name}`);
    return {
        name,
        size: stat.size,
        sha256: sha256File(filePath),
    };
}

function assertSafeFileName(value) {
    const name = typeof value === "string" ? value.trim() : "";
    if (
        !name ||
        name === "." ||
        name === ".." ||
        path.basename(name) !== name ||
        /[\\/]/.test(name)
    ) {
        fail(`unsafe release file name: ${JSON.stringify(value)}`);
    }
    return name;
}

function sortByName(left, right) {
    return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
}

function formatChecksums(records) {
    return (
        records
            .slice()
            .sort(sortByName)
            .map((record) => `${record.sha256}  ${record.name}`)
            .join("\n") + "\n"
    );
}

function readChecksums(text) {
    const entries = new Map();
    for (const line of String(text).split(/\r?\n/)) {
        if (!line.trim()) continue;
        const match = /^([a-f0-9]{64})  (.+)$/.exec(line.trim());
        if (!match) fail(`invalid ${CHECKSUM_FILE} line: ${line}`);
        const name = assertSafeFileName(match[2]);
        if (entries.has(name)) {
            fail(`${CHECKSUM_FILE} contains duplicate entry: ${name}`);
        }
        entries.set(name, match[1]);
    }
    if (entries.size === 0) fail(`${CHECKSUM_FILE} is empty`);
    return entries;
}

function uploadFileNames(version) {
    return [
        ...expectedAssetNames(version),
        UPDATE_METADATA_FILE,
        CHECKSUM_FILE,
    ].sort();
}

function prepareReleaseAssets({
    rootDir,
    sourceDir,
    outputDir,
    tag,
    version,
}) {
    const identity = validateReleaseIdentity({ tag, version });
    const expected = expectedAssetNames(identity.version);

    for (const name of expected) {
        statReleaseFile(
            path.join(sourceDir, name),
            `expected build artifact ${name}`
        );
    }

    const updatePath = path.join(rootDir, UPDATE_METADATA_FILE);
    validateUpdateMetadata(
        readJson(updatePath, UPDATE_METADATA_FILE),
        identity
    );

    const notesPath = path.join(
        rootDir,
        `RELEASE-NOTES-${identity.tag}.md`
    );
    statReleaseFile(notesPath, `release notes RELEASE-NOTES-${identity.tag}.md`);

    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.mkdirSync(outputDir, { recursive: true });

    for (const name of expected) {
        fs.copyFileSync(
            path.join(sourceDir, name),
            path.join(outputDir, name)
        );
    }
    fs.copyFileSync(updatePath, path.join(outputDir, UPDATE_METADATA_FILE));
    fs.copyFileSync(notesPath, path.join(outputDir, NOTES_FILE));

    const checksummed = [...expected, UPDATE_METADATA_FILE]
        .sort()
        .map((name) => hashRecord(outputDir, name));
    fs.writeFileSync(
        path.join(outputDir, CHECKSUM_FILE),
        formatChecksums(checksummed),
        "utf8"
    );

    const manifest = {
        tag: identity.tag,
        version: identity.version,
        files: [
            ...checksummed,
            hashRecord(outputDir, CHECKSUM_FILE),
        ].sort(sortByName),
    };
    fs.writeFileSync(
        path.join(outputDir, MANIFEST_FILE),
        `${JSON.stringify(manifest, null, 2)}\n`,
        "utf8"
    );
    return manifest;
}

function verifyReleaseAssets({ dir, tag }) {
    const normalizedTag = normalizeTag(tag);
    const manifest = readJson(
        path.join(dir, MANIFEST_FILE),
        "release manifest"
    );
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
        fail("release manifest must contain a JSON object");
    }
    if (manifest.tag !== normalizedTag) {
        fail(
            `release manifest tag ${JSON.stringify(
                manifest.tag
            )} does not match ${normalizedTag}`
        );
    }
    const version = normalizeVersion(manifest.version, "manifest version");
    if (normalizedTag !== `v${version}`) {
        fail(`release manifest tag ${normalizedTag} does not match version ${version}`);
    }

    const expected = uploadFileNames(version);
    if (!Array.isArray(manifest.files)) {
        fail("release manifest files must be an array");
    }
    const seen = new Set();
    for (const record of manifest.files) {
        if (!record || typeof record !== "object" || Array.isArray(record)) {
            fail("release manifest contains an invalid file entry");
        }
        const name = assertSafeFileName(record.name);
        if (!expected.includes(name)) {
            fail(`release manifest contains unexpected file: ${name}`);
        }
        if (seen.has(name)) {
            fail(`release manifest contains duplicate file: ${name}`);
        }
        seen.add(name);
        if (!Number.isFinite(record.size) || record.size <= 0) {
            fail(`release manifest has an invalid size for ${name}`);
        }
        if (!/^[a-f0-9]{64}$/.test(record.sha256)) {
            fail(`release manifest has an invalid sha256 for ${name}`);
        }
        const stat = statReleaseFile(
            path.join(dir, name),
            `release asset ${name}`
        );
        if (stat.size !== record.size) {
            fail(
                `release asset ${name} size mismatch: manifest ${record.size}, actual ${stat.size}`
            );
        }
        const actual = sha256File(path.join(dir, name));
        if (actual !== record.sha256) {
            fail(`release asset ${name} hash mismatch`);
        }
    }
    for (const name of expected) {
        if (!seen.has(name)) {
            fail(`release manifest is missing ${name}`);
        }
    }

    validateUpdateMetadata(
        readJson(path.join(dir, UPDATE_METADATA_FILE), UPDATE_METADATA_FILE),
        { tag: normalizedTag, version }
    );
    statReleaseFile(path.join(dir, NOTES_FILE), NOTES_FILE);

    const checksums = readChecksums(
        fs.readFileSync(path.join(dir, CHECKSUM_FILE), "utf8")
    );
    if (checksums.has(CHECKSUM_FILE)) {
        fail(`${CHECKSUM_FILE} must not include itself`);
    }
    for (const name of expected) {
        if (name === CHECKSUM_FILE) continue;
        if (!checksums.has(name)) {
            fail(`${CHECKSUM_FILE} is missing ${name}`);
        }
        const actual = sha256File(path.join(dir, name));
        if (checksums.get(name) !== actual) {
            fail(`${CHECKSUM_FILE} hash mismatch for ${name}`);
        }
    }
    return manifest;
}

function parseArgs(argv) {
    const options = {};
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (!arg.startsWith("--")) fail(`unexpected argument: ${arg}`);
        const key = arg.slice(2);
        if (!key) fail("empty option");
        const value = argv[index + 1];
        if (!value || value.startsWith("--")) {
            fail(`missing value for --${key}`);
        }
        options[key] = value;
        index += 1;
    }
    return options;
}

function main() {
    const [mode, ...rest] = process.argv.slice(2);
    const options = parseArgs(rest);
    const tag = options.tag || process.env.GITHUB_REF_NAME;
    if (!tag) fail("tag is required (--tag or GITHUB_REF_NAME)");

    if (mode === "prepare") {
        const rootDir = path.resolve(options.root || process.cwd());
        const version = normalizeVersion(
            readJson(path.join(rootDir, "package.json"), "package.json")
                .version,
            "package version"
        );
        const manifest = prepareReleaseAssets({
            rootDir,
            sourceDir: path.resolve(
                options.source ||
                    path.join(
                        rootDir,
                        "out",
                        "make",
                        "squirrel.windows",
                        "x64"
                    )
            ),
            outputDir: path.resolve(
                options.dir || path.join(rootDir, "release-assets")
            ),
            tag,
            version,
        });
        console.log(
            `RELEASE_ASSETS_PREPARED tag=${manifest.tag} version=${manifest.version} files=${manifest.files.length}`
        );
        return;
    }

    if (mode === "verify") {
        const manifest = verifyReleaseAssets({
            dir: path.resolve(
                options.dir || path.join(process.cwd(), "release-assets")
            ),
            tag,
        });
        console.log(
            `RELEASE_ASSETS_VERIFIED tag=${manifest.tag} version=${manifest.version} files=${manifest.files.length}`
        );
        return;
    }

    fail("usage: release-assets.cjs <prepare|verify> [--tag vX.Y.Z] [--dir <path>]");
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(
            `RELEASE_CHECK_FAILED: ${
                error instanceof Error ? error.message : String(error)
            }`
        );
        process.exitCode = 1;
    }
}

module.exports = {
    CHECKSUM_FILE,
    MANIFEST_FILE,
    NOTES_FILE,
    UPDATE_METADATA_FILE,
    expectedAssetNames,
    expectedUpdateUrl,
    normalizeTag,
    prepareReleaseAssets,
    readChecksums,
    validateReleaseIdentity,
    validateUpdateMetadata,
    verifyReleaseAssets,
};
