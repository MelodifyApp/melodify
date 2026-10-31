export type TimeAgoUnit = "now" | "minutes" | "hours" | "days";

export interface TimeAgoParts {
    unit: TimeAgoUnit;
    count: number;
}

/**
 * Pure relative-time calculation. The component owns localized labels so the
 * same elapsed value renders correctly in every language.
 */
export function timeAgoParts(
    date: Date,
    now: Date = new Date()
): TimeAgoParts | null {
    const milliseconds = now.getTime() - date.getTime();
    if (!Number.isFinite(milliseconds)) return null;
    if (milliseconds < 60_000) return { unit: "now", count: 0 };

    const minutes = Math.floor(milliseconds / 60_000);
    if (minutes < 60) return { unit: "minutes", count: minutes };

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return { unit: "hours", count: hours };

    return { unit: "days", count: Math.floor(hours / 24) };
}
