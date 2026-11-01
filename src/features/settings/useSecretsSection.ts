import { useState } from "react";
import {
    type SecretDrafts,
    type SecretSaveResult,
    type SecretServiceId,
    type SecretVerificationResult,
    clearSecretDrafts,
    getSecretService,
    updateSecretDraft,
} from "./secretsSave";
import {
    type CredentialStatus,
    canSaveCredentials,
    deriveCredentialStatus,
} from "./credentialState";

export interface SecretsSectionOptions {
    /** Verifies one service without persisting anything. */
    verify: (
        serviceId: SecretServiceId,
        drafts: SecretDrafts
    ) => Promise<SecretVerificationResult>;
    /** Persists one service after the UI has received a verified result. */
    save: (
        serviceId: SecretServiceId,
        drafts: SecretDrafts
    ) => Promise<SecretSaveResult>;
    /** Renderer-side field validation (returns an error message or null). */
    validate: (key: string, value: string) => string | null;
    /** Applies an ordinary (non-secret) client ID edit to the app config. */
    onClientIdChange: (key: string, value: string) => void;
    /** Current shared credential status cache (session-scoped). */
    statuses?: Partial<Record<SecretServiceId, CredentialStatus>>;
    /** Updates the shared cache after an edit, verify or save. */
    onStatusChange: (serviceId: SecretServiceId, status: CredentialStatus) => void;
    /** Restores the stored pair's session baseline after a cancel. */
    onResetStatus: (serviceId: SecretServiceId) => void;
    /** Current draft config values, including client IDs. */
    config: Record<string, unknown>;
    /** Whether 1.0.7 already stored a complete credential pair. */
    storedSecrets: Record<string, boolean>;
    /** The committed client ID used to decide whether a stored secret applies. */
    storedClientIds: Record<string, string>;
    /** Marks credentials as stored after a successful save. */
    onStoredSecretChange: (serviceId: SecretServiceId, stored: boolean) => void;
}

function clientIdFor(
    serviceId: SecretServiceId,
    config: Record<string, unknown>
): string {
    const service = getSecretService(serviceId);
    const value = config[service.clientIdKey];
    return typeof value === "string" ? value : "";
}

function statusForSaveFailure(error: string | undefined): CredentialStatus {
    if (error === "required") return "needs-credentials";
    if (error === "invalid") return "verification-failed";
    return "verification-unavailable";
}

/**
 * Verification generations live outside the section so a late result from a
 * previous mount cannot overwrite an edit made in a fresh one.
 */
const verificationVersions: Record<string, number> = {};

const noopStatusChange = (): void => undefined;
const noopStatusReset = (): void => undefined;

/**
 * State for Settings > API Keys. A field edit invalidates a previous
 * verification immediately. Verification keeps the draft; only a successful
 * Save clears the secret draft and marks the pair as stored.
 */
export function useSecretsSection({
    verify,
    save,
    validate,
    onClientIdChange,
    statuses = {},
    onStatusChange = noopStatusChange,
    onResetStatus = noopStatusReset,
    config,
    storedSecrets,
    storedClientIds,
    onStoredSecretChange,
}: SecretsSectionOptions) {
    const [drafts, setDrafts] = useState<SecretDrafts>({});
    const [validationErrors, setValidationErrors] = useState<
        Record<string, string | null>
    >({});
    const [saving, setSaving] = useState<Record<string, boolean>>({});
    const [saveErrors, setSaveErrors] = useState<Record<string, boolean>>({});

    const bumpVerificationVersion = (serviceId: SecretServiceId) => {
        verificationVersions[serviceId] =
            (verificationVersions[serviceId] ?? 0) + 1;
    };

    const getStatus = (serviceId: SecretServiceId): CredentialStatus => {
        const service = getSecretService(serviceId);
        return (
            statuses[serviceId] ??
            deriveCredentialStatus({
                clientId: clientIdFor(serviceId, config),
                secretDraft: drafts[service.clientSecretKey] ?? "",
                stored: storedSecrets[serviceId] === true,
                storedClientId: storedClientIds[serviceId] ?? "",
            })
        );
    };

    const clearSaveError = (serviceId: SecretServiceId) => {
        setSaveErrors((prev) => {
            if (!prev[serviceId]) return prev;
            const next = { ...prev };
            delete next[serviceId];
            return next;
        });
    };

    const editField = (
        serviceId: SecretServiceId,
        key: string,
        value: string,
        isSecret: boolean
    ) => {
        const service = getSecretService(serviceId);
        clearSaveError(serviceId);
        const nextSecret = isSecret
            ? value
            : drafts[service.clientSecretKey] ?? "";
        const nextClientId = isSecret
            ? clientIdFor(serviceId, config)
            : value;

        setValidationErrors((prev) => ({ ...prev, [key]: validate(key, value) }));
        bumpVerificationVersion(serviceId);
        onStatusChange(
            serviceId,
            deriveCredentialStatus({
                clientId: nextClientId,
                secretDraft: nextSecret,
                stored: storedSecrets[serviceId] === true,
                storedClientId: storedClientIds[serviceId] ?? "",
            })
        );

        if (isSecret) {
            setDrafts((prev) => updateSecretDraft(prev, key, value));
            return;
        }

        onClientIdChange(key, value);
    };

    const verifyService = async (serviceId: SecretServiceId) => {
        const version = verificationVersions[serviceId] ?? 0;
        clearSaveError(serviceId);
        onStatusChange(serviceId, "verifying");
        const result = await verify(serviceId, drafts);
        if ((verificationVersions[serviceId] ?? 0) !== version) {
            return;
        }
        onStatusChange(
            serviceId,
            result.ok ? "verified" : statusForSaveFailure(result.error)
        );
    };

    const saveService = async (serviceId: SecretServiceId) => {
        const service = getSecretService(serviceId);
        if (
            !canSaveCredentials(getStatus(serviceId), {
                secretDraft: drafts[service.clientSecretKey] ?? "",
            })
        ) {
            return;
        }

        clearSaveError(serviceId);
        setSaving((prev) => ({ ...prev, [serviceId]: true }));
        const result = await save(serviceId, drafts);
        setSaving((prev) => ({ ...prev, [serviceId]: false }));
        setDrafts(result.drafts);

        if (result.ok) {
            onStatusChange(serviceId, "verified");
            onStoredSecretChange(serviceId, true);
        } else if (result.error === "persistence") {
            // Provider verification remains valid; only the durable write
            // failed. Keep the draft and the Save action available for retry.
            setSaveErrors((prev) => ({ ...prev, [serviceId]: true }));
            onStatusChange(serviceId, "verified");
        } else {
            onStatusChange(serviceId, statusForSaveFailure(result.error));
        }
    };

    const cancelService = (serviceId: SecretServiceId) => {
        const service = getSecretService(serviceId);
        bumpVerificationVersion(serviceId);
        clearSaveError(serviceId);
        setDrafts((prev) => clearSecretDrafts(prev, serviceId));
        onResetStatus(serviceId);
        setValidationErrors((prev) => {
            const next = { ...prev };
            delete next[service.clientIdKey];
            delete next[service.clientSecretKey];
            return next;
        });
    };

    return {
        drafts,
        getStatus,
        validationErrors,
        saving,
        saveErrors,
        editField,
        verifyService,
        saveService,
        cancelService,
    };
}
