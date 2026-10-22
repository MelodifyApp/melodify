import path from "path";

/**
 * Update integrity boundary.
 *
 * `basic-electron-updater` downloads the first release asset that looks like a
 * Windows installer into `os.tmpdir()` and then executes it via
 * `child_process.execFile` (`applyUpdate`). It only verifies SHA256/GPG when the
 * release API supplies `sha256`/`gpgSignatureUrl` on the asset, which the GitHub
 * releases API never does, so the app must not hand an arbitrary downloaded path
 * straight to `applyUpdate`.
 *
 * This module validates the downloaded artifact (inside the OS temp directory,
 * an installer type for the platform, present and non-empty) before the app
 * unlocks the install step, and re-validates it immediately before applying.
 * Everything here is pure or dependency-injected so it can be unit tested
 * without Electron or the network.
 */

export const INSTALLER_EXTENSIONS: Readonly<Record<string, readonly string[]>> =
    Object.freeze({
        win32: Object.freeze([".exe", ".msi"]),
        darwin: Object.freeze([".dmg", ".pkg", ".zip"]),
        linux: Object.freeze([
            ".appimage",
            ".deb",
            ".rpm",
            ".snap",
            ".tar.gz",
        ]),
    });

function pathImpl(platform: string): typeof path.win32 | typeof path.posix {
    return platform === "win32" ? path.win32 : path.posix;
}

/** True only when `candidate` is strictly below `directory`. */
export function isPathInsideDirectory(
    candidate: unknown,
    directory: string,
    platform: string = process.platform
): boolean {
    if (typeof candidate !== "string" || candidate.trim().length === 0) {
        return false;
    }
    const impl = pathImpl(platform);
    const normalize = (value: string) =>
        platform === "win32" ? value.toLowerCase() : value;

    const base = normalize(impl.resolve(directory));
    const target = normalize(impl.resolve(candidate));
    const relative = impl.relative(base, target);

    if (relative.length === 0) return false; // the directory itself
    if (impl.isAbsolute(relative)) return false; // different root/drive
    if (relative === ".." || relative.startsWith(`..${impl.sep}`)) {
        return false;
    }
    return true;
}

export interface UpdateArtifactInput {
    filePath: unknown;
    platform: string;
    tempDir: string;
    exists: boolean;
    size: number;
    /** lstat-based facts: a symlink must never be trusted. */
    isSymlink?: boolean;
    /** Hardlinks (`nlink > 1`) let the write/exec redirect to another file. */
    linkCount?: number;
    /** Real (link-resolved) path of the artifact, when it could be computed. */
    realPath?: string;
    /** Real path of the trusted temp root, when the caller can provide it. */
    realTempDir?: string;
}

export interface UpdateArtifactCheck {
    ok: boolean;
    reason?: string;
    /** Resolved path of the validated artifact. */
    path?: string;
}

/**
 * Validates a downloaded update artifact without touching the filesystem: the
 * caller injects the existence/size facts.
 */
export function validateUpdateArtifact(
    input: UpdateArtifactInput
): UpdateArtifactCheck {
    const extensions = INSTALLER_EXTENSIONS[input.platform];
    if (!extensions) {
        return { ok: false, reason: `unsupported platform: ${input.platform}` };
    }
    if (typeof input.filePath !== "string" || input.filePath.trim().length === 0) {
        return { ok: false, reason: "missing download path" };
    }
    if (!isPathInsideDirectory(input.filePath, input.tempDir, input.platform)) {
        return {
            ok: false,
            reason: "download path is outside the update temp directory",
        };
    }

    const impl = pathImpl(input.platform);
    const resolved = impl.resolve(input.filePath);
    const name = impl.basename(resolved).toLowerCase();
    if (!extensions.some((extension) => name.endsWith(extension))) {
        return {
            ok: false,
            reason: `unexpected update artifact type: ${name}`,
        };
    }
    if (input.isSymlink === true) {
        return { ok: false, reason: "update artifact is a symbolic link" };
    }
    if (typeof input.linkCount === "number" && input.linkCount > 1) {
        return { ok: false, reason: "update artifact has multiple hard links" };
    }
    if (!input.exists) {
        return { ok: false, reason: "downloaded artifact is missing" };
    }
    if (!Number.isFinite(input.size) || input.size <= 0) {
        return { ok: false, reason: "downloaded artifact is empty" };
    }
    if (typeof input.realTempDir === "string") {
        if (typeof input.realPath !== "string" || input.realPath.length === 0) {
            return {
                ok: false,
                reason: "could not resolve the update artifact's real path",
            };
        }
        if (
            !isPathInsideDirectory(
                input.realPath,
                input.realTempDir,
                input.platform
            )
        ) {
            return {
                ok: false,
                reason: "update artifact's real path is outside the update temp directory",
            };
        }
    }

    return { ok: true, path: resolved };
}

export interface UpdateArtifactFsLike {
    lstatSync(filePath: string): {
        isFile(): boolean;
        isSymbolicLink(): boolean;
        size: number;
        nlink: number;
    };
    realpathSync(filePath: string): string;
}

export interface UpdateArtifactStat {
    exists: boolean;
    size: number;
    isSymlink: boolean;
    linkCount: number;
    realPath?: string;
}

/**
 * Reads the artifact facts without following links: `lstat` reveals symlinks
 * and hardlink counts, and `realpath` resolves any link in the path so the
 * caller can prove the real file still lives inside the temp root.
 */
