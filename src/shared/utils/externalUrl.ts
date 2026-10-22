import { isLoopbackHost } from "./loopbackHost";

/**
 * External URL policy for the main process.
 *
 * Only absolute http(s) URLs may be handed to the OS browser, and only when
 * they are safe to open:
 * - non-web schemes (javascript:, file:, data:, custom schemes), relative or
 *   protocol-relative values, non-strings and malformed URLs are rejected;
 * - URLs with embedded credentials (`https://user:pass@host`) are rejected so
 *   the OS handler never receives a password and lookalike hosts cannot be
 *   smuggled in;
 * - plain HTTP is accepted only for the app's own loopback services
 *   (`localhost`, `127.0.0.1`, `::1`); every external host must use HTTPS.
 *
 * The provider OAuth authorize URLs are opened directly from the main process
 * and do not pass through this helper.
 */
export function isSafeExternalUrl(value: unknown): value is string {
    if (typeof value !== "string") return false;
    const candidate = value.trim();
    if (!candidate) return false;
    try {
        const url = new URL(candidate);
        if (url.protocol !== "http:" && url.protocol !== "https:") return false;
        if (url.username || url.password) return false;
        if (url.protocol === "http:" && !isLoopbackHost(url.hostname)) {
            return false;
        }
        return true;
    } catch {
        return false;
    }
}
