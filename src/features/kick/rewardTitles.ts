import {
    mapRewardTitles,
    rewardFailureReason,
    unavailableRewardTitles,
    type RewardFetch,
    type RewardTitlesResult,
} from "@/shared/rewards/rewardTitles";

export const KICK_REWARDS_URL =
    "https://api.kick.com/public/v1/channels/rewards";

export interface KickRewardRequest {
    accessToken: string;
    fetchImpl: RewardFetch;
}

/**
 * Reads the broadcaster's channel rewards with the official Kick API
 * (`channel:rewards:read`). Read-only: no create, update or delete calls are
 * made, and only titles leave this function.
 */
export async function fetchKickRewardTitles(
    input: KickRewardRequest
): Promise<RewardTitlesResult> {
    try {
        const response = await input.fetchImpl(KICK_REWARDS_URL, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${input.accessToken}`,
            },
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
            return unavailableRewardTitles(
                rewardFailureReason(response.status)
            );
        }
        return { status: "ok", titles: mapRewardTitles(await response.json()) };
    } catch {
        return unavailableRewardTitles("provider-error");
    }
}
