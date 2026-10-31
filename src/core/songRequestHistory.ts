import type { SongRequestOutcome } from "../shared/songRequestOutcome";

export type RecordedSongRequestOutcome = SongRequestOutcome & {
    timestamp: number;
};

export interface SongRequestOutcomeStore {
    record(outcome: SongRequestOutcome): RecordedSongRequestOutcome;
    getLast(): RecordedSongRequestOutcome | null;
    reset(): void;
}

export function createSongRequestOutcomeStore(
    now: () => number = Date.now
): SongRequestOutcomeStore {
    let lastOutcome: RecordedSongRequestOutcome | null = null;

    return {
        record(outcome) {
            lastOutcome = {
                ...outcome,
                timestamp: now(),
            };
            return lastOutcome;
        },
        getLast() {
            return lastOutcome ? { ...lastOutcome } : null;
        },
        reset() {
            lastOutcome = null;
        },
    };
}

const store = createSongRequestOutcomeStore();

export function recordSongRequestOutcome(
    outcome: SongRequestOutcome
): RecordedSongRequestOutcome {
    return store.record(outcome);
}

export function getLastSongRequestOutcome(): RecordedSongRequestOutcome | null {
    return store.getLast();
}

/** Test/reset seam for the in-memory status path. */
export function resetSongRequestOutcomeHistory(): void {
    store.reset();
}
