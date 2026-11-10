"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    SECRET_KEYS,
    isEncrypted,
    encryptSecret,
    decryptSecret,
} = require("../src/core/config/secretCodec");

const codec = {
    encrypt(value) {
        return Buffer.from(`roundtrip:${value}`, "utf8").toString("base64");
    },
    decrypt(value) {
        const text = Buffer.from(value, "base64").toString("utf8");
        if (!text.startsWith("roundtrip:")) {
            throw new Error("not our payload");
        }
        return text.slice("roundtrip:".length);
    },
};

test("the secret key list covers exactly the credentials that must be encrypted", () => {
    assert.deepEqual(SECRET_KEYS, [
        "spotifyClientSecret",
        "kickClientSecret",
        "twitchClientSecret",
        "spotifyAccessToken",
        "spotifyRefreshToken",
        "kickAccessToken",
        "kickRefreshToken",
        "twitchAccessToken",
        "twitchRefreshToken",
    ]);
    assert.equal(isEncrypted("plain-value"), false);
    assert.equal(isEncrypted(""), false);
    assert.equal(isEncrypted("enc:v1:YWJj"), true);
});

test("encryptSecret prefixes and round-trips without double-encrypting", () => {
    const encrypted = encryptSecret(codec, "client-secret");
    assert.match(encrypted, /^enc:v1:[A-Za-z0-9+/=]+$/);
    assert.equal(decryptSecret(codec, encrypted), "client-secret");
    assert.equal(encryptSecret(codec, encrypted), encrypted);
});

test("empty values stay empty and plaintext decrypts as legacy plaintext", () => {
    assert.equal(encryptSecret(codec, ""), "");
    assert.equal(decryptSecret(codec, ""), "");
    assert.equal(decryptSecret(codec, "legacy-plaintext"), "legacy-plaintext");
});

test("malformed encrypted payloads fail closed", () => {
    assert.equal(decryptSecret(codec, "enc:v1:not-base64"), undefined);
    assert.equal(decryptSecret(codec, "enc:v1:"), undefined);
    assert.equal(
        decryptSecret(
            { encrypt: (value) => value, decrypt: () => { throw new Error("bad"); } },
            "enc:v1:anything"
        ),
        undefined
    );
});
