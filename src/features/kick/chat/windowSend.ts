/** Safely dispatch a Kick listener status event to the main renderer window. */
export function sendToWindowIfAlive(
    window: Electron.BrowserWindow | null | undefined,
    channel: string,
    ...args: unknown[]
): boolean {
    try {
        if (!window || window.isDestroyed()) return false;
        const contents = window.webContents;
        if (!contents || contents.isDestroyed()) return false;
        contents.send(channel, ...args);
        return true;
    } catch {
        // Window teardown can race with async Kick callbacks. A notification is
        // best-effort and must never turn closing the app into an uncaught error.
        return false;
    }
}
