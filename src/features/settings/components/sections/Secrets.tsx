import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, ServiceCard } from "@/ui/components/studio";
import {
    SECRET_SERVICES,
    credentialSaveFollowUp,
    getSecretService,
    getSetupGuide,
    type SecretServiceId,
} from "../../secretsSave";
import {
    credentialCardView,
    type CredentialCardAction,
} from "../../credentialCardState";
import {
    markCredentialSaved,
    retryStoredCredentialVerification,
    useCredentialStatuses,
} from "../../credentialStatusStore";
import CredentialSetupDialog, {
    type CredentialSetupMode,
} from "./CredentialSetupDialog";

interface SecretsProps {
    config: Record<string, unknown>;
    onCredentialsSaved?: (
        serviceId: SecretServiceId,
        clientId: string
    ) => void;
    active?: boolean;
}

const PURPOSE_KEYS: Record<SecretServiceId, string> = {
    spotify: "home.connections.spotifyRole",
    kick: "home.connections.kickRole",
    twitch: "home.connections.twitchRole",
};

export default function Secrets({
    config,
    onCredentialsSaved,
    active = true,
}: SecretsProps) {
    const { t } = useTranslation();
    const credentialStatuses = useCredentialStatuses();
    const [dialog, setDialog] = useState<{
        serviceId: SecretServiceId;
        mode: CredentialSetupMode;
    } | null>(null);
    const closeDialog = useCallback(() => setDialog(null), []);

    useEffect(() => {
        if (!active) setDialog(null);
    }, [active]);

    const clientIdFor = (serviceId: SecretServiceId): string => {
        const key = getSecretService(serviceId).clientIdKey;
        return typeof config[key] === "string" ? config[key] : "";
    };

    const handleConnected = (
        serviceId: SecretServiceId,
        clientId: string
    ) => {
        markCredentialSaved(serviceId, clientId);
        onCredentialsSaved?.(serviceId, clientId);
        setDialog(null);
        const { authChannel } = credentialSaveFollowUp(serviceId);
        if (authChannel) {
            window.electronAPI.send(authChannel);
        }
    };

    const retryService = (serviceId: SecretServiceId) => {
        void retryStoredCredentialVerification(
            window.electronAPI,
            serviceId,
            clientIdFor(serviceId)
        );
    };

    const actionFor = (
        serviceId: SecretServiceId,
        action: CredentialCardAction
    ) => {
        const service = getSecretService(serviceId);
        switch (action) {
            case "set-up":
                return (
                    <Button
                        variant="primary"
                        onClick={() =>
                            setDialog({ serviceId, mode: "setup" })
                        }
                        aria-label={`${t("common.setUp")} ${service.label}`}
                    >
                        {t("common.setUp")}
                    </Button>
                );
            case "replace":
                return (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            setDialog({ serviceId, mode: "replace" })
                        }
                        aria-label={`${t("common.replaceCredentials")} ${service.label}`}
                    >
                        {t("common.replaceCredentials")}
                    </Button>
                );
            case "update":
                return (
                    <Button
                        variant="primary"
                        onClick={() =>
                            setDialog({ serviceId, mode: "replace" })
                        }
                        aria-label={`${t("common.updateCredentials")} ${service.label}`}
                    >
                        {t("common.updateCredentials")}
                    </Button>
                );
            case "try-again":
                return (
                    <Button
                        variant="secondary"
                        onClick={() => retryService(serviceId)}
                        aria-label={`${t("common.tryAgain")} ${service.label}`}
                    >
                        {t("common.tryAgain")}
                    </Button>
                );
            default:
                return undefined;
        }
    };

    const renderService = (serviceId: SecretServiceId) => {
        const service = SECRET_SERVICES.find(
            (candidate) => candidate.id === serviceId
        );
        if (!service) return null;
        const view = credentialCardView(
            credentialStatuses.statuses[serviceId],
            credentialStatuses.storedSecrets[serviceId] === true,
            credentialStatuses.ready
        );
        const purposeKey = PURPOSE_KEYS[serviceId];

        return (
            <ServiceCard
                key={serviceId}
                service={serviceId}
                headingLevel={2}
                status={view.chipStatus}
                statusLabel={t(view.labelKey)}
                description={t(purposeKey)}
                aria-busy={view.state === "checking" || undefined}
                actions={actionFor(serviceId, view.action)}
            />
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
            {dialog && (
                <CredentialSetupDialog
                    key={`${dialog.serviceId}-${dialog.mode}`}
                    serviceId={dialog.serviceId}
                    mode={dialog.mode}
                    initialClientId={clientIdFor(dialog.serviceId)}
                    config={config}
                    {...getSetupGuide(dialog.serviceId, config)}
                    onClose={closeDialog}
                    onConnected={(clientId) =>
                        handleConnected(dialog.serviceId, clientId)
                    }
                />
            )}
        </div>
    );
}
