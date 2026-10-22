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
export const RENDERER_SETTABLE_KEYS = new Set([
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

const SUPPORTED_LANGUAGES = new Set(["en", "tr"]);

const BOOLEAN_SETTING_KEYS = new Set([
    "autoFollowLanguageDefaults",
    "canAnyonePlaySong",
    "replyOnSongRequest",
    "replyOnSongRequestError",
    "replyOnVolumeChange",
    "replyOnVolumeError",
    "replyOnVolumeGet",
    "globalCooldownEnabled",
    "perUserCooldownEnabled",
    "replyOnCooldown",
    "saveCurrentSongToFile",
    "autoUpdateEnabled",
    "startOnStartup",
    "minimizeToTray",
]);

const TEMPLATE_SETTING_KEYS = new Set([
    "songRequestReplyTemplate",
    "songRequestErrorTemplate",
    "volumeChangeReplyTemplate",
    "volumeErrorTemplate",
    "volumeGetReplyTemplate",
    "cooldownMessageTemplate",
    "currentSongFormat",
]);

/** Upper length bound for free-text settings that the renderer may edit. */
const TEMPLATE_MAX_LENGTH = 500;

const BOUNDED_STRING_LIMITS: Record<string, number> = {
    prefix: 10,
    rewardTitle: 100,
    twitchRewardTitle: 100,
    kickClientId: 200,
    spotifyClientId: 200,
    twitchClientId: 200,
};

const COOLDOWN_KEYS = new Set([
    "globalCooldownSeconds",
    "perUserCooldownSeconds",
]);

const COOLDOWN_MAX_SECONDS = 86400;

const LIST_LIMITS: Record<string, { maxItems: number; maxLength: number }> = {
    allowedBadges: { maxItems: 50, maxLength: 50 },
    customModerators: { maxItems: 200, maxLength: 50 },
};

const REDIRECT_URI_KEYS = new Set(["kickRedirectUri", "spotifyRedirectUri"]);
const REDIRECT_URI_MAX_LENGTH = 2048;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const COMMAND_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,50}$/;
const MAX_COMMANDS = 100;
const MAX_ALIASES_PER_COMMAND = 10;
const MAX_ALIAS_LENGTH = 20;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Returns a trimmed copy of a bounded string list, or undefined when invalid. */
function validateStringList(
    value: unknown,
    maxItems: number,
    maxLength: number
): string[] | undefined {
    if (!Array.isArray(value) || value.length > maxItems) return undefined;
    const list: string[] = [];
    for (const item of value) {
        if (typeof item !== "string") return undefined;
        const trimmed = item.trim();
        if (trimmed.length === 0 || trimmed.length > maxLength) return undefined;
        list.push(trimmed);
    }
    return list;
}

/** Cooldown durations are stored as digit strings; keep them in a sane range. */
function validateCooldownSeconds(value: unknown): string | undefined {
    let seconds: number;
    if (typeof value === "string" && /^\d+$/.test(value)) {
        seconds = Number(value);
    } else if (typeof value === "number" && Number.isInteger(value)) {
        seconds = value;
    } else {
        return undefined;
    }
    if (seconds < 1 || seconds > COOLDOWN_MAX_SECONDS) return undefined;
    return String(seconds);
}

/**
 * OAuth callback servers only ever bind to a loopback host derived from the
 * redirect URI, so only loopback http(s) URIs are accepted.
 */
function validateRedirectUri(value: unknown): string | undefined {
    if (
        typeof value !== "string" ||
        value.length === 0 ||
        value.length > REDIRECT_URI_MAX_LENGTH
    ) {
        return undefined;
    }
    try {
        const url = new URL(value);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return undefined;
        }
        const raw = url.hostname;
        const host =
            raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;
        if (!LOOPBACK_HOSTS.has(host)) return undefined;
        return value;
    } catch {
        return undefined;
    }
}

/**
 * Keeps only well-formed command entries: a safe command name mapping to an
 * object with an optional boolean `enabled` and a bounded alias list.
 */
function validateCommands(value: unknown): Record<string, unknown> | undefined {
    if (!isPlainObject(value)) return undefined;

    const commands: Record<string, unknown> = {};
    let accepted = 0;
    for (const [name, entry] of Object.entries(value)) {
        if (accepted >= MAX_COMMANDS) break;
        if (!COMMAND_NAME_PATTERN.test(name) || !isPlainObject(entry)) continue;

        const sanitized: Record<string, unknown> = {};
        if (typeof entry.enabled === "boolean") {
            sanitized.enabled = entry.enabled;
        }
        if (Array.isArray(entry.aliases)) {
            const aliases: string[] = [];
            for (const alias of entry.aliases) {
                if (aliases.length >= MAX_ALIASES_PER_COMMAND) break;
                if (typeof alias !== "string") continue;
                const trimmed = alias.trim();
                if (
                    trimmed.length === 0 ||
                    trimmed.length > MAX_ALIAS_LENGTH
                ) {
                    continue;
                }
                aliases.push(trimmed);
            }
            sanitized.aliases = aliases;
        }

        if (Object.keys(sanitized).length === 0) continue;
        commands[name] = sanitized;
        accepted += 1;
    }
    return commands;
}

/**
 * Validates one allowlisted value. Returns the value to persist (possibly a
 * normalized copy) or undefined when it must be dropped.
 */
function validateSettableValue(key: string, value: unknown): unknown {
    if (BOOLEAN_SETTING_KEYS.has(key)) {
        return typeof value === "boolean" ? value : undefined;
    }
    if (COOLDOWN_KEYS.has(key)) {
        return validateCooldownSeconds(value);
    }
    if (key === "language" || key === "defaultsLanguage") {
        return typeof value === "string" && SUPPORTED_LANGUAGES.has(value)
            ? value
            : undefined;
    }
    if (TEMPLATE_SETTING_KEYS.has(key)) {
        return typeof value === "string" && value.length <= TEMPLATE_MAX_LENGTH
            ? value
            : undefined;
    }
    if (Object.prototype.hasOwnProperty.call(BOUNDED_STRING_LIMITS, key)) {
        if (typeof value !== "string") return undefined;
        const limit = BOUNDED_STRING_LIMITS[key];
        if (key === "prefix") {
            return value.length >= 1 && value.length <= limit
                ? value
                : undefined;
        }
        return value.length <= limit ? value : undefined;
    }
    if (Object.prototype.hasOwnProperty.call(LIST_LIMITS, key)) {
        const { maxItems, maxLength } = LIST_LIMITS[key];
        return validateStringList(value, maxItems, maxLength);
    }
    if (REDIRECT_URI_KEYS.has(key)) {
        return validateRedirectUri(value);
    }
    if (key === "commands") {
        return validateCommands(value);
    }
    return undefined;
}

/**
 * Projects a renderer `config:set` payload onto the settable allowlist and
 * validates each value. Non-object payloads, unknown/credential/flag keys and
 * wrongly typed, oversized or otherwise invalid values are dropped (never
 * thrown), so a malicious renderer cannot persist credentials, malformed
 * values or prototype-sensitive keys.
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
        const validated = validateSettableValue(key, value);
        if (validated === undefined) continue;
        patch[key] = validated;
    }
    return patch;
}
