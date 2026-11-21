import type { CredentialStatus } from "./credentialState";

export type CredentialCardState =
    | "not-set-up"
    | "checking"
    | "connected"
    | "verification-failed"
    | "verification-unavailable";

export type CredentialCardChipStatus =
    | "needed"
    | "verifying"
    | "verified"
    | "failed"
    | "unavailable";

export type CredentialCardAction =
    | "set-up"
    | "replace"
    | "update"
    | "try-again"
    | null;

export interface CredentialCardView {
    state: CredentialCardState;
    chipStatus: CredentialCardChipStatus;
    labelKey: string;
    action: CredentialCardAction;
}

const CHECKING: CredentialCardView = {
    state: "checking",
    chipStatus: "verifying",
    labelKey: "common.checking",
    action: null,
};

const NOT_SET_UP: CredentialCardView = {
    state: "not-set-up",
    chipStatus: "needed",
    labelKey: "common.notSetUp",
    action: "set-up",
};

const CONNECTED: CredentialCardView = {
    state: "connected",
    chipStatus: "verified",
    // API Keys stores app credentials; the account OAuth connection lives on
    // Home. "Credentials saved" avoids claiming the Spotify account is linked.
    labelKey: "common.credentialsSaved",
    action: "replace",
};

const VERIFICATION_FAILED: CredentialCardView = {
    state: "verification-failed",
    chipStatus: "failed",
    labelKey: "common.couldntVerify",
    action: "update",
};

const VERIFICATION_UNAVAILABLE: CredentialCardView = {
    state: "verification-unavailable",
    chipStatus: "unavailable",
    labelKey: "common.couldntReachProvider",
    action: "try-again",
};

/** Map the store's verification state onto the API Keys card state machine. */
export function credentialCardView(
    status: CredentialStatus | undefined,
    stored: boolean,
    ready = true
): CredentialCardView {
    if (!ready) return { ...CHECKING };
    if (!stored) return { ...NOT_SET_UP };

    switch (status) {
        case "verified":
            return { ...CONNECTED };
        case "verification-failed":
            return { ...VERIFICATION_FAILED };
        case "verification-unavailable":
            return { ...VERIFICATION_UNAVAILABLE };
        case "unverified":
        case "verifying":
        case undefined:
            return { ...CHECKING };
        default:
            return { ...NOT_SET_UP };
    }
}
