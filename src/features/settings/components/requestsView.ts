/** Pure presentation rules shared by the Requests section and its tests. */

export function songFileControlsEnabled(config: Record<string, unknown>): boolean {
    return config.saveCurrentSongToFile === true;
}

/** Keeps a field's validation message hidden while its feature toggle is off. */
export function enabledFieldError(
    enabled: boolean,
    error: string | null | undefined
): string | undefined {
    return enabled ? error || undefined : undefined;
}

/** Both chat listeners already fall back to this title when none is saved. */
export function rewardTitleOrDefault(value: unknown): string {
    return typeof value === "string" && value.trim().length > 0
        ? value
        : "Song Request";
}
