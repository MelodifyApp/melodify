import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button, IconButton, Input, ServiceCard } from "@/ui/components/studio";
import ExternalLink from "@/ui/components/ExternalLink";
import { validateField } from "../validation";
import { useSecretsSection } from "../../useSecretsSection";
import {
    SECRET_SERVICES,
    getSetupGuide,
    type SecretServiceId,
    saveServiceSecrets,
    verifyServiceSecrets,
} from "../../secretsSave";
import {
    canSaveCredentials,
    canVerifyCredentials,
    credentialStatusMessageKey,
    toChipStatus,
    type CredentialStatus,
} from "../../credentialState";

import {
    markCredentialSaved,
    resetCredentialStatus,
    setCredentialStatus,
    useCredentialStatuses,
} from "../../credentialStatusStore";

interface SecretsProps {
    config: any;
    baselineConfig?: any;
    onConfigChange: (key: string, value: any) => void;
    onDraftStateChange?: (pending: boolean) => void;
    onServiceSaved?: (serviceId: SecretServiceId) => void;
    active?: boolean;
}

interface SecretFieldDefinition {
    key: string;
    labelKey: string;
    placeholderKey: string;
    isSecret: boolean;
}

const secretFields: Record<SecretServiceId, SecretFieldDefinition[]> = {
    spotify: [
        {
            key: "spotifyClientId",
            labelKey: "setup.clientId",
            placeholderKey: "setup.enterSpotifyClientId",
            isSecret: false,
        },
        {
            key: "spotifyClientSecret",
            labelKey: "setup.clientSecret",
            placeholderKey: "setup.enterSpotifyClientSecret",
            isSecret: true,
        },
    ],
    kick: [
        {
            key: "kickClientId",
            labelKey: "setup.clientId",
            placeholderKey: "setup.enterKickClientId",
            isSecret: false,
        },
        {
            key: "kickClientSecret",
            labelKey: "setup.clientSecret",
            placeholderKey: "setup.enterKickClientSecret",
            isSecret: true,
        },
    ],
    twitch: [
        {
            key: "twitchClientId",
            labelKey: "setup.clientId",
            placeholderKey: "setup.enterTwitchClientId",
            isSecret: false,
        },
        {
            key: "twitchClientSecret",
            labelKey: "setup.clientSecret",
            placeholderKey: "setup.enterTwitchClientSecret",
            isSecret: true,
        },
    ],
};

function statusHelpKey(status: CredentialStatus): string {
    switch (status) {
        case "needs-credentials":
            return "common.needsCredentialsHelp";
        case "unverified":
            return "common.unverifiedHelp";
        case "verifying":
            return "common.verifyingHelp";
        case "verified":
            return "common.verifiedHelp";
        case "verification-failed":
            return "common.verificationFailedHelp";
        case "verification-unavailable":
            return "common.verificationUnavailableHelp";
    }
}

