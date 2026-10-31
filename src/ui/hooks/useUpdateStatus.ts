// useUpdateStatus.ts
// Reads the shared, always-listening update state store.

import { useEffect, useState } from "react";
import {
    updateStatusStore,
    type UpdateStatusStore,
    type UpdateStatusSnapshot,
} from "@/ui/updateStatusStore";
import type {
    UpdateManifest,
    UpdateProgress,
    UpdateStatus,
} from "@/shared/updateStatus";

export type {
    UpdateManifest,
    UpdateProgress,
    UpdateStatus,
} from "@/shared/updateStatus";

interface UseUpdateStatusReturn {
    status: UpdateStatus | null;
    progress?: UpdateProgress | null;
    manifest?: UpdateManifest | null;
    errorMessage?: string | null;
}

/**
 * Hydrates from the shared snapshot immediately, then follows later events.
 * Events belong to the store, not to a particular mounted consumer.
 */
export function useUpdateStatus(
    store: UpdateStatusStore = updateStatusStore
): UseUpdateStatusReturn {
    const [snapshot, setSnapshot] = useState<UpdateStatusSnapshot>(() =>
        store.getSnapshot()
    );

    useEffect(() => {
        setSnapshot(store.getSnapshot());
        const unsubscribe = store.subscribe(() => {
            setSnapshot(store.getSnapshot());
        });
        void store.initialize(
            typeof window !== "undefined" ? window.electronAPI : undefined
        );
        return unsubscribe;
    }, [store]);

    return {
        status: snapshot.status,
        progress: snapshot.progress,
        manifest: snapshot.manifest,
        errorMessage: snapshot.errorMessage,
    };
}
