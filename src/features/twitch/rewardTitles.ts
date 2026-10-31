import {
    mapRewardOptions,
    rewardFailureReason,
    rewardTitlesFromOptions,
    unavailableRewardTitles,
    type RewardFetch,
    type RewardTitlesResult,
} from "@/shared/rewards/rewardTitles";

export const TWITCH_CUSTOM_REWARDS_URL =
    "https://api.twitch.tv/helix/channels/custom_rewards";

export interface TwitchRewardRequest {
    broadcasterId: string;
    clientId: string;
    accessToken: string;
    fetchImpl: RewardFetch;
}

/**
 * Reads the broadcaster's custom rewards with the existing
 * `channel:read:redemptions` user token. Read-only: no create, update or
 * delete calls are made, and only reward IDs/titles leave this function.
 */
export async function fetchTwitchRewardTitles(
    input: TwitchRewardRequest
): Promise<RewardTitlesResult> {
    try {
        const url =
            `${TWITCH_CUSTOM_REWARDS_URL}?broadcaster_id=` +
            `${encodeURIComponent(input.broadcasterId)}&first=50`;
        const response = await input.fetchImpl(url, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${input.accessToken}`,
                "Client-Id": input.clientId,
            },
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
            return unavailableRewardTitles(
                rewardFailureReason(response.status)
            );
        }
        const rewards = mapRewardOptions(await response.json());
        return {
            status: "ok",
            rewards,
            titles: rewardTitlesFromOptions(rewards),
        };
    } catch {
        return unavailableRewardTitles("provider-error");
    }
}
