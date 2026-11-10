"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { redactSecrets } = require("../src/core/logging/utils");

const root = path.resolve(__dirname, "..");
const originalLoad = Module._load;
const originalResolve = Module._resolveFilename;

const SECRET_VALUES = {
    spotifyClientSecret: "spotify-secret-value",
    kickClientSecret: "kick-secret-value",
    twitchClientSecret: "twitch-secret-value",
    spotifyAccessToken: "spotify-access-value",
    spotifyRefreshToken: "spotify-refresh-value",
    kickAccessToken: "kick-access-value",
    kickRefreshToken: "kick-refresh-value",
    twitchAccessToken: "twitch-access-value",
    twitchRefreshToken: "twitch-refresh-value",
};
const SECRET_KEYS = Object.keys(SECRET_VALUES);

function createSafeStorage(options = {}) {
    const available = options.available !== false;
    return {
        isEncryptionAvailable: () => available,
        encryptString(value) {
            if (options.failEncrypt) throw new Error("DPAPI encrypt failed");
            return Buffer.from(`sealed:${value}`, "utf8");
        },
        decryptString(buffer) {
            if (options.failDecrypt) throw new Error("DPAPI decrypt failed");
            const text = Buffer.from(buffer).toString("utf8");
            if (!text.startsWith("sealed:")) throw new Error("not sealed");
            return text.slice("sealed:".length);
        },
    };
}

function loadConfig(userData, safeStorage, logs = []) {
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
        if (request === "electron") {
            return {
                app: {
                    getPath: () => userData,
                    getSystemLocale: () => "en-US",
                },
                safeStorage,
            };
        }
        if (request === "@/core/logging") {
            return {
                logInfo: (...args) => logs.push(["info", ...args]),
                logDebug: (...args) => logs.push(["debug", ...args]),
                logWarn: (...args) => logs.push(["warn", ...args]),
                logError: (...args) => logs.push(["error", ...args]),
            };
        }
        if (request === "@/core/logging/utils") {
            return { redactSecrets };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        const resolved = require.resolve(
            path.join(root, "src/core/config/index.ts")
        );
        delete require.cache[resolved];
        return require(resolved).default;
    } finally {
        Module._resolveFilename = originalResolve;
        Module._load = originalLoad;
    }
}

function makeProfile(t) {
    const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), `melodify-secrets-${process.pid}-`)
    );
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    return directory;
}

function writeConfig(directory, values) {
    fs.writeFileSync(
        path.join(directory, "config.json"),
        JSON.stringify(values, null, 2),
        "utf8"
    );
}

function readConfig(directory) {
    return JSON.parse(
        fs.readFileSync(path.join(directory, "config.json"), "utf8")
    );
}

function assertNoSecretValues(logs, extra = []) {
    const text = JSON.stringify(logs);
    for (const value of [...Object.values(SECRET_VALUES), ...extra]) {
        assert.equal(
            text.includes(value),
            false,
            `logs must not contain ${value}`
        );
    }
    assert.equal(text.includes("enc:v1:"), false, "logs must not contain ciphertext");
}

test("a 1.0.7 plaintext config migrates the nine secret fields on unlock", (t) => {
    const profile = makeProfile(t);
    writeConfig(profile, {
        language: "en",
        defaultsLanguage: "en",
        autoFollowLanguageDefaults: true,
        prefix: "!",
        ...SECRET_VALUES,
    });
    const logs = [];
    const Config = loadConfig(profile, createSafeStorage(), logs);

    assert.equal(Config.get("prefix"), "!");
    for (const key of SECRET_KEYS) {
        assert.equal(Config.get(key), undefined, `${key} before unlock`);
    }
    const beforeUnlock = Config.get();
    for (const key of SECRET_KEYS) {
        assert.equal(beforeUnlock[key], undefined, `${key} in full get`);
    }

    Config.unlockSecrets();

    for (const [key, value] of Object.entries(SECRET_VALUES)) {
        assert.equal(Config.get(key), value, `${key} after unlock`);
    }

    const stored = readConfig(profile);
    const raw = JSON.stringify(stored);
    for (const [key, value] of Object.entries(SECRET_VALUES)) {
        assert.match(stored[key], /^enc:v1:[A-Za-z0-9+/=]+$/, key);
        assert.equal(raw.includes(value), false, `${value} must not remain plaintext`);
    }
    assert.equal(stored.prefix, "!");
    assertNoSecretValues(logs);
});

