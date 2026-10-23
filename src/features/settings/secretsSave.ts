import type { CredentialFailureCode } from "../../shared/utils/credentialFailure";

/**
 * Save flow for the Settings > Secrets section.
 *
 * Credential secrets must never travel through the generic `config:set` path,
 * so the section keeps them in component-local drafts and only submits them
 * when the user presses the per-service Save button. Each service has its own
 * typed bridge direction: Spotify validates credentials through an
 * `ipcMain.handle` channel (invoke) while Kick stores them through an
 * `ipcMain.on` channel (send).
 */

export type SecretServiceId = "spotify" | "kick";

export interface SecretServiceDefinition {
    readonly id: SecretServiceId;
    /** Display name used in accessible labels. */
    readonly label: string;
    /** IPC channel that stores the credentials. */
    readonly channel: string;
    /** Bridge method the channel is registered with. */
    readonly transport: "invoke" | "send";
    readonly clientIdKey: string;
    readonly clientSecretKey: string;
}

export const SECRET_SERVICES: readonly SecretServiceDefinition[] = Object.freeze([
    Object.freeze({
        id: "spotify" as const,
        label: "Spotify API",
        channel: "spotify:setSecrets",
        transport: "invoke" as const,
        clientIdKey: "spotifyClientId",
        clientSecretKey: "spotifyClientSecret",
    }),
    Object.freeze({
        id: "kick" as const,
        label: "Kick API",
        channel: "kick:setSecrets",
        transport: "send" as const,
        clientIdKey: "kickClientId",
        clientSecretKey: "kickClientSecret",
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
    send(channel: string, data?: unknown): unknown;
    invoke(channel: string, data?: unknown): Promise<unknown>;
}

export type SecretSaveErrorCode =
    | "required"
    | "invalid"
    | "unavailable"
    | "failed";

export interface SecretSaveResult {
    readonly ok: boolean;
    readonly error?: SecretSaveErrorCode;
    /** Drafts after the attempt: cleared on success, retained on failure. */
    readonly drafts: SecretDrafts;
}

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
 * Maps a handler's stable failure code to the save-flow status. Unknown or
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
        default:
            return "failed";
    }
}

/**
 * Submits one service's credentials through its typed bridge direction.
 * Missing credentials are rejected before any IPC call; failed saves keep the
 * draft so the user can retry.
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

    const payload = {
        [service.clientIdKey]: clientId,
        [service.clientSecretKey]: clientSecret,
    };

    try {
        if (service.transport === "invoke") {
            const result = await bridge.invoke(service.channel, payload);
            if (!invokeSucceeded(result)) {
                return {
                    ok: false,
                    error: failureStatusFor(result),
                    drafts,
                };
            }
        } else {
            bridge.send(service.channel, payload);
        }
        return { ok: true, drafts: clearSecretDrafts(drafts, id) };
    } catch {
        // The bridge or the network failed before verification could happen.
        return { ok: false, error: "unavailable", drafts };
    }
}

export type SecretSaveStatus =
    | "idle"
    | "saving"
    | "saved"
    | SecretSaveErrorCode;

/** Translation key for a save status, or null when nothing should be shown. */
export function secretStatusMessageKey(status: SecretSaveStatus): string | null {
    switch (status) {
        case "saving":
            return "common.saving";
        case "saved":
            return "common.saved";
        case "required":
            return "common.secretsRequired";
        case "invalid":
            return "common.invalidCredentials";
        case "unavailable":
            return "common.verificationUnavailable";
        case "failed":
            return "common.secretsSaveError";
        default:
            return null;
    }
}
