import type { RewardUnavailableReason } from "@/shared/rewards/rewardTitles";

export type RewardPlatform = "kick" | "twitch";

/** The config key each platform's picker may update. */
export const REWARD_CONFIG_KEYS: Record<RewardPlatform, string> = {
    kick: "rewardTitle",
    twitch: "twitchRewardTitle",
};

export type RewardPickerState =
    | { status: "loading"; titles: string[] }
    | { status: "ready"; titles: string[] }
    | { status: "empty"; titles: string[] }
    | {
          status: "unavailable";
          titles: string[];
          reason: RewardUnavailableReason;
      };

const REASONS: readonly RewardUnavailableReason[] = [
    "not-configured",
    "not-connected",
    "missing-scope",
    "provider-error",
];

/**
 * Normalizes an IPC payload from the main process. A malformed or missing
 * payload is treated as an unavailable read, never as demo reward data.
 */
export function toRewardPickerState(result: unknown): RewardPickerState {
    if (!result || typeof result !== "object") {
        return { status: "unavailable", titles: [], reason: "provider-error" };
    }

    const candidate = result as {
        status?: unknown;
        titles?: unknown;
        reason?: unknown;
    };
    if (candidate.status === "unavailable") {
        const reason = REASONS.includes(
            candidate.reason as RewardUnavailableReason
        )
            ? (candidate.reason as RewardUnavailableReason)
            : "provider-error";
        return { status: "unavailable", titles: [], reason };
    }
    if (candidate.status !== "ok" || !Array.isArray(candidate.titles)) {
        return { status: "unavailable", titles: [], reason: "provider-error" };
    }

    const titles = [
        ...new Set(
            candidate.titles
                .filter((title): title is string => typeof title === "string")
                .map((title) => title.trim())
                .filter(Boolean)
        ),
    ];
    return titles.length
        ? { status: "ready", titles }
        : { status: "empty", titles: [] };
}

/**
 * The picker reflects the draft title only when it names an existing reward.
 * Manual edits therefore reset the matching picker without clearing the title.
 */
export function rewardPickerValue(
    title: unknown,
    titles: readonly string[]
): string {
    if (typeof title !== "string") return "";
    const trimmed = title.trim();
    return trimmed && titles.includes(trimmed) ? trimmed : "";
}
