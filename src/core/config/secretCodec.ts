/**
 * Encrypted-at-rest helpers for config secrets.
 *
 * Values keep their original config keys and use the stable
 * `enc:v1:<base64>` envelope. The codec is injected so tests and platform
 * adapters can round-trip without importing Electron.
 */

export const ENCRYPTED_PREFIX = "enc:v1:";

export const SECRET_KEYS = [
    "spotifyClientSecret",
    "kickClientSecret",
    "twitchClientSecret",
    "spotifyAccessToken",
    "spotifyRefreshToken",
    "kickAccessToken",
    "kickRefreshToken",
    "twitchAccessToken",
    "twitchRefreshToken",
] as const;

export type SecretKey = (typeof SECRET_KEYS)[number];

export interface SecretCodec {
    /** Returns a base64 payload without the `enc:v1:` envelope. */
    encrypt(value: string): string;
    /** Decodes a base64 payload without the `enc:v1:` envelope. */
    decrypt(value: string): string;
}

const SECRET_KEY_SET = new Set<string>(SECRET_KEYS);

export function isSecretKey(key: string): key is SecretKey {
    return SECRET_KEY_SET.has(key);
}

export function isEncrypted(value: unknown): value is string {
    return (
        typeof value === "string" && value.startsWith(ENCRYPTED_PREFIX)
    );
}

/** Encrypts plaintext once; empty and already-enveloped values pass through. */
export function encryptSecret(codec: SecretCodec, value: string): string {
    if (!value || isEncrypted(value)) return value;
    return `${ENCRYPTED_PREFIX}${codec.encrypt(value)}`;
}

/**
 * Decrypts an envelope. Legacy plaintext and empty values are returned as-is
 * so migration can distinguish and preserve 1.0.7 configs. Any malformed or
 * failed payload fails closed with `undefined`.
 */
export function decryptSecret(
    codec: SecretCodec,
    value: unknown
): string | undefined {
    if (typeof value !== "string") return undefined;
    if (value.length === 0) return "";
    if (!isEncrypted(value)) return value;
    try {
        return codec.decrypt(value.slice(ENCRYPTED_PREFIX.length));
    } catch {
        return undefined;
    }
}
