const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Pick the loopback host that matches the registered OAuth redirect URI, so a
 * callback server never listens on a non-loopback interface. Unknown or
 * malformed redirect hosts fall back to localhost.
 */
export function loopbackHostForRedirect(redirectUri: string): string {
    try {
        const raw = new URL(redirectUri).hostname;
        const host =
            raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;
        if (LOOPBACK_HOSTS.has(host)) return host;
    } catch {
        /* fall through to the safe default */
    }
    return "localhost";
}