export function statUpdateArtifact(
    filePath: string,
    fsLike: UpdateArtifactFsLike
): UpdateArtifactStat {
    try {
        const stats = fsLike.lstatSync(filePath);
        if (stats.isSymbolicLink()) {
            return {
                exists: true,
                size: 0,
                isSymlink: true,
                linkCount: stats.nlink,
            };
        }
        if (!stats.isFile()) {
            return {
                exists: false,
                size: 0,
                isSymlink: false,
                linkCount: stats.nlink,
            };
        }
        let realPath: string | undefined;
        try {
            realPath = fsLike.realpathSync(filePath);
        } catch {
            realPath = undefined;
        }
        return {
            exists: true,
            size: stats.size,
            isSymlink: false,
            linkCount: stats.nlink,
            realPath,
        };
    } catch {
        return { exists: false, size: 0, isSymlink: false, linkCount: 0 };
    }
}

export interface UpdateUpdaterLike {
    checkForUpdates(): Promise<unknown>;
    downloadUpdate(): Promise<string>;
    applyUpdate(): unknown;
}

export interface UpdateControllerDeps {
    updater: UpdateUpdaterLike | null;
    platform: string;
    tempDir: string;
    /** Real (link-resolved) temp root; used to prove the artifact's real path. */
    realTempDir: string;
    statFile(filePath: string): UpdateArtifactStat;
    broadcast(channel: string, ...args: unknown[]): void;
    log: {
        info(message: string): void;
        warn(message: string, context?: string): void;
        error(error: unknown, message?: string): void;
    };
}

export interface UpdateController {
    checkForUpdates(): Promise<void>;
    downloadUpdate(): Promise<void>;
    installUpdate(): void;
    /** Path of the validated artifact, or null when install must stay blocked. */
    getValidatedArtifactPath(): string | null;
}

function messageOf(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === "string" && error.length > 0) return error;
    return fallback;
}

/**
 * State machine around the updater: a download only unlocks install after it
 * passes validation, and install re-validates the artifact first.
 */
export function createUpdateController(
    deps: UpdateControllerDeps
): UpdateController {
    let validatedPath: string | null = null;

    const unavailable = (context: string, message: string) => {
        deps.log.warn(`${message} - update functionality disabled`, context);
        deps.broadcast("update:status", "error", "Updater not available");
    };

    const validate = (filePath: unknown): UpdateArtifactCheck => {
        const stat =
            typeof filePath === "string"
                ? deps.statFile(filePath)
                : {
                      exists: false,
                      size: 0,
                      isSymlink: false,
                      linkCount: 0,
                  };
        return validateUpdateArtifact({
            filePath,
            platform: deps.platform,
            tempDir: deps.tempDir,
            exists: stat.exists,
            size: stat.size,
            isSymlink: stat.isSymlink,
            linkCount: stat.linkCount,
            realPath: stat.realPath,
            realTempDir: deps.realTempDir,
        });
    };

    async function checkForUpdates(): Promise<void> {
        if (!deps.updater) {
            unavailable("updater:checkForUpdates", "Cannot check for updates");
            return;
        }
        try {
            await deps.updater.checkForUpdates();
        } catch (error) {
            deps.log.error(error, "updater:checkForUpdates");
            deps.broadcast(
                "update:status",
                "error",
                messageOf(error, "Failed to check for updates")
            );
        }
    }

    async function downloadUpdate(): Promise<void> {
        if (!deps.updater) {
            unavailable("updater:downloadUpdate", "Cannot download update");
            return;
        }
        try {
            const downloadedPath = await deps.updater.downloadUpdate();
            const check = validate(downloadedPath);
            if (!check.ok || !check.path) {
                validatedPath = null;
                deps.log.error(
                    new Error(`Rejected downloaded update: ${check.reason}`),
                    "updater:downloadUpdate"
                );
                deps.broadcast(
                    "update:status",
                    "error",
                    "Downloaded update failed validation"
                );
                return;
            }
            validatedPath = check.path;
            deps.log.info("Update downloaded and validated");
            deps.broadcast("update:status", "downloaded");
        } catch (error) {
            validatedPath = null;
            deps.log.error(error, "updater:downloadUpdate");
            deps.broadcast(
                "update:status",
                "error",
                messageOf(error, "Failed to download update")
            );
        }
    }

    function installUpdate(): void {
        if (!deps.updater) {
            unavailable("updater:installUpdate", "Cannot install update");
            return;
        }
        if (!validatedPath) {
            deps.log.warn(
                "Refused to install an update that was not validated",
                "updater:installUpdate"
            );
            deps.broadcast(
                "update:status",
                "error",
                "No validated update is ready to install"
            );
            return;
        }

        const recheck = validate(validatedPath);
        if (!recheck.ok || !recheck.path) {
            validatedPath = null;
            deps.log.error(
                new Error(`Update artifact is no longer valid: ${recheck.reason}`),
                "updater:installUpdate"
            );
            deps.broadcast(
                "update:status",
                "error",
                "Update artifact is no longer valid"
            );
            return;
        }

        try {
            const result = deps.updater.applyUpdate();
            if (result && typeof (result as Promise<unknown>).then === "function") {
                (result as Promise<unknown>).catch((error) => {
                    deps.log.error(error, "updater:installUpdate");
                    deps.broadcast(
                        "update:status",
                        "error",
                        messageOf(error, "Failed to install update")
                    );
                });
            }
        } catch (error) {
            deps.log.error(error, "updater:installUpdate");
            deps.broadcast(
                "update:status",
                "error",
                messageOf(error, "Failed to install update")
            );
        }
    }

    return {
        checkForUpdates,
        downloadUpdate,
        installUpdate,
        getValidatedArtifactPath: () => validatedPath,
    };
}