export default function Secrets({
    config,
    baselineConfig = config,
    onConfigChange,
    onDraftStateChange,
    onServiceSaved,
    active = true,
}: SecretsProps) {
    const { t } = useTranslation();
    const credentialStatuses = useCredentialStatuses();
    const [guideService, setGuideService] = useState<SecretServiceId | null>(
        null
    );
    const closeGuide = useCallback(() => setGuideService(null), []);

    useEffect(() => {
        if (!active) setGuideService(null);
    }, [active]);

    const storedClientIds = useMemo(
        () =>
            Object.fromEntries(
                SECRET_SERVICES.map((service) => [
                    service.id,
                    typeof baselineConfig[service.clientIdKey] === "string"
                        ? baselineConfig[service.clientIdKey]
                        : "",
                ])
            ),
        [baselineConfig]
    );

    const section = useSecretsSection({
        verify: (serviceId, drafts) =>
            verifyServiceSecrets(
                serviceId,
                config,
                drafts,
                window.electronAPI
            ),
        save: async (serviceId, drafts) => {
            const result = await saveServiceSecrets(
                serviceId,
                config,
                drafts,
                window.electronAPI
            );
            if (result.ok) onServiceSaved?.(serviceId);
            return result;
        },
        validate: validateField,
        onClientIdChange: onConfigChange,
        statuses: credentialStatuses.statuses,
        onStatusChange: setCredentialStatus,
        onResetStatus: resetCredentialStatus,
        config,
        storedSecrets: credentialStatuses.storedSecrets,
        storedClientIds,
        onStoredSecretChange: (serviceId) => {
            markCredentialSaved(serviceId);
        },
    });

    const clientDraftPending = SECRET_SERVICES.some(
        (service) =>
            (config[service.clientIdKey] ?? "") !==
            (baselineConfig[service.clientIdKey] ?? "")
    );
    const pending =
        clientDraftPending ||
        Object.values(section.drafts).some((value) => value.trim().length > 0);
    useEffect(() => {
        onDraftStateChange?.(pending);
    }, [pending, onDraftStateChange]);

    const renderService = (serviceId: SecretServiceId) => {
        const service = SECRET_SERVICES.find(
            (candidate) => candidate.id === serviceId
        );
        if (!service) return null;
        const status = section.getStatus(serviceId);
        const fields = secretFields[serviceId];
        const clientIdValue =
            typeof config[service.clientIdKey] === "string"
                ? (config[service.clientIdKey] as string)
                : "";
        const secretDraft = section.drafts[service.clientSecretKey] ?? "";
        const baselineClientId =
            typeof baselineConfig[service.clientIdKey] === "string"
                ? (baselineConfig[service.clientIdKey] as string)
                : "";
        const stored =
            credentialStatuses.storedSecrets[serviceId] === true;
        const hasServiceDraft =
            clientIdValue !== baselineClientId || secretDraft.trim().length > 0;
        const canVerify = canVerifyCredentials(status, {
            clientId: clientIdValue,
            secretDraft,
            stored,
            storedClientId: baselineClientId,
        });
        // Two-step flow: Verify credentials first, then enable Save. The main
        // process verifies again before persisting, so a renderer cannot save
        // an unverified pair.
        const canSave = canSaveCredentials(status, { secretDraft });
        const isSaving = section.saving[serviceId] === true;
        const helpKey =
            status === "unverified" && stored && !secretDraft.trim()
                ? "common.storedCredentialsHelp"
                : status === "verified" && stored && !secretDraft.trim()
                  ? "common.verifiedStoredHelp"
                  : statusHelpKey(status);

        return (
            <ServiceCard
                key={serviceId}
                service={serviceId}
                headingLevel={2}
                status={toChipStatus(status)}
                statusLabel={t(credentialStatusMessageKey(status))}
                aria-busy={status === "verifying" || isSaving || undefined}
                actions={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => void section.verifyService(serviceId)}
                            disabled={!canVerify || isSaving}
                            loading={status === "verifying"}
                            aria-label={`${t("common.verifyCredentials")} ${service.label}`}
                        >
                            {status === "verifying"
                                ? t("common.verifying")
                                : t("common.verifyCredentials")}
                        </Button>
                        <Button
                            variant="primary"
                            onClick={() => void section.saveService(serviceId)}
                            disabled={!canSave || isSaving}
                            loading={isSaving}
                            aria-label={`${t("common.save")} ${service.label}`}
                        >
                            {t("common.save")}
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => {
                                section.cancelService(serviceId);
                                onConfigChange(
                                    service.clientIdKey,
                                    baselineClientId
                                );
                            }}
                            disabled={!hasServiceDraft || isSaving}
                            aria-label={`${t("common.cancel")} ${service.label}`}
                        >
                            {t("common.cancel")}
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => setGuideService(serviceId)}
                            aria-haspopup="dialog"
                            aria-label={`${t("common.setupGuide")} ${service.label}`}
                        >
                            {t("common.setupGuide")}
                        </Button>
                    </>
                }
                note={
                    <p className="studio-credential-help" data-tone={status}>
                        {t(helpKey)}
                    </p>
                }
            >
                {fields.map((field) => (
                    <Input
                        key={field.key}
                        label={t(field.labelKey)}
                        type={field.isSecret ? "password" : "text"}
                        value={
                            field.isSecret
                                ? section.drafts[field.key] || ""
                                : clientIdValue
                        }
                        onChange={(event) =>
                            section.editField(
                                serviceId,
                                field.key,
                                event.target.value,
                                field.isSecret
                            )
                        }
                        placeholder={t(field.placeholderKey)}
                        maxLength={field.isSecret ? 200 : 100}
                        autoComplete="off"
                        disabled={isSaving}
                        error={section.validationErrors[field.key] || undefined}
                    />
                ))}
            </ServiceCard>
        );
    };

    return (
        <div className="studio-settings-api">
            <div className="studio-settings-api-heading">
                <h2>{t("settings.secrets")}</h2>
            </div>
            <div className="studio-service-stack">
                {SECRET_SERVICES.map((service) => renderService(service.id))}
            </div>
            {guideService && (
                <SetupGuideDialog
                    serviceId={guideService}
                    {...getSetupGuide(guideService, config)}
                    onClose={closeGuide}
                />
            )}
        </div>
    );
}

function SetupGuideDialog({
    serviceId,
    dashboardUrl,
    redirectUri,
    onClose,
}: {
    serviceId: SecretServiceId;
    dashboardUrl: string;
    redirectUri: string;
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const dialogRef = useRef<HTMLElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const previousFocus = useRef<HTMLElement | null>(null);
    const service = SECRET_SERVICES.find((item) => item.id === serviceId);

    useEffect(() => {
        previousFocus.current =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
        closeRef.current?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
                return;
            }
            if (event.key !== "Tab") return;
            const dialog = dialogRef.current;
            if (!dialog) return;
            const focusable = [
                ...dialog.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                ),
            ].filter(
                (element) =>
                    element.offsetParent !== null ||
                    element === document.activeElement
            );
            if (focusable.length === 0) {
                event.preventDefault();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            const previous = previousFocus.current;
            if (previous && previous.isConnected && previous.offsetParent !== null) {
                previous.focus();
            }
        };
    }, [onClose]);

    if (!service) return null;

    return (
        <div
            className="studio-setup-overlay"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <section
                ref={dialogRef}
                className="studio-setup-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="studio-setup-title"
            >
                <div className="studio-setup-head">
                    <h2 id="studio-setup-title">
                        {t("common.setupGuide")} — {service.label}
                    </h2>
                    <IconButton
                        ref={closeRef}
                        variant="ghost"
                        label={t("common.close")}
                        onClick={onClose}
                    >
                        <X size={16} />
                    </IconButton>
                </div>
                <ol className="studio-setup-steps">
                    <li>
                        {t("common.setupStepCreate")}{" "}
                        <ExternalLink
                            href={dashboardUrl}
                            className="studio-link"
                        >
                            {dashboardUrl}
                        </ExternalLink>
                    </li>
                    {redirectUri && (
                        <li>
                            {t("common.setupStepRedirect")}{" "}
                            <code>{redirectUri}</code>
                        </li>
                    )}
                    <li>{t("common.setupStepCopy")}</li>
                    <li>{t("common.setupStepVerify")}</li>
                </ol>
                <div className="studio-setup-actions">
                    <Button variant="primary" onClick={onClose}>
                        {t("common.back")}
                    </Button>
                </div>
            </section>
        </div>
    );
}
