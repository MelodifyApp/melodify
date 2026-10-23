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
