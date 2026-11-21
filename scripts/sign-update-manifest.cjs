"use strict";

/**
 * Builds the signed update manifest from the prepared installer and signs the
 * exact manifest bytes with the release Ed25519 private key.
 *
 * The private key is read from UPDATE_SIGNING_KEY (PEM or base64 PKCS8 DER)
 * and is never written to disk or printed.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const brand = require("../src/shared/brand.json");

const DEFAULT_KEY_ID = brand.updateKeyId;
const DEFAULT_APP_ID = brand.appId;
const DEFAULT_ASSET = brand.installerName;
const DEFAULT_EXPIRY_DAYS = 90;

function fail(message) {
    console.error(`UPDATE_MANIFEST_FAILED: ${message}`);
    process.exitCode = 1;
    process.exit(1);
}

function parseArgs(argv) {
    const options = {};
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--dir") options.dir = argv[++index];
        else if (arg === "--tag") options.tag = argv[++index];
        else if (arg === "--asset") options.asset = argv[++index];
        else if (arg === "--version") options.version = argv[++index];
        else fail(`Unknown argument: ${arg}`);
    }
    return options;
}

function readVersion(options) {
    if (options.version) return options.version.replace(/^v/, "");
    const packageJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    );
    return String(packageJson.version);
}

function loadPrivateKey() {
    const value = process.env.UPDATE_SIGNING_KEY;
    if (!value || !value.trim()) {
        fail("UPDATE_SIGNING_KEY is required");
    }
    try {
        if (value.includes("BEGIN PRIVATE KEY")) {
            return crypto.createPrivateKey(value);
        }
        return crypto.createPrivateKey({
            key: Buffer.from(value.trim(), "base64"),
            format: "der",
            type: "pkcs8",
        });
    } catch {
        fail("UPDATE_SIGNING_KEY could not be parsed");
    }
}

function sha256File(filePath) {
    const hash = crypto.createHash("sha256");
    hash.update(fs.readFileSync(filePath));
    return hash.digest("hex");
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const outputDir = path.resolve(options.dir || "release-assets");
    const version = readVersion(options);
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
        fail(`version must be X.Y.Z, got ${version}`);
    }
    if (options.tag && options.tag.replace(/^v/, "") !== version) {
        fail(`tag ${options.tag} does not match version ${version}`);
    }

    const assetName = options.asset || DEFAULT_ASSET;
    if (
        !assetName ||
        assetName.includes("/") ||
        assetName.includes("\\") ||
        assetName === "." ||
        assetName === ".."
    ) {
        fail("asset name must be a safe basename");
    }
    const assetPath = path.join(outputDir, assetName);
    if (!fs.existsSync(assetPath)) {
        fail(`missing installer asset ${assetName}`);
    }
    const stat = fs.statSync(assetPath);
    if (!stat.isFile() || stat.size <= 0) {
        fail(`installer asset ${assetName} is not a non-empty file`);
    }

    const now = new Date();
    const expiresAt = new Date(
        now.getTime() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );
    const keyId = process.env.UPDATE_SIGNING_KEY_ID || DEFAULT_KEY_ID;
    const appId = process.env.UPDATE_APP_ID || DEFAULT_APP_ID;

    const manifest = {
        schemaVersion: 1,
        keyId,
        appId,
        version,
        platform: "win32",
        architecture: "x64",
        channel: "latest",
        publishedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        assets: [
            {
                name: assetName,
                size: stat.size,
                sha256: sha256File(assetPath),
            },
        ],
    };
    const manifestBytes = Buffer.from(
        `${JSON.stringify(manifest, null, 2)}\n`,
        "utf8"
    );
    const privateKey = loadPrivateKey();
    if (privateKey.asymmetricKeyType !== "ed25519") {
        fail("signing key must be Ed25519");
    }
    const signature = crypto.sign(null, manifestBytes, privateKey);

    const manifestPath = path.join(outputDir, "update-manifest.json");
    const signaturePath = path.join(outputDir, "update-manifest.json.sig");
    fs.writeFileSync(manifestPath, manifestBytes);
    fs.writeFileSync(signaturePath, signature.toString("base64"), "utf8");

    console.log(
        `UPDATE_MANIFEST_SIGNED version=${version} keyId=${keyId} asset=${assetName} size=${stat.size}`
    );
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
    }
}
