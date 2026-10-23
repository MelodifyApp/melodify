/**
 * Stable, machine-readable failure codes for credential verification.
 *
 * Handlers return these codes instead of free-form service text so the
 * renderer can show translated copy and no raw endpoint message, token or
 * user-supplied value ever crosses the bridge.
 */
export type CredentialFailureCode =
    | "missing_credentials"
    | "invalid_credentials"
    | "verification_unavailable";

/** Translation key for a credential failure code, or null when unknown. */
export function credentialFailureMessageKey(code: unknown): string | null {
    switch (code) {
        case "missing_credentials":
            return "common.secretsRequired";
        case "invalid_credentials":
            return "common.invalidCredentials";
        case "verification_unavailable":
            return "common.verificationUnavailable";
        default:
            return null;
    }
}
