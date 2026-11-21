export interface IpcFrameLike {
    url?: string;
}

export interface IpcSenderLike {
    mainFrame?: IpcFrameLike;
}

export interface IpcEventLike {
    senderFrame?: IpcFrameLike | null;
    sender?: IpcSenderLike | null;
}

/**
 * The renderer runs from the packaged asar or a local dev server. Anything
 * else is not allowed to use app IPC.
 */
export function isTrustedRendererUrl(url: unknown): boolean {
    if (typeof url !== "string" || url.length === 0) return false;
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }
    if (parsed.protocol === "file:") {
        const pathName = decodeURIComponent(parsed.pathname)
            .replace(/\\/g, "/")
            .toLowerCase();
        return (
            pathName.endsWith("/index.html") &&
            pathName.includes("/app.asar/")
        );
    }
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return (
            parsed.hostname === "localhost" ||
            parsed.hostname === "127.0.0.1" ||
            parsed.hostname === "::1" ||
            parsed.hostname === "[::1]"
        );
    }
    return false;
}

export function isTrustedIpcSender(event: IpcEventLike): boolean {
    const frame = event.senderFrame;
    if (!frame || !isTrustedRendererUrl(frame.url)) return false;
    const mainFrame = event.sender?.mainFrame;
    if (mainFrame && mainFrame !== frame) return false;
    return true;
}

export function isConfirmedClearPayload(payload: unknown): boolean {
    return (
        !!payload &&
        typeof payload === "object" &&
        !Array.isArray(payload) &&
        (payload as { confirmed?: unknown }).confirmed === true
    );
}
