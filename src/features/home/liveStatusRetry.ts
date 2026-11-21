export interface LiveStatusRetryOptions {
    /** Maximum checks, including the first one. */
    attempts?: number;
    /** Delay before each retry; the last value is reused. */
    delaysMs?: readonly number[];
    sleep?: (ms: number) => Promise<void>;
}

/**
 * Runs one provider live check with a small retry budget. A `null` result or a
 * thrown error means "unknown"; a confirmed boolean stops immediately.
 */
export async function readLiveStatusWithRetry(
    read: () => Promise<boolean | null>,
    options: LiveStatusRetryOptions = {}
): Promise<boolean | null> {
    const attempts = Math.max(1, options.attempts ?? 3);
    const delaysMs = options.delaysMs ?? [1000, 2000];
    const sleep =
        options.sleep ??
        ((ms: number) =>
            new Promise<void>((resolve) => {
                setTimeout(resolve, ms);
            }));

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            const status = await read();
            if (status !== null) return status;
        } catch {
            // Treat provider errors as unknown and retry.
        }
        if (attempt < attempts - 1) {
            const delay =
                delaysMs[Math.min(attempt, delaysMs.length - 1)] ?? 0;
            if (delay > 0) await sleep(delay);
        }
    }
    return null;
}
