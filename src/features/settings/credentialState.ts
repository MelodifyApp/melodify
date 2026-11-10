import type { CredentialFailureCode } from "../../shared/utils/credentialFailure";

/** The credential state rendered by the API Keys section. */
export type CredentialStatus =
    | "needs-credentials"
    | "unverified"
    | "verifying"
    | "verified"
    | "verification-failed"
    | "verification-unavailable";

export interface CredentialFieldState {
    clientId: string;
    secretDraft: string;
    stored: boolean;
    storedClientId?: string;
}

export interface VerificationLike {
    success: boolean;
    code?: CredentialFailureCode | string;
}

/** Derive the state from the current fields without assuming verification. */
export function deriveCredentialStatus({
    clientId,
    secretDraft,
    stored,
    storedClientId,
}: CredentialFieldState): CredentialStatus {
    if (!clientId.trim()) return "needs-credentials";
    if (secretDraft.trim()) return "unverified";
    if (stored && clientId.trim() === (storedClientId ?? "").trim()) {
        return "unverified";
    }
    return "needs-credentials";
}

/** Map a provider result to a state. Only an explicit success is Verified. */
export function statusAfterVerification(
    result: VerificationLike
): CredentialStatus {
    if (result.success) return "verified";
    switch (result.code) {
        case "missing_credentials":
            return "needs-credentials";
        case "invalid_credentials":
            return "verification-failed";
        default:
            return "verification-unavailable";
    }
}
