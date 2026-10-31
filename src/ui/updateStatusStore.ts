import {
    readUpdateErrorMessage,
    readUpdateManifest,
    readUpdateProgress,
    readUpdateStatus,
    type UpdateManifest,
    type UpdateProgress,
    type UpdateStatus,
} from "@/shared/updateStatus";

export interface UpdateStatusSnapshot {
    status: UpdateStatus | null;
    progress: UpdateProgress | null;
    manifest: UpdateManifest | null;
    errorMessage: string | null;
}

export interface UpdateStatusBridge {
    on?(
        channel: string,
        listener: (...args: unknown[]) => void
    ): void;
    removeListener?(
        channel: string,
        listener: (...args: unknown[]) => void
    ): void;
    invoke?(channel: string, ...args: unknown[]): Promise<unknown>;
}

export interface UpdateStatusStore {
    getSnapshot(): UpdateStatusSnapshot;
    subscribe(listener: () => void): () => void;
    applyEvent(status: unknown, data?: unknown): void;
    initialize(bridge?: UpdateStatusBridge | null): Promise<void>;
}

function emptySnapshot(): UpdateStatusSnapshot {
    return {
        status: null,
        progress: null,
        manifest: null,
        errorMessage: null,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

export function createUpdateStatusStore(): UpdateStatusStore {
    let snapshot = emptySnapshot();
    const listeners = new Set<() => void>();
    let listeningBridge: UpdateStatusBridge | null = null;
    let hydrationStarted = false;

    const notify = () => {
        for (const listener of listeners) {
            listener();
        }
    };

    const getSnapshot = (): UpdateStatusSnapshot => snapshot;

    const applyEvent = (statusValue: unknown, data?: unknown): void => {
        const status = readUpdateStatus(statusValue);
        if (!status) return;

        const next: UpdateStatusSnapshot = {
            ...snapshot,
            status,
            errorMessage: null,
        };

        switch (status) {
            case "available":
                next.manifest = readUpdateManifest(data);
                next.progress = null;
                break;
            case "downloading":
                next.progress = readUpdateProgress(data);
                break;
            case "checking":
                next.progress = null;
                break;
            case "not-available":
                next.progress = null;
                next.manifest = null;
                break;
            case "downloaded":
            case "installing":
                next.progress = null;
                break;
            case "error":
            case "install-error":
                next.progress = null;
                next.errorMessage = readUpdateErrorMessage(data);
                break;
        }

        snapshot = next;
        notify();
    };

    const initialize = async (
        bridge?: UpdateStatusBridge | null
    ): Promise<void> => {
        if (!bridge) return;
        if (!listeningBridge) {
            bridge.on?.("update:status", applyEvent);
            listeningBridge = bridge;
        }
        if (hydrationStarted) return;
        hydrationStarted = true;

        try {
            const current = await bridge.invoke?.("update:getStatus");
            // An event that arrived while the snapshot was in flight is newer
            // than the snapshot response.
            if (snapshot.status !== null || !isRecord(current)) return;
            applyEvent(current.status, current.data);
        } catch {
            // Allow a later remount to retry hydration; events remain live.
            hydrationStarted = false;
        }
    };

    return {
        getSnapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        applyEvent,
        initialize,
    };
}

export const updateStatusStore = createUpdateStatusStore();

export function initializeUpdateStatusStore(
    bridge?: UpdateStatusBridge | null
): Promise<void> {
    return updateStatusStore.initialize(bridge);
}
