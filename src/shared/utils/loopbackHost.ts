const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * True only for the loopback hosts the app's own services may bind to or be
 * reached at. Accepts the bracketed IPv6 form WHATWG URLs produce (`[::1]`),
 * ignores case and surrounding whitespace, and rejects lookalikes such as
 * `localhost.evil.com`.
 */
export function isLoopbackHost(hostname: unknown): boolean {
    if (typeof hostname !== "string") return false;
    const raw = hostname.trim().toLowerCase();
    const host = raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;
    return LOOPBACK_HOSTS.has(host);
}

/**
 * Pick the loopback host that matches the registered OAuth redirect URI, so a
 * callback server never listens on a non-loopback interface. Unknown or
 * malformed redirect hosts fall back to localhost.
 */
export function loopbackHostForRedirect(redirectUri: string): string {
    try {
        const raw = new URL(redirectUri).hostname;
        if (isLoopbackHost(raw)) {
            return raw.startsWith("[") && raw.endsWith("]")
                ? raw.slice(1, -1)
                : raw.toLowerCase();
        }
    } catch {
        /* fall through to the safe default */
    }
    return "localhost";
}
