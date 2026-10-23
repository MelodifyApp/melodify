import { useState } from "react";
import {
    type SecretDrafts,
    type SecretSaveResult,
    type SecretSaveStatus,
    type SecretServiceId,
    updateSecretDraft,
} from "./secretsSave";

export interface SecretsSectionOptions {
    /** Performs the save for one service with the current drafts. */
    save: (
        serviceId: SecretServiceId,
        drafts: SecretDrafts
    ) => Promise<SecretSaveResult>;
    /** Renderer-side field validation (returns an error message or null). */
    validate: (key: string, value: string) => string | null;
    /** Applies an ordinary (non-secret) field edit to the app config. */
    onClientIdChange: (key: string, value: string) => void;
}

/**
 * State for the Settings > Secrets section: secret drafts, per-service save
 * status and field validation errors. Any edit for a service (client ID or
 * secret) clears that service's stale save status, failed saves keep the
 * drafts, and a successful save clears them.
 */
export function useSecretsSection({
    save,
    validate,
    onClientIdChange,
}: SecretsSectionOptions) {
    const [drafts, setDrafts] = useState<SecretDrafts>({});
    const [statuses, setStatuses] = useState<Record<string, SecretSaveStatus>>(
        {}
    );
    const [validationErrors, setValidationErrors] = useState<
        Record<string, string | null>
    >({});

    const editField = (
        serviceId: SecretServiceId,
        key: string,
        value: string,
        isSecret: boolean
    ) => {
        setValidationErrors((prev) => ({ ...prev, [key]: validate(key, value) }));
        setStatuses((prev) => ({ ...prev, [serviceId]: "idle" }));

        if (isSecret) {
            setDrafts((prev) => updateSecretDraft(prev, key, value));
            return;
        }

        onClientIdChange(key, value);
    };

    const saveService = async (serviceId: SecretServiceId) => {
        setStatuses((prev) => ({ ...prev, [serviceId]: "saving" }));

        const result = await save(serviceId, drafts);

        setDrafts(result.drafts);
        setStatuses((prev) => ({
            ...prev,
            [serviceId]: result.ok ? "saved" : (result.error ?? "failed"),
        }));
    };

    return { drafts, statuses, validationErrors, editField, saveService };
}
