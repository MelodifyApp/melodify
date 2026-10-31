/**
 * Shared, provider-agnostic reward read model.
 *
 * Both providers return `{ data: [{ id, title }] }`. IDs are retained for
 * stable redemption matching while titles remain for display and legacy
 * compatibility. Mapping, matching and failure reasons stay in one place.
 * Callers own credentials and network access; this module never imports
 * Electron, config or a provider client.
 */

export type RewardUnavailableReason =
    | "not-configured"
    | "not-connected"
    | "missing-scope"
    | "provider-error";

export interface RewardOption {
    id: string;
    title: string;
}

export type RewardTitlesResult =
    | { status: "ok"; rewards: RewardOption[]; titles: string[] }
    | { status: "unavailable"; reason: RewardUnavailableReason };

export type RewardSelectionResolution =
    | {
          status: "selected";
          source: "id" | "title";
          option: RewardOption;
      }
    | {
          status: "reselect";
          reason: "duplicate-title" | "missing-title" | "missing-id";
      };

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

function readProviderId(value: unknown): string | null {
    if (typeof value === "string" || typeof value === "number") {
        const id = String(value).trim();
        return id || null;
    }
    return null;
}

/** Normalizes provider reward records without dropping duplicate titles. */
export function normalizeRewardOptions(value: unknown): RewardOption[] {
    if (!Array.isArray(value)) return [];
    const seenIds = new Set<string>();
    const options: RewardOption[] = [];
    for (const item of value) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const record = item as Record<string, unknown>;
        const id = readProviderId(record.id);
        const rawTitle = record.title;
        if (!id || typeof rawTitle !== "string") continue;
        const title = rawTitle.trim();
        if (!title || seenIds.has(id)) continue;
        seenIds.add(id);
        options.push({ id, title });
    }
    return options.sort(
        (left, right) =>
            left.title.localeCompare(right.title) ||
            left.id.localeCompare(right.id)
    );
}

export function rewardTitlesFromOptions(
    rewards: readonly RewardOption[]
): string[] {
    const seen = new Set<string>();
    const titles: string[] = [];
    for (const reward of rewards) {
        if (seen.has(reward.title)) continue;
        seen.add(reward.title);
        titles.push(reward.title);
    }
    return titles.sort((left, right) => left.localeCompare(right));
}

/** Keeps the read payload's IDs and titles, including duplicate titles. */
export function mapRewardOptions(payload: unknown): RewardOption[] {
    const data =
        payload && typeof payload === "object"
            ? (payload as { data?: unknown }).data
            : undefined;
    return normalizeRewardOptions(data);
}

/** Backwards-compatible unique title projection for callers that only need it. */
export function mapRewardTitles(payload: unknown): string[] {
    return rewardTitlesFromOptions(mapRewardOptions(payload));
}

/**
 * Resolves a saved selection against a current provider catalog. An ID always
 * wins over a display title. Legacy title-only selections resolve only when
 * exactly one current reward has that title; duplicates and missing titles
 * require explicit reselection.
 */
export function resolveRewardSelection(
    rewardId: unknown,
    rewardTitle: unknown,
    rewards: readonly RewardOption[]
): RewardSelectionResolution {
    const configuredId = typeof rewardId === "string" ? rewardId.trim() : "";
    if (configuredId) {
        const byId = rewards.find((reward) => reward.id === configuredId);
        return byId
            ? { status: "selected", source: "id", option: byId }
            : { status: "reselect", reason: "missing-id" };
    }

    const configuredTitle =
        typeof rewardTitle === "string" ? rewardTitle.trim() : "";
    if (!configuredTitle) {
        return { status: "reselect", reason: "missing-title" };
    }
    const byTitle = rewards.filter(
        (reward) => reward.title === configuredTitle
    );
    if (byTitle.length === 0) {
        return { status: "reselect", reason: "missing-title" };
    }
    if (byTitle.length > 1) {
        return { status: "reselect", reason: "duplicate-title" };
    }
    return { status: "selected", source: "title", option: byTitle[0] };
}

/**
 * The listener gate used by Kick and Twitch. A configured provider ID must
 * match the event ID; an ID selection never falls back to a title. Legacy
 * title-only configurations keep the existing exact-title gate.
 */
export function rewardMatchesConfigured(input: {
    configuredId?: unknown;
    configuredTitle?: unknown;
    eventId?: unknown;
    eventTitle?: unknown;
}): boolean {
    const configuredId =
        typeof input.configuredId === "string"
            ? input.configuredId.trim()
            : "";
    if (configuredId) {
        const eventId =
            typeof input.eventId === "string"
                ? input.eventId.trim()
                : typeof input.eventId === "number"
                  ? String(input.eventId)
                  : "";
        return eventId.length > 0 && eventId === configuredId;
    }

    const configuredTitle =
        typeof input.configuredTitle === "string"
            ? input.configuredTitle.trim()
            : "";
    const eventTitle =
        typeof input.eventTitle === "string"
            ? input.eventTitle.trim()
            : "";
    return (
        configuredTitle.length > 0 &&
        eventTitle.length > 0 &&
        eventTitle === configuredTitle
    );
}
