/**
 * Auto-save timing policy for the Settings shell.
 *
 * Text fields get a short debounce so a save does not fire on every keystroke.
 * Toggles, selectors and list edits save immediately. The song-file path is
 * persisted by the main process through its own dialog action.
 */
export const AUTO_SAVE_DELAY_MS = 450;

const IMMEDIATE_KEYS = new Set([
    "language",
    "defaultsLanguage",
    "commands",
    "customModerators",
    "rewardId",
    "twitchRewardId",
]);

export function autoSaveDelayForKey(key: string, value: unknown): number {
    if (key === "currentSongFilePath") return -1;
    if (IMMEDIATE_KEYS.has(key)) return 0;
    if (typeof value === "boolean" || Array.isArray(value)) return 0;
    return AUTO_SAVE_DELAY_MS;
}