test("restart decrypts the same encrypted config without rewriting secrets", (t) => {
    const profile = makeProfile(t);
    writeConfig(profile, {
        language: "en",
        defaultsLanguage: "en",
        prefix: "!",
        ...SECRET_VALUES,
    });
    const first = loadConfig(profile, createSafeStorage(), []);
    first.unlockSecrets();
    const afterMigration = readConfig(profile);
    const encryptedValues = Object.fromEntries(
        SECRET_KEYS.map((key) => [key, afterMigration[key]])
    );

    const logs = [];
    const restarted = loadConfig(profile, createSafeStorage(), logs);
    for (const key of SECRET_KEYS) {
        assert.equal(restarted.get(key), undefined, `${key} before restart unlock`);
    }
    restarted.unlockSecrets();
    for (const [key, value] of Object.entries(SECRET_VALUES)) {
        assert.equal(restarted.get(key), value, `${key} after restart unlock`);
    }
    const stored = readConfig(profile);
    for (const key of SECRET_KEYS) {
        assert.equal(stored[key], encryptedValues[key], `${key} ciphertext stable`);
        assert.match(stored[key], /^enc:v1:/);
    }
    assert.equal(
        logs.some((entry) => entry[0] === "warn" && /decrypt/i.test(String(entry[1]))),
        false
    );
    assertNoSecretValues(logs);
});

test("a decrypt failure hides the field, preserves ciphertext, and survives unrelated saves", (t) => {
    const profile = makeProfile(t);
    writeConfig(profile, {
        language: "en",
        defaultsLanguage: "en",
        prefix: "!",
        ...SECRET_VALUES,
    });
    const first = loadConfig(profile, createSafeStorage(), []);
    first.unlockSecrets();
    const encryptedBefore = readConfig(profile);

    const logs = [];
    const broken = loadConfig(
        profile,
        createSafeStorage({ failDecrypt: true }),
        logs
    );
    broken.unlockSecrets();
    for (const key of SECRET_KEYS) {
        assert.equal(broken.get(key), undefined, `${key} must be unavailable`);
        assert.equal(broken.get()[key], undefined, `${key} full get`);
    }
    assert.equal(
        logs.some(
            (entry) =>
                entry[0] === "warn" &&
                SECRET_KEYS.some((key) => String(entry[1]).includes(key))
        ),
        true,
        "a warning must name the failed field"
    );
    assertNoSecretValues(logs);

    broken.set({ prefix: "?" });
    const encryptedAfter = readConfig(profile);
    assert.equal(encryptedAfter.prefix, "?");
    for (const key of SECRET_KEYS) {
        assert.equal(encryptedAfter[key], encryptedBefore[key], `${key} preserved`);
    }
    assertNoSecretValues(logs);
});

test("unavailable encryption leaves legacy plaintext untouched and encrypted fields locked", (t) => {
    const profile = makeProfile(t);
    writeConfig(profile, {
        language: "en",
        defaultsLanguage: "en",
        prefix: "!",
        ...SECRET_VALUES,
    });
    const logs = [];
    const legacy = loadConfig(
        profile,
        createSafeStorage({ available: false }),
        logs
    );
    legacy.unlockSecrets();
    for (const [key, value] of Object.entries(SECRET_VALUES)) {
        assert.equal(legacy.get(key), value, `${key} legacy fallback`);
    }
    const legacyStored = readConfig(profile);
    for (const key of SECRET_KEYS) {
        assert.equal(legacyStored[key], SECRET_VALUES[key], `${key} stays plaintext`);
    }
    assert.equal(
        logs.some((entry) => entry[0] === "warn" && /unavailable/i.test(String(entry[1]))),
        true
    );
    assertNoSecretValues(logs);

    const encryptedProfile = makeProfile(t);
    writeConfig(encryptedProfile, {
        language: "en",
        defaultsLanguage: "en",
        prefix: "!",
        ...SECRET_VALUES,
    });
    const migrated = loadConfig(encryptedProfile, createSafeStorage(), []);
    migrated.unlockSecrets();
    const encryptedBefore = readConfig(encryptedProfile);

    const lockedLogs = [];
    const locked = loadConfig(
        encryptedProfile,
        createSafeStorage({ available: false }),
        lockedLogs
    );
    locked.unlockSecrets();
    for (const key of SECRET_KEYS) {
        assert.equal(locked.get(key), undefined, `${key} locked`);
    }
    locked.set({ prefix: "?" });
    const encryptedAfter = readConfig(encryptedProfile);
    for (const key of SECRET_KEYS) {
        assert.equal(encryptedAfter[key], encryptedBefore[key], `${key} preserved`);
    }
    assertNoSecretValues(lockedLogs);
});

