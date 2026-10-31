/**
 * Shared, provider-agnostic reward-title read model.
 *
 * Reward APIs are read-only here: both providers return the same `{ data:
 * [{ title }] }` shape, so mapping and failure reasons stay in one place.
 * Callers own credentials and network access; this module never imports
 * Electron, config or a provider client.
 */

export type RewardUnavailableReason =
    | "not-configured"
    | "not-connected"
    | "missing-scope"
    | "provider-error";

export type RewardTitlesResult =
    | { status: "ok"; titles: string[] }
    | { status: "unavailable"; reason: RewardUnavailableReason };

export interface RewardReadinessInput {
    hasClientId: boolean;
    hasClientSecret: boolean;
    hasSession: boolean;
}

export interface RewardFetchResponse {
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
}

export type RewardFetch = (
    url: string,
    init: {
        method: string;
        headers: Record<string, string>;
        signal?: AbortSignal;
    }
) => Promise<RewardFetchResponse>;

/**
 * Decides whether a provider read may run. Missing credentials or a signed-out
 * session must never reach the network.
 */
export function rewardReadiness(
    input: RewardReadinessInput
): "ready" | RewardUnavailableReason {
    if (!input.hasClientId || !input.hasClientSecret) return "not-configured";
    if (!input.hasSession) return "not-connected";
    return "ready";
}

export function unavailableRewardTitles(
    reason: RewardUnavailableReason
): RewardTitlesResult {
    return { status: "unavailable", reason };
}

/** Provider HTTP failures become stable, non-provider-specific reasons. */
export function rewardFailureReason(status: number): RewardUnavailableReason {
    return status === 401 || status === 403 ? "missing-scope" : "provider-error";
}

/**
 * Keeps only non-empty reward titles, de-duplicates them and returns a stable
 * alphabetical list. IDs, costs, prompts and every other provider field stay
 * in the main process.
 */
export function mapRewardTitles(payload: unknown): string[] {
    const data =
        payload && typeof payload === "object"
            ? (payload as { data?: unknown }).data
            : undefined;
    if (!Array.isArray(data)) return [];

    const seen = new Set<string>();
    const titles: string[] = [];
    for (const item of data) {
        if (!item || typeof item !== "object") continue;
        const raw = (item as { title?: unknown }).title;
        if (typeof raw !== "string") continue;
        const title = raw.trim();
        if (!title || seen.has(title)) continue;
        seen.add(title);
        titles.push(title);
    }
    return titles.sort((left, right) => left.localeCompare(right));
}
