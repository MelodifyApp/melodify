import { isSafeExternalUrl } from "@/shared/utils/externalUrl";

export interface NavigationGuardOptions {
    /** Hand a validated external URL to the OS browser. */
    openExternal(url: string): void;
    /**
     * Allow an in-app navigation. Defaults to a same-app comparison against the
     * current page, which covers renderer reloads and in-app routing.
     */
    allowNavigationTo?(url: string, currentUrl: string): boolean;
}

type NavigationDetails = {
    url?: string;
    isMainFrame?: boolean;
    preventDefault(): void;
};

/**
 * Same-app navigation check.
 *
 * `file:` URLs serialize to the "null" origin, so comparing origins would let
 * any local file path count as same-origin. For file pages, scope navigation to
 * the directory of the current document instead.
 */
function isSameAppNavigation(url: string, currentUrl: string): boolean {
    try {
        const target = new URL(url);
        const current = new URL(currentUrl);
        if (target.protocol !== current.protocol) return false;
        if (target.protocol === "file:") {
            const currentDirectory = current.pathname.slice(
                0,
                current.pathname.lastIndexOf("/") + 1
            );
            return (
                currentDirectory.length > 0 &&
                target.pathname.startsWith(currentDirectory)
            );
        }
        return target.origin === current.origin;
    } catch {
        return false;
    }
}

function navigationUrl(
    details: NavigationDetails,
    legacyUrl?: string
): string | undefined {
    if (typeof details?.url === "string") return details.url;
    return typeof legacyUrl === "string" ? legacyUrl : undefined;
}

/**
 * Restrict renderer navigation for a window:
 * - `window.open`/target=_blank is always denied as an app window; valid web
 *   URLs are opened in the OS browser instead.
 * - Main-frame navigations and server redirects are allowed only inside the
 *   app; anything else is cancelled, with valid web URLs opened externally.
 * - Subframe navigations are cancelled outside the app and never open a
 *   browser window.
 *
 * The caller injects `openExternal`, so this module stays Electron-free and
 * unit-testable.
 */
export function applyNavigationGuards(
    contents: Electron.WebContents,
    options: NavigationGuardOptions
): void {
    const isAllowed = (url: string): boolean =>
        (options.allowNavigationTo ?? isSameAppNavigation)(
            url,
            contents.getURL()
        );

    const guardMainFrame = (
        details: NavigationDetails,
        legacyUrl?: string
    ): void => {
        const url = navigationUrl(details, legacyUrl);
        if (typeof url === "string" && isAllowed(url)) {
            return;
        }
        details.preventDefault();
        if (isSafeExternalUrl(url)) {
            options.openExternal(url);
        }
    };

    contents.setWindowOpenHandler(({ url }) => {
        if (isSafeExternalUrl(url)) {
            options.openExternal(url);
        }
        return { action: "deny" };
    });

    contents.on("will-navigate", guardMainFrame);
    contents.on("will-redirect", guardMainFrame);

    contents.on("will-frame-navigate", (details: NavigationDetails) => {
        // Main-frame navigations are already covered above; handling them here
        // as well would open an external URL twice.
        if (!details || details.isMainFrame !== false) return;
        const url = navigationUrl(details);
        if (typeof url === "string" && isAllowed(url)) {
            return;
        }
        details.preventDefault();
        // Subframe navigations never hand off to the system browser.
    });
}
