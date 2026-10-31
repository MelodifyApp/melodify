import fetch from "node-fetch";
import Config from "@/core/config";
import { logWarn } from "@/core/logging";
import {
    rewardReadiness,
    unavailableRewardTitles,
    type RewardTitlesResult,
} from "@/shared/rewards/rewardTitles";
import { kickClient } from "@/features/kick/api/client";
import { fetchKickRewardTitles } from "@/features/kick/rewardTitles";

/**
 * Main-process entry point for the Requests reward picker. Stored app
 * credentials are only written after the existing verification gate, and the
 * read is skipped entirely when no verified pair or channel session exists.
 */
export async function listKickRewardTitles(): Promise<RewardTitlesResult> {
    const clientId = String(Config.get("kickClientId") || "").trim();
    const clientSecret = String(Config.get("kickClientSecret") || "").trim();
    const userId = String(Config.get("userId") || "").trim();
    const readiness = rewardReadiness({
        hasClientId: clientId.length > 0,
        hasClientSecret: clientSecret.length > 0,
        hasSession: userId.length > 0 && kickClient.hasTokens(),
    });
    if (readiness !== "ready") return unavailableRewardTitles(readiness);

    const accessToken = await kickClient.getValidAccessToken();
    if (!accessToken) return unavailableRewardTitles("not-connected");

    const result = await fetchKickRewardTitles({ accessToken, fetchImpl: fetch });
    if (result.status === "unavailable") {
        logWarn(`Kick reward list unavailable (${result.reason})`);
    }
    return result;
}
