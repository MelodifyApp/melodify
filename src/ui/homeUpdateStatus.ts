import type {
    UpdateManifest,
    UpdateProgress,
    UpdateStatus,
} from "@/shared/updateStatus";

export type HomeUpdateTone = "ok" | "error" | "muted" | undefined;
export type HomeUpdateIcon = "spin" | "available" | "error" | null;

export interface HomeUpdatePresentation {
    key: string;
    version?: string;
    percent?: number;
    tone: HomeUpdateTone;
    icon: HomeUpdateIcon;
}

/**
 * Home must not turn "no event received yet" into "Up to date". A null status
 * is an explicit unavailable/unknown state until main or an event says more.
 */
export function homeUpdatePresentation(
    status: UpdateStatus | null,
    progress: UpdateProgress | null,
    manifest: UpdateManifest | null
): HomeUpdatePresentation {
    if (status === null) {
        return {
            key: "home.updateStatusUnavailable",
            tone: "muted",
            icon: null,
        };
    }

    switch (status) {
        case "checking":
            return {
                key: "home.checkingUpdates",
                tone: "muted",
                icon: "spin",
            };
        case "downloading":
            return {
                key: "home.downloadingUpdate",
                percent: Math.round(progress?.percent ?? 0),
                tone: "muted",
                icon: "spin",
            };
        case "downloaded":
            return {
                key: "home.updateReady",
                tone: "ok",
                icon: "available",
            };
        case "installing":
            return {
                key: "home.installingUpdate",
                tone: "muted",
                icon: "spin",
            };
        case "available":
            return {
                key: "home.updateAvailable",
                version: manifest?.version,
                tone: "ok",
                icon: "available",
            };
        case "install-error":
        case "error":
            return {
                key: "home.updateError",
                tone: "error",
                icon: "error",
            };
        case "not-available":
            return {
                key: "home.upToDate",
                tone: undefined,
                icon: null,
            };
    }
}
