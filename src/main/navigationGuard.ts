import { isSafeExternalUrl } from "@/shared/utils/externalUrl";

export interface NavigationGuardOptions {
    /** Hand a validated external URL to the OS browser. */
    openExternal(url: string): void;
    /**
     * Allow an in-app navigation. Defaults to same-origin comparisons against
     * the current page, which covers renderer reloads and in-app routing.
     */
    allowNavigationTo?(url: string, currentUrl: string): boolean;
}

function isSameOrigin(url: string, currentUrl: string): boolean {
    try {
        return new URL(url).origin === new URL(currentUrl).origin;
    } catch {
        return false;
    }
}

/**
 * Restrict renderer navigation for a window:
 * - `window.open`/target=_blank is always denied as an app window; valid web
 *   URLs are opened in the OS browser instead.
 * - In-app (same-origin) navigation is allowed; any other navigation is
 *   cancelled, with valid web URLs opened externally.
 *
 * The caller injects `openExternal`, so this module stays Electron-free and
 * unit-testable.
 */
export function applyNavigationGuards(
    contents: Electron.WebContents,
    options: NavigationGuardOptions
): void {
    contents.setWindowOpenHandler(({ url }) => {
        if (isSafeExternalUrl(url)) {
            options.openExternal(url);
        }
        return { action: "deny" };
    });

    contents.on("will-navigate", (event, url) => {
        const allow =
            options.allowNavigationTo ?? isSameOrigin;
        if (typeof url === "string" && allow(url, contents.getURL())) {
            return;
        }
        event.preventDefault();
        if (isSafeExternalUrl(url)) {
            options.openExternal(url);
        }
    });
}
