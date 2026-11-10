import type { SecretSaveErrorCode } from "./secretsSave";

/** Stable user-facing copy for the setup dialog's connect result. */
export function connectErrorMessageKey(
    error?: SecretSaveErrorCode
): string {
    switch (error) {
        case "required":
            return "common.pleaseCompleteFields";
        case "invalid":
            return "common.invalidCredentials";
        case "unavailable":
            return "common.verificationUnavailable";
        case "persistence":
            return "common.secretsPersistenceError";
        default:
            return "common.secretsSaveError";
    }
}
