import type { CredentialFailureCode } from "../../shared/utils/credentialFailure";
import {
    KICK_REDIRECT_URI,
    SPOTIFY_REDIRECT_URI,
    TWITCH_REDIRECT_URI,
} from "../../shared/constants";

/**
 * Save and verification flow for the Settings > API Keys section.
 *
 * Credential secrets must never travel through the generic `config:set` path,
 * so the section keeps them in component-local drafts. Verification and save
 * are both request/response IPC calls: verification never persists, and save
 * asks the main process to verify again before writing the credentials.
 */

export type SecretServiceId = "spotify" | "kick" | "twitch";

export interface SecretServiceDefinition {
    readonly id: SecretServiceId;
    /** Display name used in accessible labels. */
    readonly label: string;
    /** IPC channel that verifies credentials without persisting. */
    readonly verifyChannel: string;
    /** IPC channel that verifies and persists credentials. */
    readonly channel: string;
    /** Both operations are awaited request/response calls. */
    readonly transport: "invoke";
    readonly clientIdKey: string;
    readonly clientSecretKey: string;
}

export const SECRET_SERVICES: readonly SecretServiceDefinition[] = Object.freeze([
    Object.freeze({
        id: "spotify" as const,
        label: "Spotify API",
        verifyChannel: "spotify:verifySecrets",
        channel: "spotify:setSecrets",
        transport: "invoke" as const,
        clientIdKey: "spotifyClientId",
        clientSecretKey: "spotifyClientSecret",
    }),
    Object.freeze({
        id: "kick" as const,
        label: "Kick API",
        verifyChannel: "kick:verifySecrets",
        channel: "kick:setSecrets",
        transport: "invoke" as const,
        clientIdKey: "kickClientId",
        clientSecretKey: "kickClientSecret",
    }),
    Object.freeze({
        id: "twitch" as const,
        label: "Twitch API",
        verifyChannel: "twitch:verifySecrets",
        channel: "twitch:setSecrets",
        transport: "invoke" as const,
        clientIdKey: "twitchClientId",
        clientSecretKey: "twitchClientSecret",
    }),
]);

export function getSecretService(
    id: SecretServiceId
): SecretServiceDefinition {
    const service = SECRET_SERVICES.find((candidate) => candidate.id === id);
    if (!service) {
        throw new Error(`Unknown secret service: ${String(id)}`);
    }
    return service;
}

const SETUP_DASHBOARD_URLS: Record<SecretServiceId, string> = {
    spotify: "https://developer.spotify.com/dashboard",
    kick: "https://kick.com/settings/developer",
    twitch: "https://dev.twitch.tv/console",
};

export interface SetupGuideDetails {
    dashboardUrl: string;
    redirectUri: string;
}

/**
 * Resolves the read-only setup values shown for a service. Twitch OAuth always
 * uses the shared constant, regardless of any legacy renderer config value.
 */
export function getSetupGuide(
    id: SecretServiceId,
    config: Record<string, unknown> = {}
): SetupGuideDetails {
    let redirectUri: string;
    if (id === "twitch") {
        redirectUri = TWITCH_REDIRECT_URI;
    } else {
        const key = id === "kick" ? "kickRedirectUri" : "spotifyRedirectUri";
        const configured = config[key];
        redirectUri =
            typeof configured === "string" && configured.length > 0
                ? configured
                : id === "kick"
                  ? KICK_REDIRECT_URI
                  : SPOTIFY_REDIRECT_URI;
    }
    return {
        dashboardUrl: SETUP_DASHBOARD_URLS[id],
        redirectUri,
    };
}

/** Draft secret values keyed by their config key. */
export type SecretDrafts = Readonly<Record<string, string>>;

/** Returns a new draft map with one field updated (never mutates the input). */
export function updateSecretDraft(
    drafts: SecretDrafts,
    key: string,
    value: string
): SecretDrafts {
    return { ...drafts, [key]: value };
}

