import { useEffect, useState } from "react";
import { logDebug, logError } from "@/renderer/rendererLogger";
import StatusMessage from "@/ui/components/StatusMessage";
import { KICK_REDIRECT_URI } from "@/shared/constants";
import KickIcon from "./KickIcon";
import { InfoIcon, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getKickCardView } from "./kickCardView";

export default function KickCard() {
    const { t } = useTranslation();
    const [hasSecrets, setHasSecrets] = useState<boolean | null>(null);
    const [kickClientId, setKickClientId] = useState("");
    const [kickClientSecret, setKickClientSecret] = useState("");
    const [kickUsername, setKickUsername] = useState<string | null>(null);
    const [authenticated, setAuthenticated] = useState(false);
    const [listeningToChat, setListeningToChat] = useState(false);
    const [showSetup, setShowSetup] = useState(false);
    const [kickRedirectUri, setKickRedirectUri] =
        useState<string>(KICK_REDIRECT_URI);
    const [authInProgress, setAuthInProgress] = useState(false);
    const [refreshInProgress, setRefreshInProgress] = useState(false);

    useEffect(() => {
        window.electronAPI
            .invoke("kick:hasSecrets")
            .then((secrets) => {
                setHasSecrets(secrets);
            })
            .catch((error) => {
                logError(error, "Error checking Kick secrets");
                setHasSecrets(false);
            });

        window.electronAPI.on("kick:authenticated", (data) => {
            setAuthenticated(true);
            setAuthInProgress(false);
            logDebug(`Kick authenticated: ${data?.username}`);
            setKickUsername(data.username);
        });

        window.electronAPI.on("kick:chatConnected", () => {
            setListeningToChat(true);
        });

        window.electronAPI.on("kick:chatDisconnected", () => {
            setListeningToChat(false);
        });

        window.electronAPI.on("kick:authenticationFailed", () => {
            setAuthenticated(false);
            setAuthInProgress(false);
            // An OAuth failure does not necessarily stop the anonymous guest
            // reader, so reconcile with the main process instead of assuming
            // the chat is disconnected.
            window.electronAPI
                .invoke("kick:isListeningToChat")
                .then((isListening) => {
                    setListeningToChat(!!isListening);
                })
                .catch((error) => {
                    logError(error, "Error reconciling Kick chat state");
                });
            window.electronAPI
                .invoke("kick:getUserData")
                .then((data) => {
                    setKickUsername(data?.username || null);
                })
                .catch((error) => {
                    logError(error, "Error reconciling Kick user data");
                });
        });

        window.electronAPI
            .invoke("kick:isListeningToChat")
            .then((isListening) => {
                setListeningToChat(isListening);
            })
            .catch((error) => {
                logError(error, "Error checking Kick chat listening status");
            });

        window.electronAPI
            .invoke("kick:checkAuth")
            .then((result) => {
                setAuthenticated(result.authenticated);
                if (result.authenticated) {
                    setKickUsername(result.username);
                    return;
                }
                // Keep the configured channel visible while an anonymous
                // guest reader is still running after an OAuth failure.
                return window.electronAPI
                    .invoke("kick:getUserData")
                    .then((data) => {
                        setKickUsername(data?.username || null);
                    })
                    .catch((error) => {
                        logError(error, "Error reading Kick user data");
                        setKickUsername(null);
                    });
            })
            .catch((error) => {
                logError(error, "Error checking Kick authentication");
                setAuthenticated(false);
                setKickUsername(null);
            });

        window.electronAPI.invoke("config:get").then((cfg) => {
            if (cfg && cfg.kickRedirectUri) {
                setKickRedirectUri(cfg.kickRedirectUri);
            }
        });

        // Cleanup function to remove event listeners
        return () => {
            window.electronAPI.removeAllListeners("kick:authenticated");
            window.electronAPI.removeAllListeners("kick:chatConnected");
            window.electronAPI.removeAllListeners("kick:chatDisconnected");
            window.electronAPI.removeAllListeners("kick:authenticationFailed");
        };
    }, []);

    const handleSecretsSubmit = async () => {
        if (!kickClientId || !kickClientSecret) {
            alert(t("common.pleaseCompleteFields"));
            return;
        }

        try {
            window.electronAPI.send("kick:setSecrets", {
                kickClientId: kickClientId,
                kickClientSecret: kickClientSecret,
            });
            setHasSecrets(true);
            setKickClientId("");
            setKickClientSecret("");
            setShowSetup(false);
        } catch (error) {
            logError(error as Error, "Error setting Kick secrets");
            alert(t("common.secretsSaveError"));
        }
    };

    const handleLogin = () => {
        if (!hasSecrets) {
            alert(t("common.secretsRequired"));
            return;
        }

        if (authInProgress) {
            logDebug("Authentication already in progress, ignoring click");
            return;
        }

        setAuthInProgress(true);
        window.electronAPI.send("kick:auth");

        // Reset auth in progress after timeout to handle edge cases
        setTimeout(() => {
            setAuthInProgress(false);
        }, 30000); // 30 seconds timeout
    };

    const handleLogout = () => {
        window.electronAPI.send("kick:logout");
        // Don't manually set state here - let the IPC events handle it
        // The backend will send kick:chatDisconnected and kick:authenticationFailed events

        // Also refresh the listening state to ensure UI is in sync
        setTimeout(() => {
            window.electronAPI
                .invoke("kick:isListeningToChat")
                .then((isListening) => {
                    setListeningToChat(isListening);
                })
                .catch((error) => {
                    logError(
                        error,
                        "Error checking Kick chat listening status after logout"
                    );
                });
        }, 100); // Small delay to allow backend to process logout
    };

    const refreshKickStatus = async () => {
        const [authResult, isListening, userData] = await Promise.all([
            window.electronAPI.invoke("kick:checkAuth"),
            window.electronAPI.invoke("kick:isListeningToChat"),
            window.electronAPI.invoke("kick:getUserData"),
        ]);

        setAuthenticated(authResult.authenticated);
        setKickUsername(
            authResult.authenticated
                ? authResult.username
                : userData?.username || null
        );
        setListeningToChat(isListening);
    };

    const handleRefreshStatus = async () => {
        if (refreshInProgress) {
            return;
        }

        setRefreshInProgress(true);
        try {
            await refreshKickStatus();
        } catch (error) {
            logError(error as Error, "Error refreshing Kick status");
        } finally {
            setRefreshInProgress(false);
        }
    };

    const handleRetryChat = async () => {
        if (refreshInProgress) {
            return;
        }

        setRefreshInProgress(true);
        try {
            await window.electronAPI.invoke("kick:retryChat");
            await refreshKickStatus();
        } catch (error) {
            logError(error as Error, "Error retrying Kick chat connection");
        } finally {
            setRefreshInProgress(false);
        }
    };

    const view = getKickCardView({
        hasSecrets,
        authenticated,
        listeningToChat,
    });

    return (
        <div className="w-full h-full flex flex-col bg-zinc-800/20 backdrop-blur-sm relative">
            <div className="p-5 pb-3">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-kick-green to-green-400 rounded-xl flex items-center justify-center shadow-lg">
                        <KickIcon className="w-6 h-6 text-black" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold bg-gradient-to-r from-white to-zinc-300 bg-clip-text text-transparent">
                            Kick
                        </h2>
                        {kickUsername && (
                            <p className="text-xs text-zinc-400 mt-0.5">
                                @{kickUsername}
                            </p>
                        )}
                    </div>
                </div>

                <div
                    className={`px-3 py-1.5 rounded-full text-xs font-medium text-center ${
                        view.badge === "listening"
                            ? "bg-green-500/20 text-green-300 border border-green-500/30"
                            : view.badge === "chat-unavailable"
                                ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30"
                                : view.badge === "ready"
                                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                    : "bg-red-500/20 text-red-300 border border-red-500/30"
                        }`}
                >
                    {view.badge === "listening"
                        ? `✓ ${t("common.listeningToChat")}`
                        : view.badge === "chat-unavailable"
                            ? `⚠ ${t("common.connectToChat")}`
                            : view.badge === "ready"
                                ? `🔗 ${t("common.readyToConnect")}`
                                : `⚙ ${t("common.setupRequired")}`}
                </div>
            </div>

            <div className="flex-1 px-5 pb-3">
                <div className="grid gap-2.5">
                    <div className="bg-zinc-700/20 rounded-lg p-2 border border-zinc-600/20">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                                API
                            </span>
                            <div
                                className={`w-2 h-2 rounded-full ${hasSecrets ? "bg-green-400" : "bg-red-400"}`}
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

                    <div className="bg-zinc-700/20 rounded-lg p-2 border border-zinc-600/20">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                                {t("statusCards.auth")}
                            </span>
                            <div
                                className={`w-2 h-2 rounded-full ${authenticated ? "bg-green-400" : "bg-red-400"}`}
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

                    <div className="bg-zinc-700/20 rounded-lg p-2 border border-zinc-600/20">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                                {t("statusCards.chatConnection")}
                            </span>
                            <div
                                className={`w-2 h-2 rounded-full ${listeningToChat ? "bg-green-400" : "bg-red-400"}`}
                            ></div>
                        </div>
                        <div className="text-xs text-zinc-300 mt-0.5 leading-none">
                            {listeningToChat === null
                                ? t("common.checking")
                                : listeningToChat
                                    ? t("common.activeListening")
                                    : authenticated
                                        ? (
                                            <span className="inline-flex items-center gap-2">
                                                <span>{t("common.couldNotConnectToChat")}</span>
                                                <button
                                                    type="button"
                                                    onClick={handleRetryChat}
                                                    disabled={refreshInProgress}
                                                    aria-label={t("common.retry")}
                                                    className={`inline-flex items-center justify-center w-4 h-4 rounded ${refreshInProgress
                                                        ? "bg-white/10 cursor-not-allowed"
                                                        : "bg-transparent hover:bg-white/10"
                                                        }`}
                                                >
                                                    <RefreshCw
                                                        className={`w-3 h-3 ${refreshInProgress ? "animate-spin" : ""}`}
                                                    />
                                                </button>
                                            </span>
                                        )
                                        : t("common.notConnected")}
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-5 pt-2">
                {view.showConfigure ? (
                    <button
                        onClick={() => setShowSetup(true)}
                        className="w-full bg-gradient-to-r from-kick-green to-green-400 hover:from-green-400 hover:to-kick-green text-black font-semibold py-2.5 px-4 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
                    >
                        {t("common.configureCredentials")}
                    </button>
                ) : view.showDisconnect ? (
                    <div className="flex gap-3 items-center">
                        <button
                            onClick={handleLogout}
                            className="flex-1 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-500 text-white font-semibold py-2.5 px-4 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl"
                        >
                            {t("authentication.disconnect")}
                        </button>
                        <button
                                                    onClick={handleRetryChat}
                            disabled={refreshInProgress}
                            aria-label={t("common.refresh")}
                            className={`w-11 h-11 flex items-center justify-center text-white rounded-lg transition-all duration-200 ${refreshInProgress
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
                        disabled={authInProgress}
                        className={`w-full font-semibold py-2.5 px-4 rounded-lg transition-all duration-200 shadow-lg flex items-center justify-center gap-2 ${authInProgress
                            ? "bg-gray-500 cursor-not-allowed"
                            : "bg-gradient-to-r from-kick-green to-green-400 hover:from-green-400 hover:to-kick-green hover:shadow-xl transform hover:scale-105"
                            } text-black`}
                    >
                        {authInProgress ? (
                            <>
                                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                                {t("common.connecting")}
                            </>
                        ) : (
                            <>
                                <KickIcon className="w-4 h-4" />
                                {t("authentication.connect")}
                            </>
                        )}
                    </button>
                )}
            </div>

            {showSetup && (
                <div className="absolute inset-0 bg-zinc-900/95 backdrop-blur-sm flex flex-col overflow-hidden z-10">
                    <div className="p-5 pb-3 flex-shrink-0">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-12 h-12 bg-gradient-to-br from-kick-green to-green-400 rounded-xl flex items-center justify-center shadow-lg">
                                <KickIcon className="w-6 h-6 text-black" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold bg-gradient-to-r from-white to-zinc-300 bg-clip-text text-transparent">
                                    {t("setup.configureKickAPI")}
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
                                    placeholder={t("setup.enterKickClientId")}
                                    value={kickClientId}
                                    onChange={(e) =>
                                        setKickClientId(e.target.value)
                                    }
                                    className="w-full bg-zinc-700 text-white rounded px-3 py-2 border border-zinc-600 focus:border-kick-green focus:ring-1 focus:ring-kick-green"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-zinc-300 mb-1">
                                    {t("setup.clientSecret")}
                                </label>
                                <input
                                    type="password"
                                    placeholder={t(
                                        "setup.enterKickClientSecret"
                                    )}
                                    value={kickClientSecret}
                                    onChange={(e) =>
                                        setKickClientSecret(e.target.value)
                                    }
                                    className="w-full bg-zinc-700 text-white rounded px-3 py-2 border border-zinc-600 focus:border-kick-green focus:ring-1 focus:ring-kick-green"
                                />
                            </div>
                            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                                <p className="text-xs text-blue-300">
                                    {t("setup.kickInstructions")}{" "}
                                    <a
                                        href="https://kick.com/settings/developer"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-400 underline hover:text-blue-300 cursor-pointer"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            window.electronAPI.openExternal(
                                                "https://kick.com/settings/developer"
                                            );
                                        }}
                                    >
                                        kick.com/settings/developer
                                    </a>{" "}
                                    {t("setup.kickInstructionsEnd")}{" "}
                                    {kickRedirectUri}
                                </p>
                                <p className="text-xs text-blue-300 mt-1">
                                    {t("setup.kickAdditionalInfo1")}
                                </p>
                                <p className="text-xs text-blue-300 mt-1">
                                    {t("setup.kickAdditionalInfo2")}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="p-5 pt-2 flex-shrink-0">
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowSetup(false)}
                                className="flex-1 bg-zinc-600 hover:bg-zinc-500 text-white py-2 px-4 rounded-lg transition-colors"
                            >
                                {t("common.cancel")}
                            </button>
                            <button
                                onClick={handleSecretsSubmit}
                                className="flex-1 bg-kick-green hover:bg-green-400 text-black font-semibold py-2 px-4 rounded-lg transition-colors"
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
