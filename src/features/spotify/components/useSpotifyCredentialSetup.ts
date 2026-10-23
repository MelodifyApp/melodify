import { useState } from "react";
import { submitSpotifyCredentials } from "./spotifyCredentialView";

export interface SpotifyCredentialSetupOptions {
    translate: (key: string) => string;
    hasSecrets: boolean | null;
    requestAuth: () => void;
    onSaved: () => void;
    /** Injectable bridge for headless tests; defaults to the preload API. */
    invoke?: (channel: string, payload: unknown) => Promise<unknown>;
}

/**
 * Local setup state for the Spotify card: typed client ID/secret, overlay
 * visibility and a single in-app error. Errors clear as soon as the relevant
 * input changes, on cancel/reopen, and on success; failed saves keep the typed
 * values so the user can correct them.
 */
export function useSpotifyCredentialSetup({
    translate,
    hasSecrets,
    requestAuth,
    onSaved,
    invoke,
}: SpotifyCredentialSetupOptions) {
    const [clientId, setClientId] = useState("");
    const [clientSecret, setClientSecret] = useState("");
    const [showSetup, setShowSetup] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const changeClientId = (value: string) => {
        setError(null);
        setClientId(value);
    };

    const changeClientSecret = (value: string) => {
        setError(null);
        setClientSecret(value);
    };

    const openSetup = () => {
        setError(null);
        setShowSetup(true);
    };

    const cancelSetup = () => {
        setError(null);
        setShowSetup(false);
    };

    const submit = async (): Promise<void> => {
        if (!clientId || !clientSecret) {
            setError(translate("common.pleaseCompleteFields"));
            return;
        }

        const outcome = await submitSpotifyCredentials(
            invoke ??
                ((channel, payload) =>
                    window.electronAPI.invoke(channel, payload)),
            { spotifyClientId: clientId, spotifyClientSecret: clientSecret }
        );

        if (outcome.ok) {
            setError(null);
            setClientId("");
            setClientSecret("");
            setShowSetup(false);
            onSaved();
            return;
        }

        setError(
            translate(
                "messageKey" in outcome
                    ? outcome.messageKey
                    : "common.secretsSaveError"
            )
        );
    };

    const login = () => {
        if (!hasSecrets) {
            setError(translate("common.secretsRequired"));
            return;
        }
        setError(null);
        requestAuth();
    };

    return {
        clientId,
        clientSecret,
        showSetup,
        error,
        changeClientId,
        changeClientSecret,
        openSetup,
        cancelSetup,
        submit,
        login,
    };
}