/** Returns a new draft map without the given service's secret. */
export function clearSecretDrafts(
    drafts: SecretDrafts,
    id: SecretServiceId
): SecretDrafts {
    const service = getSecretService(id);
    const next: Record<string, string> = { ...drafts };
    delete next[service.clientSecretKey];
    return next;
}

export interface SecretsBridge {
    invoke(channel: string, data?: unknown): Promise<unknown>;
}

export type SecretSaveErrorCode =
    | "required"
    | "invalid"
    | "unavailable"
    | "persistence"
    | "failed";

export interface SecretSaveResult {
    readonly ok: boolean;
    readonly error?: SecretSaveErrorCode;
    /** Drafts after the attempt: cleared on success, retained on failure. */
    readonly drafts: SecretDrafts;
}

export type SecretVerificationResult = SecretSaveResult;

function readTrimmedString(
    source: Record<string, unknown>,
    key: string
): string {
    const value = source[key];
    return typeof value === "string" ? value.trim() : "";
}

function invokeSucceeded(result: unknown): boolean {
    return (
        !!result &&
        typeof result === "object" &&
        (result as { success?: unknown }).success === true
    );
}

/**
 * Maps a handler's stable failure code to a save-flow status. Unknown or
 * missing codes fall back to the generic failure so no raw text is shown.
 */
function failureStatusFor(result: unknown): SecretSaveErrorCode {
    const code =
        result && typeof result === "object"
            ? (result as { code?: unknown }).code
            : undefined;
    switch (code as CredentialFailureCode | undefined) {
        case "invalid_credentials":
            return "invalid";
        case "verification_unavailable":
            return "unavailable";
        case "missing_credentials":
            return "required";
        case "persistence_failed":
            return "persistence";
        default:
            return "failed";
    }
}

function credentialPayload(
    service: SecretServiceDefinition,
    config: Record<string, unknown>,
    drafts: SecretDrafts,
    includeEmptySecret = false
): Record<string, string> {
    const payload: Record<string, string> = {
        [service.clientIdKey]: readTrimmedString(config, service.clientIdKey),
    };
    const secret = readTrimmedString(drafts, service.clientSecretKey);
    if (secret || includeEmptySecret) {
        payload[service.clientSecretKey] = secret;
    }
    return payload;
}

/**
 * Verifies credentials without persisting them. A stored secret may be used by
 * the main process when the submitted client ID still matches the stored one.
 */
export async function verifyServiceSecrets(
    id: SecretServiceId,
    config: Record<string, unknown>,
    drafts: SecretDrafts,
    bridge: SecretsBridge
): Promise<SecretVerificationResult> {
    const service = getSecretService(id);
    const payload = credentialPayload(service, config, drafts, true);
    if (!payload[service.clientIdKey]) {
        return { ok: false, error: "required", drafts };
    }

    try {
        const result = await bridge.invoke(service.verifyChannel, payload);
        if (!invokeSucceeded(result)) {
            return {
                ok: false,
                error: failureStatusFor(result),
                drafts,
            };
        }
        return { ok: true, drafts };
    } catch {
        return { ok: false, error: "unavailable", drafts };
    }
}

/**
 * Persists one service's credentials after the main process verifies them
 * again. Save is gated in the UI; failed saves retain the draft for retry.
 */
export async function saveServiceSecrets(
    id: SecretServiceId,
    config: Record<string, unknown>,
    drafts: SecretDrafts,
    bridge: SecretsBridge
): Promise<SecretSaveResult> {
    const service = getSecretService(id);
    const clientId = readTrimmedString(config, service.clientIdKey);
    const clientSecret = readTrimmedString(drafts, service.clientSecretKey);

    if (!clientId || !clientSecret) {
        return { ok: false, error: "required", drafts };
    }

    const payload = credentialPayload(service, config, drafts);

    try {
        const result = await bridge.invoke(service.channel, payload);
        if (!invokeSucceeded(result)) {
            return {
                ok: false,
                error: failureStatusFor(result),
                drafts,
            };
        }
        return { ok: true, drafts: clearSecretDrafts(drafts, id) };
    } catch {
        // The bridge or the network failed before verification could happen.
        return { ok: false, error: "unavailable", drafts };
    }
}
