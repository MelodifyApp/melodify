/** Pure presentation rules shared by the Requests section and its tests. */

export function showSongFileControls(config: Record<string, unknown>): boolean {
    return config.saveCurrentSongToFile === true;
}

/** Both chat listeners already fall back to this title when none is saved. */
export function rewardTitleOrDefault(value: unknown): string {
    return typeof value === "string" && value.trim().length > 0
        ? value
        : "Song Request";
}
