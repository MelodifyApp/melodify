import { useEffect, useState } from "react";
import { logDebug, logError } from "@/renderer/rendererLogger";
import { SPOTIFY_REDIRECT_URI } from "@/shared/constants";
import SpotifyIcon from "./SpotifyIcon";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { useSpotifyCredentialSetup } from "./useSpotifyCredentialSetup";
import { isSpotifyAppAvailable } from "./spotifyStatusView";
import CredentialSetupFeedback from "@/ui/components/CredentialSetupFeedback";

export default function SpotifyCard() {
    const { t } = useTranslation();
    const [hasSecrets, setHasSecrets] = useState<boolean | null>(null);
    const [spotifyUsername, setSpotifyUsername] = useState<string | null>(null);
    const [authenticated, setAuthenticated] = useState<boolean | null>(null);
    const [spotifyRunning, setSpotifyRunning] = useState<boolean | null>(null);
    const [spotifyHasSession, setSpotifyHasSession] = useState<boolean | null>(null);
    const [spotifyRedirectUri, setSpotifyRedirectUri] =
        useState<string>(SPOTIFY_REDIRECT_URI);
    const [refreshInProgress, setRefreshInProgress] = useState(false);

    const setup = useSpotifyCredentialSetup({
        translate: t,
        hasSecrets,
        requestAuth: () => window.electronAPI.send("spotify:auth"),
        onSaved: () => setHasSecrets(true),
    });

    useEffect(() => {
        window.electronAPI
            .invoke("spotify:hasSecrets")
            .then((secrets) => {
                logDebug(`Spotify secrets fetched: ${!!secrets}`);
                setHasSecrets(secrets);
            })
            .catch((error) => {
                logError(error, "Failed to fetch Spotify secrets");
            });
    }, []);

    useEffect(() => {
        const checkSpotifyProcess = async () => {
            const isRunning =
                await window.electronAPI.invoke("spotify:isRunning");
            setSpotifyRunning(isRunning);
        };
        checkSpotifyProcess();
        const interval = setInterval(checkSpotifyProcess, 5000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        window.electronAPI
            .invoke("spotify:checkAuth")
            .then((result) => {
                setAuthenticated(result.authenticated);
                if (result.authenticated) {
                    setSpotifyUsername(result.username);
                } else {
                    setSpotifyUsername(null);
                    setSpotifyHasSession(false);
                }
            })
            .catch((error) => {
                setAuthenticated(false);
                setSpotifyUsername(null);
                setSpotifyHasSession(false);
                logError(error, "Failed to check Spotify authentication");
            });
    }, []);

    useEffect(() => {
        const handleAuthenticated = (data: any) => {
            try {
                if (data && typeof data === "object" && data.username) {
                    setAuthenticated(true);
                    setSpotifyUsername(data.username);
                } else {
                    logError(
                        new Error("Invalid authentication data received"),
                        "handleAuthenticated"
                    );
                    setAuthenticated(false);
                    setSpotifyUsername(null);
                }
            } catch (error) {
                logError(error as Error, "handleAuthenticated");
                setAuthenticated(false);
                setSpotifyUsername(null);
            }
        };

        window.electronAPI.on("spotify:authenticated", handleAuthenticated);

        // Cleanup function to remove the event listener
        return () => {
            window.electronAPI.removeAllListeners("spotify:authenticated");
        };
    }, []);

    useEffect(() => {
        if (!authenticated) return;
        let interval: NodeJS.Timeout | null = null;

        function checkSpotifySession() {
            window.electronAPI
                .invoke("spotify:hasSession")
                .then((hasSession) => {
                    setSpotifyHasSession(hasSession);
                    if (hasSession && interval) {
                        clearInterval(interval);
                        interval = null;
                    }
                })
                .catch((error) => {
                    logError(error, "Failed to check Spotify session");
                    setSpotifyHasSession(false);
                });
        }

        checkSpotifySession();
        interval = setInterval(checkSpotifySession, 5000);

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [authenticated]);

    useEffect(() => {
        window.electronAPI.invoke("config:get").then((cfg) => {
            if (cfg && cfg.spotifyRedirectUri) {
                setSpotifyRedirectUri(cfg.spotifyRedirectUri);
            }
        });
    }, []);

    const handleSecretsSubmit = async () => {
        await setup.submit();
    };

    const handleLogin = () => {
        setup.login();
    };

    const handleLogout = () => {
        try {
            window.electronAPI.send("spotify:logout");
            setAuthenticated(false);
            setSpotifyUsername(null);
            setSpotifyHasSession(false);
        } catch (error) {
            logError(error as Error, "Failed to logout from Spotify");
        }
    };

    const handleRefreshStatus = async () => {
        if (refreshInProgress) return;
        setRefreshInProgress(true);
        try {
            const authResult = await window.electronAPI.invoke("spotify:checkAuth");
            setAuthenticated(authResult.authenticated);
            setSpotifyUsername(authResult.authenticated ? authResult.username : null);
        } catch (error) {
            logError(error as Error, "Error refreshing Spotify status");
        } finally {
            setRefreshInProgress(false);
        }
    };

    return (
        <div className="w-full h-full flex flex-col bg-zinc-800/10 relative">
            <div className="p-4 pb-3">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-spotify-green rounded-full flex items-center justify-center">
                        <SpotifyIcon className="w-6 h-6 text-black" />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-white">
                            Spotify
                        </h2>
                        {spotifyUsername && (
                            <p className="text-xs text-zinc-400 mt-0.5">
                                @{spotifyUsername}
                            </p>
                        )}
                    </div>
                </div>

                <div
                    className={`px-3 py-1.5 rounded-md text-xs font-medium text-center ${authenticated === null || hasSecrets === null
                        ? "bg-zinc-700/40 text-zinc-300 border border-zinc-600/50"
                        : authenticated && spotifyHasSession
                            ? "bg-green-500/20 text-green-300 border border-green-500/30"
                            : authenticated
                                ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30"
                                : hasSecrets
                                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                    : "bg-red-500/20 text-red-300 border border-red-500/30"
                        }`}
                >
                    {authenticated === null || hasSecrets === null
                        ? t("common.checking")
                        : authenticated && spotifyHasSession
                        ? `✓ ${t("common.readyForRequests")}`
                        : authenticated
                            ? `⚠ ${t("common.startPlayingMusic")}`
                            : hasSecrets
                                ? `🔗 ${t("common.readyToConnect")}`
                                : `⚙ ${t("common.setupRequired")}`}
                </div>
            </div>

            <div className="flex-1 px-5 pb-3">
                <div className="grid gap-2.5">
                    <div className="border-b border-zinc-700/50 py-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-zinc-400">
                                {t("statusCards.api")}
                            </span>
                            <div
                                className={`w-2 h-2 rounded-full ${hasSecrets === null ? "bg-zinc-500" : hasSecrets ? "bg-green-400" : "bg-red-400"}`}
                            ></div>
                        </div>
                        <p className="text-xs text-zinc-300 mt-0.5">
                            {hasSecrets === null
                                ? t("common.checking")
                                : hasSecrets
                                    ? t("common.configured")
                                    : t("common.notSet")}
                        </p>
                    </div>

                    <div className="border-b border-zinc-700/50 py-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-zinc-400">
                                {t("statusCards.app")}
                            </span>
                            <div
                                className={`w-2 h-2 rounded-full ${spotifyRunning === null && spotifyHasSession === null ? "bg-zinc-500" : isSpotifyAppAvailable(spotifyRunning, spotifyHasSession) ? "bg-green-400" : "bg-red-400"}`}
                            ></div>
                        </div>
                        <p className="text-xs text-zinc-300 mt-0.5">
                            {spotifyRunning === null
                                ? t("common.checking")
                                : spotifyRunning
                                    ? t("common.running")
                                    : spotifyHasSession
                                        ? t("common.runningOnAnotherDevice")
                                        : t("common.closed")}
                        </p>
                    </div>

                    <div className="border-b border-zinc-700/50 py-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-zinc-400">
                                {t("statusCards.auth")}
                            </span>
                            <div
                                className={`w-2 h-2 rounded-full ${authenticated === null ? "bg-zinc-500" : authenticated ? "bg-green-400" : "bg-red-400"}`}
                            ></div>
                        </div>
                        <p className="text-xs text-zinc-300 mt-0.5">
                            {authenticated === null
                                ? t("common.checking")
                                : authenticated
                                    ? t("authentication.authenticated")
                                    : t("authentication.notAuthenticated")}
                        </p>
                    </div>

                    <div className="py-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-zinc-400">
                                {t("statusCards.session")}
                            </span>
                            <div
                                className={`w-2 h-2 rounded-full ${spotifyHasSession === null ? "bg-zinc-500" : spotifyHasSession ? "bg-green-400" : "bg-red-400"}`}
                            ></div>
                        </div>
                        <p className="text-xs text-zinc-300 mt-0.5">
                            {spotifyHasSession === null
                                ? t("common.checking")
                                : spotifyHasSession
                                    ? t("common.active")
                                    : t("common.inactive")}
                        </p>
                    </div>
                </div>
            </div>

            <div className="p-4 pt-2">
                {hasSecrets === null || (hasSecrets && authenticated === null) ? (
                    <button type="button" disabled className="w-full bg-zinc-700 text-zinc-300 font-medium py-2 px-4 rounded-md cursor-wait">
                        {t("common.checking")}
                    </button>
                ) : hasSecrets === false ? (
                    <button
                        onClick={() => setup.openSetup()}
                        className="w-full bg-spotify-green hover:bg-spotify-green-dark text-black font-semibold py-2 px-4 rounded-md transition-colors"
                    >
                        {t("common.configureCredentials")}
                    </button>
                ) : authenticated ? (
                    <div className="flex gap-3 items-center">
                        <button
                            onClick={handleLogout}
                            className="flex-1 bg-red-700 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-md transition-colors"
                        >
                            {t("authentication.disconnect")}
                        </button>
                        <button
                            onClick={handleRefreshStatus}
                            disabled={refreshInProgress}
                            aria-label={t("common.refresh")}
                            className={`w-10 h-10 flex items-center justify-center text-white rounded-md transition-colors ${refreshInProgress
                                ? "bg-white/10 cursor-not-allowed"
                                : "bg-transparent hover:bg-white/10"
                                }`}
                        >
                            <RefreshCw
                                className={`w-5 h-5 ${refreshInProgress ? "animate-spin" : ""}`}
                            />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => handleLogin()}
                        className="w-full bg-spotify-green hover:bg-spotify-green-dark text-black font-semibold py-2 px-4 rounded-md transition-colors flex items-center justify-center gap-2"
                    >
                        <SpotifyIcon className="w-4 h-4" />
                        {t("authentication.connect")}
                    </button>
                )}
                <CredentialSetupFeedback
                    message={setup.error}
                    visible={!setup.showSetup}
                    className="mt-2"
                />
            </div>

            {setup.showSetup && (
                <div className="absolute inset-0 bg-zinc-900 flex flex-col overflow-hidden z-10">
                    <div className="p-5 pb-3 flex-shrink-0">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 bg-spotify-green rounded-full flex items-center justify-center">
                                <SpotifyIcon className="w-6 h-6 text-black" />
                            </div>
                            <div>
                                <h2 className="text-base font-semibold text-white">
                                    {t("setup.configureSpotifyAPI")}
                                </h2>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 px-5 pb-5 overflow-y-auto">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-zinc-300 mb-1">
                                    {t("setup.clientId")}
                                </label>
                                <input
                                    type="text"
                                    placeholder={t(
                                        "setup.enterSpotifyClientId"
                                    )}
                                    value={setup.clientId}
                                    onChange={(e) =>
                                        setup.changeClientId(e.target.value)
                                    }
                                    className="w-full bg-zinc-700 text-white rounded px-3 py-2 border border-zinc-600 focus:border-spotify-green focus:ring-1 focus:ring-spotify-green"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-zinc-300 mb-1">
                                    {t("setup.clientSecret")}
                                </label>
                                <input
                                    type="password"
                                    placeholder={t(
                                        "setup.enterSpotifyClientSecret"
                                    )}
                                    value={setup.clientSecret}
                                    onChange={(e) =>
                                        setup.changeClientSecret(e.target.value)
                                    }
                                    className="w-full bg-zinc-700 text-white rounded px-3 py-2 border border-zinc-600 focus:border-spotify-green focus:ring-1 focus:ring-spotify-green"
                                />
                            </div>
                            <div className="bg-zinc-800 border border-zinc-700 rounded-md p-3">
                                <p className="text-xs text-zinc-300">
                                    {t("setup.spotifyInstructions")}{" "}
                                    <a
                                        href="https://developer.spotify.com/dashboard"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-melodify-primary underline hover:text-white cursor-pointer"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            window.electronAPI.openExternal(
                                                "https://developer.spotify.com/dashboard"
                                            );
                                        }}
                                    >
                                        developer.spotify.com/dashboard
                                    </a>{" "}
                                    {t("setup.spotifyInstructionsEnd")}{" "}
                                    {spotifyRedirectUri}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="p-5 pt-2 flex-shrink-0">
                        <CredentialSetupFeedback
                            message={setup.error}
                            visible={setup.showSetup}
                            className="mb-2"
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => setup.cancelSetup()}
                                className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-white py-2 px-4 rounded-md transition-colors"
                            >
                                {t("common.cancel")}
                            </button>
                            <button
                                onClick={handleSecretsSubmit}
                                className="flex-1 bg-spotify-green hover:bg-spotify-green-dark text-black font-semibold py-2 px-4 rounded-md transition-colors"
                            >
                                {t("common.save")}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
