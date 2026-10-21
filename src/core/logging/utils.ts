const SECRET_KEYS = [
    "accesstoken", "refreshtoken", "clientsecret", "token", "secret",
    "password", "jwt", "idtoken", "codeverifier",
    "authorization", "cookie", "apikey",
];
// OAuth callback parameters are sensitive in URLs, but "code"/"state" also
// appear as harmless diagnostics (Node error codes, connection state).
const OAUTH_PARAM_KEYS = ["code", "state"];
const REDACTED = "[REDACTED]";

/**
 * Header values are only masked when they actually look like credentials.
 * Prose such as "OAuth tokens" or "Bearer flow" must survive redaction.
 */
function looksLikeCredential(candidate: string): boolean {
    if (candidate.length < 12) return false;
    return /\d/.test(candidate) || /[._~+/%=-]/.test(candidate) || candidate.length >= 24;
}

function normalizeKey(key: string): string {
    return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isSecretKey(key: string): boolean {
    const normalized = normalizeKey(key);
    return normalized === "session" ||
        SECRET_KEYS.some((secret) => normalized.includes(secret));
}

function isSecretParamKey(key: string): boolean {
    return isSecretKey(key) || OAUTH_PARAM_KEYS.includes(normalizeKey(key));
}

/**
 * Only unquoted `true`/`false` are boolean diagnostics. A quoted value such as
 * `"true"` is a credential string and must remain redacted.
 */
function isBooleanLiteral(raw: string): boolean {
    const value = raw.trim();
    return value === "true" || value === "false";
}

/**
 * Boolean diagnostics conventionally use has/is prefixes (`hasClientSecret`,
 * `isAuthenticated`). Direct credential keys (`clientSecret`, `refreshToken`)
 * must stay masked even when their value looks like a boolean.
 */
function isBooleanDiagnosticKey(key: string): boolean {
    const normalized = normalizeKey(key);
    return normalized.startsWith("has") || normalized.startsWith("is");
}

export function redactLogText(text: string): string {
    // URL/form parameters (including percent-encoded parameter names).
    let safe = text.replace(/([?&#]|^)([^\s?&#=]+)=([^\s&#]*)/g,
        (match, separator: string, key: string, value: string) => {
            let decodedKey = key;
            try { decodedKey = decodeURIComponent(key); } catch { /* leave malformed keys unchanged */ }
            if (
                !isSecretParamKey(decodedKey) ||
                (isBooleanDiagnosticKey(decodedKey) && isBooleanLiteral(value))
            ) {
                return match;
            }
            return `${separator}${key}=${REDACTED}`;
        });
    // Header schemes and SDK error text can contain raw credentials.
    safe = safe.replace(/\b(Bearer|Basic|OAuth)\s+([A-Za-z0-9._~+/%=-]+)/gi,
        (match, scheme: string, candidate: string) =>
            looksLikeCredential(candidate) ? `${scheme} ${REDACTED}` : match);
    // JSON, object-dump and key=value forms; keep HTTP status/error labels intact.
    safe = safe.replace(/(?<![\w-])(["']?)([\w-]*(?:token|secret|password|jwt|code[_-]?verifier|authorization|cookie|api[_-]?key)[\w-]*|session)\1\s*([:=])\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\[REDACTED\]|[^\s,;&}\]]+)/gi,
        (match, quote: string, key: string, separator: string, raw: string) => {
            if (
                !isSecretKey(key) ||
                (isBooleanDiagnosticKey(key) && isBooleanLiteral(raw))
            ) {
                return match;
            }
            const valueQuote = raw.startsWith('"') ? '"' : raw.startsWith("'") ? "'" : "";
            return `${quote}${key}${quote}${separator}${valueQuote}${REDACTED}${valueQuote}`;
        });
    return safe;
}

/** Returns a serializable copy suitable for every log destination. */
export function redactSecrets(value: unknown, depth = 0): any {
    if (depth > 6) return "[Object]";
    if (typeof value === "string") return redactLogText(value);
    if (value instanceof Error) {
        return { name: redactLogText(value.name), message: redactLogText(value.message), stack: redactLogText(value.stack || value.message) };
    }
    if (typeof value === "bigint") return value.toString();
    if (Array.isArray(value)) return value.map((item) => redactSecrets(item, depth + 1));
    if (!value || typeof value !== "object") return value;
    const redacted: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
        const secret =
            isSecretKey(key) &&
            !(isBooleanDiagnosticKey(key) && typeof item === "boolean");
        Object.defineProperty(redacted, key, {
            enumerable: true, configurable: true, writable: true,
            value: secret ? REDACTED : redactSecrets(item, depth + 1),
        });
    }
    return redacted;
}
