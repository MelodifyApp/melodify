/**
 * One owner for process-level lifecycle intent.
 *
 * The renderer titlebar, the native window close event, the tray menu and the
 * updater all converge here. Only an explicit quit intent may bypass the
 * close-to-tray setting.
 */

export type QuitReason =
    | "titlebar-close"
    | "tray-quit"
    | "native-close"
    | "window-all-closed"
    | "installer"
    | "restart"
    | "external";

export interface LifecycleWindow {
    isDestroyed(): boolean;
    isMinimized?(): boolean;
    restore?(): void;
    show(): void;
    focus(): void;
    hide(): void;
}

export interface LifecycleApp {
    requestSingleInstanceLock(): boolean;
    on(event: "second-instance", listener: () => void): unknown;
    on(event: "before-quit", listener: () => void): unknown;
    quit(): void;
}

export interface AppLifecycleDeps {
    app: LifecycleApp;
    getMainWindow(): LifecycleWindow | null;
    getTray(): unknown | null;
    createTray(): void;
    getMinimizeToTray(): boolean;
    isMac: boolean;
    log?: {
        info(message: string, context?: string): void;
        warn(message: string, context?: string): void;
    };
}

export interface CloseEventLike {
    preventDefault(): void;
}

export type CloseDecision = "hide" | "close";

export interface AppLifecycle {
    /** Acquire the one lock and register the focus-existing handler. */
    acquireSingleInstanceLock(): boolean;
    isPrimaryInstance(): boolean;
    /** Focus the existing window without creating a second one. */
    focusMainWindow(): void;
    /** Explicit quit from titlebar, tray, restart or updater. */
    requestQuit(reason: QuitReason): void;
    /** Mark an installer-driven quit before applyUpdate can call app.quit. */
    beginInstallerQuit(): void;
    /** Roll back the installer intent when applyUpdate could not start. */
    cancelInstallerQuit(): void;
    /** Native window close: hide for tray mode, otherwise allow close. */
    handleWindowClose(event: CloseEventLike): CloseDecision;
    /** Last window closed: quit on non-macOS, no-op on macOS. */
    handleWindowAllClosed(): void;
    getQuitReason(): QuitReason | null;
}

export function createAppLifecycle(deps: AppLifecycleDeps): AppLifecycle {
    let primaryInstance = false;
    let quitReason: QuitReason | null = null;

    const log = deps.log ?? {
        info: () => undefined,
        warn: () => undefined,
    };

    const focusMainWindow = (): void => {
        const window = deps.getMainWindow();
        if (!window || window.isDestroyed()) return;
        if (window.isMinimized?.()) {
            window.restore?.();
        }
        window.show();
        window.focus();
    };

    const acquireSingleInstanceLock = (): boolean => {
        if (primaryInstance) return true;
        const acquired = deps.app.requestSingleInstanceLock();
        if (!acquired) {
            log.warn(
                "Another Quelody instance owns the app lock; exiting",
                "lifecycle:singleInstance"
            );
            deps.app.quit();
            return false;
        }

        primaryInstance = true;
        deps.app.on("second-instance", focusMainWindow);
        deps.app.on("before-quit", () => {
            // Any external quit (including the updater library) becomes an
            // explicit intent before Electron closes the windows.
            if (!quitReason) quitReason = "external";
        });
        return true;
    };

    const requestQuit = (reason: QuitReason): void => {
        if (!quitReason) quitReason = reason;
        log.info(`Quit requested: ${reason}`, "lifecycle:quit");
        deps.app.quit();
    };

    const handleWindowClose = (event: CloseEventLike): CloseDecision => {
        if (quitReason) {
            return "close";
        }
        if (deps.getMinimizeToTray()) {
            event.preventDefault();
            const window = deps.getMainWindow();
            if (window && !window.isDestroyed()) window.hide();
            if (!deps.getTray()) deps.createTray();
            return "hide";
        }
        // The close event is already in progress. Record intent and let it
        // proceed; window-all-closed performs the actual quit.
        quitReason = "native-close";
        return "close";
    };

    const handleWindowAllClosed = (): void => {
        if (deps.isMac) return;
        if (!quitReason) quitReason = "window-all-closed";
        deps.app.quit();
    };

    return {
        acquireSingleInstanceLock,
        isPrimaryInstance: () => primaryInstance,
        focusMainWindow,
        requestQuit,
        beginInstallerQuit() {
            if (!quitReason) quitReason = "installer";
        },
        cancelInstallerQuit() {
            if (quitReason === "installer") quitReason = null;
        },
        handleWindowClose,
        handleWindowAllClosed,
        getQuitReason: () => quitReason,
    };
}
