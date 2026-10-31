import { ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { InfoIcon } from "lucide-react";
import ExternalLink from "@/ui/components/ExternalLink";
import Input from "@/ui/components/Input";
import {
    validateClientId,
    validateClientSecret,
} from "../validation";

interface SecretsSetupModalProps {
    service: "Kick" | "Spotify";
    redirectUri: string;
    dashboardUrl: string;
    clientId: string;
    clientSecret: string;
    setClientId: (id: string) => void;
    setClientSecret: (secret: string) => void;
    onSave: () => void;
    onClose: () => void;
    hasSecrets: boolean | null;
    info?: ReactNode;
}

export default function SecretsSetupModal({
    service,
    redirectUri,
    dashboardUrl,
    clientId,
    clientSecret,
    setClientId,
    setClientSecret,
    onSave,
    onClose,
    hasSecrets,
    info,
}: SecretsSetupModalProps) {
    const { t } = useTranslation();
    const [errors, setErrors] = useState<{
        clientId?: string;
        clientSecret?: string;
    }>({});

    const validateForm = (): boolean => {
        const newErrors: { clientId?: string; clientSecret?: string } = {};

        const clientIdError = validateClientId(clientId, t);
        if (clientIdError) newErrors.clientId = clientIdError;

        const clientSecretError = validateClientSecret(clientSecret, t);
        if (clientSecretError) newErrors.clientSecret = clientSecretError;

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSave = () => {
        if (!validateForm()) {
            return;
        }
        onSave();
    };

    const handleClientIdChange = (value: string) => {
        setClientId(value);
        if (errors.clientId) {
            setErrors((prev) => ({ ...prev, clientId: undefined }));
        }
    };

    const handleClientSecretChange = (value: string) => {
        setClientSecret(value);
        if (errors.clientSecret) {
            setErrors((prev) => ({ ...prev, clientSecret: undefined }));
        }
    };

    return (
        <div className="fixed z-50 bottom-0 left-0 grid place-items-center h-screen w-screen text-white">
            <div className="relative bg-zinc-900 w-full flex flex-col h-full p-4 pt-2">
                <div
                    className="absolute top-2 right-2 cursor-pointer"
                    onClick={onClose}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                        />
                    </svg>
                </div>
                <div className="text-xl font-bold">
                    Setup{" "}
                    <span
                        className={
                            service === "Kick"
                                ? "text-kick-green"
                                : "text-spotify-green"
                        }
                    >
                        {service}
                    </span>
                </div>
                <div className="flex flex-col flex-1 justify-evenly">
                    <div className="text-sm text-gray-400 mt-4">
                        - Go to{" "}
                        <ExternalLink
                            href={dashboardUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={
                                service === "Kick"
                                    ? "text-kick-green hover:text-kick-green-dark group"
                                    : "text-spotify-green hover:text-spotify-green-dark group"
                            }
                        >
                            {service} Developer Dashboard
                        </ExternalLink>{" "}
                        and create an app.
                        <br />- Add{" "}
                        <span className="bg-zinc-500 text-white text-xs p-1 py-[2px] rounded-lg">
                            {redirectUri}
                        </span>{" "}
                        as a Redirect URL.
                        <br />
                        {service === "Kick" && (
                            <>
                                - Check{" "}
                                <span className="bg-zinc-500 text-white rounded-lg text-xs p-1 py-[2px]">
                                    Write to Chat feed
                                </span>{" "}
                                and{" "}
                                <span className="bg-zinc-500 text-white rounded-lg text-xs p-1 py-[2px]">
                                    Read channel information
                                </span>{" "}
                                from "Scopes Requested" and save your app.
                                <br />
                            </>
                        )}
                        - Copy the Client ID and Client Secret from the created
                        app and paste them below.
                        <br />
                        {info}
                    </div>
                    <div className="mt-4 space-y-2">
                        <Input
                            label={`${service} Client ID`}
                            type="text"
                            placeholder={`Enter your ${service} Client ID`}
                            value={clientId}
                            onChange={(
                                e: React.ChangeEvent<HTMLInputElement>
                            ) => handleClientIdChange(e.target.value)}
                            required
                            error={!!errors.clientId}
                            helperText={errors.clientId}
                            maxLength={100}
                        />
                        <Input
                            label={`${service} Client Secret`}
                            type="password"
                            placeholder={`Enter your ${service} Client Secret`}
                            value={clientSecret}
                            onChange={(
                                e: React.ChangeEvent<HTMLInputElement>
                            ) => handleClientSecretChange(e.target.value)}
                            required
                            error={!!errors.clientSecret}
                            helperText={errors.clientSecret}
                            maxLength={200}
                        />
                    </div>
                    <div className="flex-1" />
                    <div className="mt-4 flex gap-3">
                        <div
                            onClick={handleSave}
                            className={`${
                                service === "Kick"
                                    ? "bg-kick-green hover:bg-kick-green-dark active:bg-kick-green-darker text-black"
                                    : "bg-spotify-green hover:bg-spotify-green-dark active:bg-spotify-green-darker"
                            } px-4 py-2 rounded text-sm font-semibold w-min cursor-pointer transition-colors ${
                                Object.keys(errors).length > 0
                                    ? "opacity-50 cursor-not-allowed"
                                    : ""
                            }`}
                        >
                            Save
                        </div>
                        <div
                            onClick={onClose}
                            className="bg-zinc-700 hover:bg-zinc-600 active:bg-zinc-500 px-4 py-2 rounded text-sm font-semibold w-min cursor-pointer"
                        >
                            Back
                        </div>
                        {hasSecrets ? (
                            <div className="text-xs text-green-500 mt-2">
                                Secrets are set, you can close this window.
                            </div>
                        ) : (
                            <span className="text-blue-400 flex items-center gap-1 text-xs">
                                <InfoIcon className="size-5" /> You can change
                                these values later in the app settings.
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
