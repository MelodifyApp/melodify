import { useState, type ReactNode } from "react";
import Input from "@/ui/components/Input";
import { Button } from "@/ui/components/Button";
import KickIcon from "@/features/kick/components/KickIcon";
import SpotifyIcon from "@/features/spotify/components/SpotifyIcon";
import { useTranslation } from "react-i18next";
import { validateField } from "../validation";
import {
    SECRET_SERVICES,
    type SecretDrafts,
    type SecretSaveStatus,
    type SecretServiceId,
    saveServiceSecrets,
    secretStatusMessageKey,
    updateSecretDraft,
} from "../../secretsSave";

interface SecretsProps {
    config: any;
    onConfigChange: (key: string, value: any) => void;
}

interface SecretFieldDefinition {
    key: string;
    label: string;
    placeholder: string;
    isSecret: boolean;
}

const secretFields: Record<SecretServiceId, SecretFieldDefinition[]> = {
    spotify: [
        {
            key: "spotifyClientId",
            label: "Client ID",
            placeholder: "1a2b3c4d5e6f...",
            isSecret: false,
        },
        {
            key: "spotifyClientSecret",
            label: "Client Secret",
            placeholder: "a1b2c3d4e5f6...",
            isSecret: true,
        },
    ],
    kick: [
        {
            key: "kickClientId",
            label: "Client ID",
            placeholder: "kick_client_id_here",
            isSecret: false,
        },
        {
            key: "kickClientSecret",
            label: "Client Secret",
            placeholder: "kick_client_secret_here",
            isSecret: true,
        },
    ],
};

export default function Secrets({ config, onConfigChange }: SecretsProps) {
    const { t } = useTranslation();
    const [validationErrors, setValidationErrors] = useState<
        Record<string, string | null>
    >({});
    // Secrets live only here until the user presses Save; they never go
    // through config:set.
    const [drafts, setDrafts] = useState<SecretDrafts>({});
    const [statuses, setStatuses] = useState<
        Record<string, SecretSaveStatus>
    >({});

    const handleInputChange = (
        serviceId: SecretServiceId,
        key: string,
        value: string,
        isSecret: boolean
    ) => {
        const error = validateField(key, value);
        setValidationErrors((prev) => ({ ...prev, [key]: error }));

        if (isSecret) {
            setDrafts((prev) => updateSecretDraft(prev, key, value));
            setStatuses((prev) => ({ ...prev, [serviceId]: "idle" }));
            return;
        }

        onConfigChange(key, value);
    };

    const handleSaveSecrets = async (serviceId: SecretServiceId) => {
        setStatuses((prev) => ({ ...prev, [serviceId]: "saving" }));

        const result = await saveServiceSecrets(
            serviceId,
            config,
            drafts,
            window.electronAPI
        );

        setDrafts(result.drafts);
        setStatuses((prev) => ({
            ...prev,
            [serviceId]: result.ok ? "saved" : (result.error ?? "failed"),
        }));
    };

    const renderService = (
        serviceId: SecretServiceId,
        icon: ReactNode,
        iconClassName: string
    ) => {
        const service = SECRET_SERVICES.find(
            (candidate) => candidate.id === serviceId
        );
        if (!service) return null;
        const status = statuses[serviceId] ?? "idle";
        const statusKey = secretStatusMessageKey(status);
        const fields = secretFields[serviceId];

        return (
            <div className="bg-zinc-800/30 rounded-md border border-zinc-700/50 p-3">
                <div className="flex items-center gap-2 mb-3">
                    <div
                        className={`w-8 h-8 ${iconClassName} rounded flex items-center justify-center`}
                    >
                        {icon}
                    </div>
                    <h3 className="text-sm font-semibold text-white">
                        {service.label}
                    </h3>
                </div>

                <div className="space-y-2">
                    {fields.map((field, index) => (
                        <div key={field.key}>
                            <div className="relative">
                                <Input
                                    label={field.label}
                                    type="password"
                                    value={
                                        field.isSecret
                                            ? drafts[field.key] || ""
                                            : typeof config[field.key] ===
                                                "string"
                                              ? (config[field.key] as string)
                                              : ""
                                    }
                                    onChange={(e) =>
                                        handleInputChange(
                                            serviceId,
                                            field.key,
                                            e.target.value,
                                            field.isSecret
                                        )
                                    }
                                    placeholder={field.placeholder}
                                    className="text-sm"
                                    error={!!validationErrors[field.key]}
                                    helperText={
                                        validationErrors[field.key] || undefined
                                    }
                                />
                            </div>
                            {index < fields.length - 1 && (
                                <div className="h-px bg-zinc-700/30 my-2"></div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="mt-3 flex items-center gap-3">
                    <Button
                        type="button"
                        onClick={() => handleSaveSecrets(serviceId)}
                        disabled={status === "saving"}
                        aria-label={`${t("common.save")} ${service.label}`}
                    >
                        {t("common.save")}
                    </Button>
                    <p
                        role="status"
                        aria-live="polite"
                        className={`text-xs ${
                            status === "failed" || status === "required"
                                ? "text-red-400"
                                : "text-zinc-400"
                        }`}
                    >
                        {statusKey ? t(statusKey) : ""}
                    </p>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-4">
            <h3 className="text-base font-medium text-white mb-4">
                {t("settings.secrets")}
            </h3>

            {renderService(
                "spotify",
                <SpotifyIcon className="w-5 h-5" />,
                "bg-spotify-green"
            )}
            {renderService(
                "kick",
                <KickIcon className="w-5 h-5" />,
                "bg-kick-green"
            )}
        </div>
    );
}
