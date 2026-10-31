import {
    normalizeRewardOptions,
    rewardTitlesFromOptions,
    type RewardOption,
    type RewardUnavailableReason,
} from "@/shared/rewards/rewardTitles";

export type RewardPlatform = "kick" | "twitch";

/** The title config key each platform's picker may update. */
export const REWARD_CONFIG_KEYS: Record<RewardPlatform, string> = {
    kick: "rewardTitle",
    twitch: "twitchRewardTitle",
};

/** The stable provider ID config key stored alongside each title. */
export const REWARD_ID_CONFIG_KEYS: Record<RewardPlatform, string> = {
    kick: "rewardId",
    twitch: "twitchRewardId",
};

export type RewardPickerState =
    | { status: "loading"; rewards: RewardOption[]; titles: string[] }
    | { status: "ready"; rewards: RewardOption[]; titles: string[] }
    | { status: "empty"; rewards: RewardOption[]; titles: string[] }
    | {
          status: "unavailable";
          rewards: RewardOption[];
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
        return {
            status: "unavailable",
            rewards: [],
            titles: [],
            reason: "provider-error",
        };
    }

    const candidate = result as {
        status?: unknown;
        rewards?: unknown;
        reason?: unknown;
    };
    if (candidate.status === "unavailable") {
        const reason = REASONS.includes(
            candidate.reason as RewardUnavailableReason
        )
            ? (candidate.reason as RewardUnavailableReason)
            : "provider-error";
        return {
            status: "unavailable",
            rewards: [],
            titles: [],
            reason,
        };
    }
    if (candidate.status !== "ok" || !Array.isArray(candidate.rewards)) {
        return {
            status: "unavailable",
            rewards: [],
            titles: [],
            reason: "provider-error",
        };
    }

    const rewards = normalizeRewardOptions(candidate.rewards);
    const titles = rewardTitlesFromOptions(rewards);
    return rewards.length
        ? { status: "ready", rewards, titles }
        : { status: "empty", rewards: [], titles: [] };
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
