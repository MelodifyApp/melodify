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

function projectValue(value: unknown, ancestors: Set<object>): unknown {
    if (!value || typeof value !== "object") {
        return value;
    }

    const container = value as object;
    // Defensive cycle guard: config is JSON-like, but a malformed store must
    // not hang the projection. Repeated (non-circular) references still work
    // because entries are removed on the way out.
    if (ancestors.has(container)) {
        return undefined;
    }
    ancestors.add(container);

    try {
        if (Array.isArray(value)) {
            return value.map((item) => projectValue(item, ancestors));
        }

        const projected: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(
            value as Record<string, unknown>
        )) {
            if (isCredentialKey(key)) continue;
            projected[key] = projectValue(item, ancestors);
        }
        return projected;
    } finally {
        ancestors.delete(container);
    }
}

/**
 * Returns a copy of the config that is safe to send to the renderer. The input
 * is never mutated; unknown preferences pass through unchanged, while
 * credential keys are dropped at any depth (objects and arrays alike).
 */
export function sanitizeConfigForRenderer(
    config: unknown
): Record<string, unknown> {
    const source =
        config && typeof config === "object" && !Array.isArray(config)
            ? (config as Record<string, unknown>)
            : {};

    const ancestors = new Set<object>();
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
        if (isCredentialKey(key)) continue;
        safe[key] = projectValue(value, ancestors);
    }

    for (const key of CREDENTIAL_KEYS) {
        safe[presenceFlag(key)] =
            typeof source[key] === "string" && source[key].length > 0;
    }

    return safe;
}

/**
 * Fields the renderer may persist through `config:set`. Credentials (tokens,
 * client secrets, PKCE verifier), identity fields and internal timestamps are
 * intentionally absent: they are written only by their dedicated IPC/OAuth
 * paths. Anything else in a renderer payload — including `has<Key>` presence
 * flags, unknown keys and prototype-sensitive keys — is discarded.
 */
const RENDERER_SETTABLE_KEYS = new Set([
    "language",
    "defaultsLanguage",
    "autoFollowLanguageDefaults",
    "prefix",
    "commands",
    "allowedBadges",
    "customModerators",
    "canAnyonePlaySong",
    "rewardTitle",
    "twitchRewardTitle",
    "replyOnSongRequest",
    "songRequestReplyTemplate",
    "replyOnSongRequestError",
    "songRequestErrorTemplate",
    "replyOnVolumeChange",
    "volumeChangeReplyTemplate",
    "replyOnVolumeError",
    "volumeErrorTemplate",
    "replyOnVolumeGet",
    "volumeGetReplyTemplate",
    "globalCooldownEnabled",
    "globalCooldownSeconds",
    "perUserCooldownEnabled",
    "perUserCooldownSeconds",
    "replyOnCooldown",
    "cooldownMessageTemplate",
    "currentSongFormat",
    "saveCurrentSongToFile",
    "autoUpdateEnabled",
    "startOnStartup",
    "minimizeToTray",
    "kickRedirectUri",
    "spotifyRedirectUri",
    "kickClientId",
    "spotifyClientId",
    "twitchClientId",
]);

/**
 * Projects a renderer `config:set` payload onto the settable allowlist.
 * Non-object payloads and unknown/credential/flag keys are dropped, so a
 * malicious renderer cannot persist credentials or prototype-sensitive keys.
 */
export function sanitizeConfigUpdate(
    payload: unknown
): Record<string, unknown> {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return {};
    }

    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
        payload as Record<string, unknown>
    )) {
        if (!RENDERER_SETTABLE_KEYS.has(key)) continue;
        if (value === undefined) continue;
        patch[key] = value;
    }
    return patch;
}
