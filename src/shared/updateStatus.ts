/**
 * Shared update status shapes used by the main-process snapshot, the renderer
 * store, and the update UI. There is deliberately no synthetic "idle" value:
 * null means no update state has been received yet.
 */

export const UPDATE_STATUS_VALUES = [
    "checking",
    "available",
    "not-available",
    "downloading",
    "downloaded",
    "installing",
    "install-error",
    "error",
] as const;

export type UpdateStatus = (typeof UPDATE_STATUS_VALUES)[number];

export interface UpdateProgress {
    percent: number;
    transferred?: number;
    total?: number;
}

export interface UpdateManifest {
    version: string;
    releaseNotes?: string;
    releaseName?: string;
    releaseDate?: string;
}

export function readUpdateStatus(value: unknown): UpdateStatus | null {
    return typeof value === "string" &&
        (UPDATE_STATUS_VALUES as readonly string[]).includes(value)
        ? (value as UpdateStatus)
        : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

export function readUpdateProgress(value: unknown): UpdateProgress | null {
    if (!isRecord(value)) return null;
    if (typeof value.percent !== "number" || !Number.isFinite(value.percent)) {
        return null;
    }
    const progress: UpdateProgress = { percent: value.percent };
    if (
        typeof value.transferred === "number" &&
        Number.isFinite(value.transferred)
    ) {
        progress.transferred = value.transferred;
    }
    if (typeof value.total === "number" && Number.isFinite(value.total)) {
        progress.total = value.total;
    }
    return progress;
}

export function readUpdateManifest(value: unknown): UpdateManifest | null {
    if (!isRecord(value) || typeof value.version !== "string") return null;
    const manifest: UpdateManifest = { version: value.version };
    if (typeof value.releaseNotes === "string") {
        manifest.releaseNotes = value.releaseNotes;
    }
    if (typeof value.releaseName === "string") {
        manifest.releaseName = value.releaseName;
    }
    if (typeof value.releaseDate === "string") {
        manifest.releaseDate = value.releaseDate;
    }
    return manifest;
}

export function readUpdateErrorMessage(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0 ? value : null;
}