test("a failed migration keeps the plaintext file intact and logs a warning", (t) => {
    const profile = makeProfile(t);
    writeConfig(profile, {
        language: "en",
        defaultsLanguage: "en",
        prefix: "!",
        ...SECRET_VALUES,
    });
    const logs = [];
    const Config = loadConfig(
        profile,
        createSafeStorage({ failEncrypt: true }),
        logs
    );
    Config.unlockSecrets();
    const stored = readConfig(profile);
    for (const [key, value] of Object.entries(SECRET_VALUES)) {
        assert.equal(stored[key], value, `${key} plaintext preserved`);
    }
    assert.equal(
        logs.some(
            (entry) =>
                entry[0] === "warn" &&
                /migration|plaintext/i.test(String(entry[1]))
        ),
        true
    );
    assertNoSecretValues(logs);
});

test("writes encrypt new secrets, preserve empty strings, and reset clears them", (t) => {
    const profile = makeProfile(t);
    writeConfig(profile, {
        language: "en",
        defaultsLanguage: "en",
        prefix: "!",
        ...SECRET_VALUES,
    });
    const Config = loadConfig(profile, createSafeStorage(), []);
    Config.unlockSecrets();

    Config.set({ spotifyAccessToken: "new-access-token" });
    assert.equal(Config.get("spotifyAccessToken"), "new-access-token");
    let stored = readConfig(profile);
    assert.match(stored.spotifyAccessToken, /^enc:v1:/);
    assert.equal(JSON.stringify(stored).includes("new-access-token"), false);

    Config.setPersisted({ kickRefreshToken: "persisted-refresh-token" });
    assert.equal(Config.get("kickRefreshToken"), "persisted-refresh-token");
    stored = readConfig(profile);
    assert.match(stored.kickRefreshToken, /^enc:v1:/);
    assert.equal(JSON.stringify(stored).includes("persisted-refresh-token"), false);

    Config.set({ spotifyClientSecret: "" });
    assert.equal(Config.get("spotifyClientSecret"), "");
    stored = readConfig(profile);
    assert.equal(stored.spotifyClientSecret, "");

    Config.reset();
    stored = readConfig(profile);
    for (const key of SECRET_KEYS) {
        assert.equal(
            Object.prototype.hasOwnProperty.call(stored, key),
            false,
            `${key} after reset`
        );
    }
});

test("reload after unlock re-decrypts secrets for the main process", (t) => {
    const profile = makeProfile(t);
    writeConfig(profile, {
        language: "en",
        defaultsLanguage: "en",
        prefix: "!",
        ...SECRET_VALUES,
    });
    const Config = loadConfig(profile, createSafeStorage(), []);
    Config.unlockSecrets();
    Config.set({ prefix: "?" });
    const result = Config.reload();
    assert.equal(result.ok, true);
    for (const [key, value] of Object.entries(SECRET_VALUES)) {
        assert.equal(Config.get(key), value, `${key} after reload`);
    }
    const stored = readConfig(profile);
    for (const key of SECRET_KEYS) {
        assert.match(stored[key], /^enc:v1:/, `${key} remains encrypted`);
    }
});

test("the renderer projection never receives a secret after unlock", (t) => {
    const profile = makeProfile(t);
    writeConfig(profile, {
        language: "en",
        defaultsLanguage: "en",
        prefix: "!",
        ...SECRET_VALUES,
    });
    const Config = loadConfig(profile, createSafeStorage(), []);
    Config.unlockSecrets();
    const { sanitizeConfigForRenderer } = require("../src/core/config/rendererConfig");
    const projected = sanitizeConfigForRenderer(Config.get());
    for (const key of SECRET_KEYS) {
        assert.equal(Object.prototype.hasOwnProperty.call(projected, key), false, key);
    }
    assert.equal(projected.hasSpotifyAccessToken, true);
    assert.equal(projected.hasTwitchClientSecret, true);
    assert.equal(JSON.stringify(projected).includes("secret-value"), false);
});

test("main unlocks secrets before creating the window or initializing features", () => {
    const source = fs.readFileSync(
        path.join(root, "src/main/index.ts"),
        "utf8"
    );
    const ready = source.match(
        /app\.on\("ready",\s*\(\)\s*=>\s*\{([\s\S]*?)\n\}\);/
    );
    assert.ok(ready, "app ready handler must exist");
    const body = ready[1];
    const unlock = body.indexOf("Config.unlockSecrets()");
    const window = body.indexOf("createMainWindow()");
    const home = body.indexOf("initializeHomeSession()");
    const kick = body.indexOf("startKickTokenAutoRefresh(");
    assert.notEqual(unlock, -1, "unlockSecrets must be called");
    assert.ok(unlock < window, "unlock must precede createMainWindow");
    assert.ok(unlock < home, "unlock must precede home initialization");
    assert.ok(unlock < kick, "unlock must precede Kick refresh initialization");
});
