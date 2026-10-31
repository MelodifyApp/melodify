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

export function canVerifyCredentials(
    status: CredentialStatus,
    { clientId, secretDraft, stored, storedClientId }: CredentialFieldState
): boolean {
    if (status === "verifying" || status === "verified") return false;
    if (!clientId.trim()) return false;
    if (secretDraft.trim()) return true;
    return stored && clientId.trim() === (storedClientId ?? "").trim();
}

/** A save requires a verified state and a newly entered secret to persist. */
export function canSaveCredentials(
    status: CredentialStatus,
    { secretDraft }: { secretDraft: string }
): boolean {
    return status === "verified" && secretDraft.trim().length > 0;
}

const STATUS_MESSAGE_KEYS: Record<CredentialStatus, string> = {
    "needs-credentials": "common.needsCredentials",
    unverified: "common.unverified",
    verifying: "common.verifying",
    verified: "common.verified",
    "verification-failed": "common.verificationFailed",
    "verification-unavailable": "common.verificationUnavailableStatus",
};

export function credentialStatusMessageKey(status: CredentialStatus): string {
    return STATUS_MESSAGE_KEYS[status];
}

export type CredentialChipStatus =
    | "needed"
    | "unverified"
    | "verifying"
    | "verified"
    | "failed"
    | "unavailable";

export function toChipStatus(status: CredentialStatus): CredentialChipStatus {
    switch (status) {
        case "needs-credentials":
            return "needed";
        case "verification-failed":
            return "failed";
        case "verification-unavailable":
            return "unavailable";
        default:
            return status;
    }
}
