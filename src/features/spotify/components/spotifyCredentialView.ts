import { credentialFailureMessageKey } from "../../../shared/utils/credentialFailure";

/**
 * Maps a spotify:setSecrets result to a translated message key.
 *
 * Only the stable failure code is considered; raw `error`/`message` fields from
 * older responses or the service are ignored so no untranslated text leaks to
 * the UI. Returns null when the caller should use its generic fallback.
 */
export function spotifyCredentialMessageKey(
    result: { code?: unknown } | null | undefined
): string | null {
    return credentialFailureMessageKey(result?.code);
}

export type CredentialSubmitOutcome =
    | { ok: true }
    | { ok: false; messageKey: string };

/**
 * Resolves a spotify:setSecrets result into either success or a translated
 * message key. Unknown or malformed payloads fall back to the generic copy.
 */
export function resolveCredentialSubmitOutcome(
    result: unknown
): CredentialSubmitOutcome {
    if (
        result &&
        typeof result === "object" &&
        (result as { success?: unknown }).success === true
    ) {
        return { ok: true };
    }
    const messageKey = spotifyCredentialMessageKey(
        result && typeof result === "object"
            ? (result as { code?: unknown })
            : null
    );
    return { ok: false, messageKey: messageKey ?? "common.secretsSaveError" };
}

/**
 * Submits Spotify credentials through the injected bridge and never rejects:
 * a rejected invoke (IPC/network failure) becomes the connectivity
 * (`common.verificationUnavailable`) message instead of an unhandled
 * rejection, while unknown/malformed responses keep the generic fallback.
 */
export async function submitSpotifyCredentials(
    invoke: (channel: string, payload: unknown) => Promise<unknown>,
    payload: { spotifyClientId: string; spotifyClientSecret: string }
): Promise<CredentialSubmitOutcome> {
    try {
        const result = await invoke("spotify:setSecrets", payload);
        return resolveCredentialSubmitOutcome(result);
    } catch {
        // IPC or network failure: verification could not happen, so point the
        // user at connectivity instead of the generic save failure.
        return { ok: false, messageKey: "common.verificationUnavailable" };
    }
}
