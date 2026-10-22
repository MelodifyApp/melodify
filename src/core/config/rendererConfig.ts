/**
 * Renderer-safe view of the application config.
 *
 * `config:get` must never hand credentials to the renderer: access/refresh
 * tokens, client secrets, PKCE verifiers and OAuth state stay in the main
 * process. The renderer receives harmless preferences plus `has<Key>` presence
 * flags for the credential fields it needs to show setup status.
 */

const CREDENTIAL_KEYS = [
    "kickAccessToken",
    "kickRefreshToken",
    "spotifyAccessToken",
    "spotifyRefreshToken",
    "twitchAccessToken",
    "twitchRefreshToken",
    "kickClientSecret",
    "spotifyClientSecret",
    "twitchClientSecret",
    "codeVerifier",
    "kickOAuthState",
    "twitchOAuthState",
    "spotifyOAuthState",
    "cloudDesktopKey",
    "cloudOverlayToken",
] as const;

const CREDENTIAL_PATTERNS = [
    "accesstoken",
    "refreshtoken",
    "clientsecret",
    "token",
    "secret",
    "password",
    "jwt",
    "idtoken",
    "codeverifier",
    "oauthstate",
    "authorization",
    "cookie",
    "apikey",
];

function normalizeKey(key: string): string {
    return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isCredentialKey(key: string): boolean {
    const normalized = normalizeKey(key);
    return CREDENTIAL_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function presenceFlag(key: string): string {
    return `has${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

function projectValue(value: unknown, depth = 0): unknown {
    if (
        depth > 4 ||
        !value ||
        typeof value !== "object" ||
        Array.isArray(value)
    ) {
        return value;
    }
    const projected: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (isCredentialKey(key)) continue;
        projected[key] = projectValue(item, depth + 1);
    }
    return projected;
}

/**
 * Returns a copy of the config that is safe to send to the renderer. The input
 * is never mutated; unknown preferences pass through unchanged.
 */
export function sanitizeConfigForRenderer(
    config: unknown
): Record<string, unknown> {
    const source =
        config && typeof config === "object" && !Array.isArray(config)
            ? (config as Record<string, unknown>)
            : {};

    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
        if (isCredentialKey(key)) continue;
        safe[key] = projectValue(value);
    }

    for (const key of CREDENTIAL_KEYS) {
        safe[presenceFlag(key)] =
            typeof source[key] === "string" && source[key].length > 0;
    }

    return safe;
}
