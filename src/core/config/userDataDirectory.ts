import path from "path";

/**
 * Select an isolated app data directory only for an explicit development preview.
 * Packaged/production builds always keep Electron's normal userData location.
 */
export function resolveUserDataDirectory(
    defaultDirectory: string,
    previewDirectory?: string,
    isDevelopment = false
): string {
    const requestedDirectory = previewDirectory?.trim();
    if (!isDevelopment || !requestedDirectory) return defaultDirectory;
    return path.resolve(requestedDirectory);
}

/**
 * True when a preview directory was requested but cannot be honored, which
 * means the normal profile would be used against the developer's intent.
 */
export function previewOverrideIgnored(
    defaultDirectory: string,
    previewDirectory?: string,
    isDevelopment = false
): boolean {
    return !!previewDirectory?.trim() &&
        resolveUserDataDirectory(defaultDirectory, previewDirectory, isDevelopment) === defaultDirectory;
}
