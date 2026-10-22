/**
 * External URL policy for the main process.
 *
 * Only absolute http(s) URLs may be handed to the OS browser. Everything else
 * (javascript:, file:, data:, custom schemes, relative/protocol-relative
 * values, non-strings and malformed URLs) is rejected.
 */
export function isSafeExternalUrl(value: unknown): value is string {
    if (typeof value !== "string") return false;
    const candidate = value.trim();
    if (!candidate) return false;
    try {
        const url = new URL(candidate);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}
