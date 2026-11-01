/** Bounded, de-duplicated renderer state for the live Settings log view. */
export const MAX_LOG_ENTRIES = 1000;

function entryTimestamp(entry: unknown): number {
    if (!entry || typeof entry !== "object") return 0;
    const timestamp = (entry as { timestamp?: unknown }).timestamp;
    return typeof timestamp === "number" && Number.isFinite(timestamp)
        ? timestamp
        : 0;
}

function entryKey(entry: unknown): string {
    try {
        return JSON.stringify(entry) ?? String(entry);
    } catch {
        return `${entryTimestamp(entry)}:${String(entry)}`;
    }
}

/**
 * Merge a hydrated snapshot and streamed entries without losing entries that
 * arrived during hydration or duplicating the overlap. The newest 1000
 * entries are retained, matching the main-process in-memory bound.
 */
export function mergeLogEntries<T>(
    current: readonly T[],
    incoming: readonly T[]
): T[] {
    const seen = new Set<string>();
    const merged: T[] = [];
    for (const entry of [...current, ...incoming]) {
        const key = entryKey(entry);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(entry);
    }
    merged.sort((left, right) => entryTimestamp(left) - entryTimestamp(right));
    return merged.length > MAX_LOG_ENTRIES
        ? merged.slice(merged.length - MAX_LOG_ENTRIES)
        : merged;
}
