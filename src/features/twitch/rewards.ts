import fetch from "node-fetch";
import Config from "@/core/config";
import { logWarn } from "@/core/logging";
import {
    rewardReadiness,
    unavailableRewardTitles,
    type RewardTitlesResult,
} from "@/shared/rewards/rewardTitles";
import { twitchClient } from "@/features/twitch/api/client";
import { fetchTwitchRewardTitles } from "@/features/twitch/rewardTitles";

/**
 * Main-process entry point for the Requests reward picker. Stored app
 * credentials are only written after the existing verification gate, and the
 * read is skipped entirely when no verified pair or broadcaster session
 * exists.
 */
export async function listTwitchRewardTitles(): Promise<RewardTitlesResult> {
    const clientId = String(Config.get("twitchClientId") || "").trim();
    const clientSecret = String(Config.get("twitchClientSecret") || "").trim();
    const broadcasterId = String(Config.get("twitchUserId") || "").trim();
    const readiness = rewardReadiness({
        hasClientId: clientId.length > 0,
        hasClientSecret: clientSecret.length > 0,
        hasSession: broadcasterId.length > 0 && twitchClient.hasTokens(),
    });
    if (readiness !== "ready") return unavailableRewardTitles(readiness);

    const accessToken = await twitchClient.getValidAccessToken();
    if (!accessToken) return unavailableRewardTitles("not-connected");

    const result = await fetchTwitchRewardTitles({
        broadcasterId,
        clientId,
        accessToken,
        fetchImpl: fetch,
    });
    if (result.status === "unavailable") {
        logWarn(`Twitch reward list unavailable (${result.reason})`);
    }
    return result;
}
