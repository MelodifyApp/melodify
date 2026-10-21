/**
 * Safely dispatch a main-process event to a renderer window.
 *
 * Window teardown races with async auth/chat callbacks after the user closes
 * the app or a settings view. A status notification is best-effort and must
 * never turn closing the app into an uncaught "Object has been destroyed".
 */
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
        return false;
    }
}
