import {
    readUpdateStatus,
    type UpdateStatus,
} from "../shared/updateStatus";

export interface MainUpdateStatusSnapshot {
    status: UpdateStatus | null;
    data: unknown;
}

/**
 * Main-owned copy of the latest update event. Renderer consumers that mount
 * after an event can hydrate from this instead of starting with no state.
 */
export function createUpdateStatusSnapshot(): {
    record(status: unknown, data?: unknown): void;
    read(): MainUpdateStatusSnapshot;
} {
    let current: MainUpdateStatusSnapshot = { status: null, data: null };

    return {
        record(status, data) {
            const known = readUpdateStatus(status);
            if (!known) return;
            current = {
                status: known,
                data: data === undefined ? null : data,
            };
        },
        read() {
            return { ...current };
        },
    };
}
