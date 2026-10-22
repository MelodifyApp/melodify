// Authentication section - cleaner UI for existing Kick & Spotify auth

import { useState } from "react";
import {
    Shield,
    Eye,
    EyeOff,
    ExternalLink,
    CheckCircle,
    AlertCircle,
    Copy,
} from "lucide-react";
import { useTranslation } from "react-i18next";

interface AuthenticationProps {
    config: any;
    onConfigChange: (key: string, value: any) => void;
    validationErrors: Record<string, string>;
}

export default function Authentication({
    config,
    onConfigChange,
    validationErrors,
}: AuthenticationProps) {
    const { t } = useTranslation();
    const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
    const [authStates, setAuthStates] = useState<
        Record<string, "idle" | "connecting" | "success" | "error">
    >({});

    const toggleSecretVisibility = (field: string) => {
        setShowSecrets((prev) => ({
            ...prev,
            [field]: !prev[field],
        }));
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    const handleAuth = async (platform: "kick" | "spotify") => {
        setAuthStates((prev) => ({ ...prev, [platform]: "connecting" }));

        try {
            await window.electronAPI.invoke(`${platform}:auth`);
            setAuthStates((prev) => ({ ...prev, [platform]: "success" }));
        } catch (error) {
            setAuthStates((prev) => ({ ...prev, [platform]: "error" }));
        }

        setTimeout(() => {
            setAuthStates((prev) => ({ ...prev, [platform]: "idle" }));
        }, 3000);
    };

    const AuthCard = ({
        platform,
        title,
        description,
        color,
        fields,
        isConnected,
        connectionInfo,
    }: {
        platform: "kick" | "spotify";
        title: string;
        description: string;
        color: string;
        fields: Array<{
            key: string;
            label: string;
            placeholder: string;
            isSecret?: boolean;
        }>;
        isConnected: boolean;
        connectionInfo?: string;
    }) => {
        const colorClasses =
            {
                green: "border-green-500/30 bg-green-500/10",
                purple: "border-purple-500/30 bg-purple-500/10",
                blue: "border-blue-500/30 bg-blue-500/10",
            }[color] || "border-zinc-700/50 bg-zinc-800/30";

        const authState = authStates[platform] || "idle";
        const hasClientSecret =
            platform === "kick"
                ? config.hasKickClientSecret === true
                : config.hasSpotifyClientSecret === true;

        return (
            <div className={`rounded-xl border p-6 ${colorClasses}`}>
                <div className="flex items-start justify-between mb-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-white">
                                {title}
                            </h3>
                            {isConnected && (
                                <div className="flex items-center gap-1 px-2 py-1 bg-green-500/20 border border-green-500/30 rounded-full">
                                    <CheckCircle className="w-3 h-3 text-green-400" />
                                    <span className="text-xs text-green-300">
                                        Connected
                                    </span>
                                </div>
                            )}
                        </div>
                        <p className="text-zinc-400 text-sm">{description}</p>
                        {connectionInfo && (
                            <p className="text-zinc-300 text-sm mt-1">
                                {connectionInfo}
                            </p>
                        )}
                    </div>

                    <button
                        onClick={() =>
                            window.electronAPI?.openExternal?.(
                                platform === "kick"
                                    ? "https://kick.com/developer"
                                    : "https://developer.spotify.com/dashboard"
                            )
                        }
                        className="text-zinc-400 hover:text-white transition-colors"
                    >
                        <ExternalLink className="w-4 h-4" />
                    </button>
                </div>

                <div className="space-y-4">
                    {fields.map((field) => (
                        <div key={field.key}>
                            <label className="block text-sm font-medium text-white mb-2">
                                {field.label}
                            </label>
                            <div className="relative">
                                <input
                                    type={
                                        field.isSecret &&
                                        !showSecrets[field.key]
                                            ? "password"
                                            : "text"
                                    }
                                    value={config[field.key] || ""}
                                    onChange={(e) =>
                                        onConfigChange(
                                            field.key,
                                            e.target.value
                                        )
                                    }
                                    placeholder={field.placeholder}
                                    className={`w-full px-3 py-2.5 bg-zinc-900/50 border rounded-lg text-white placeholder-zinc-500 focus:ring-1 transition-all ${
                                        validationErrors[field.key]
                                            ? "border-red-500/50 focus:border-red-500 focus:ring-red-500/20"
                                            : "border-zinc-600/50 focus:border-blue-500/50 focus:ring-blue-500/20"
                                    }`}
                                />
                                {field.isSecret && (
                                    <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                                        {config[field.key] && (
                                            <button
                                                onClick={() =>
                                                    copyToClipboard(
                                                        config[field.key]
                                                    )
                                                }
                                                className="p-1 text-zinc-400 hover:text-white transition-colors"
                                                title="Copy to clipboard"
                                            >
                                                <Copy className="w-4 h-4" />
                                            </button>
                                        )}
                                        <button
                                            onClick={() =>
                                                toggleSecretVisibility(
                                                    field.key
                                                )
                                            }
                                            className="p-1 text-zinc-400 hover:text-white transition-colors"
                                        >
                                            {showSecrets[field.key] ? (
                                                <EyeOff className="w-4 h-4" />
                                            ) : (
                                                <Eye className="w-4 h-4" />
                                            )}
                                        </button>
                                    </div>
                                )}
                            </div>
                            {validationErrors[field.key] && (
                                <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    {validationErrors[field.key]}
                                </p>
                            )}
                        </div>
                    ))}

                    <div className="mt-4 p-3 bg-zinc-900/50 rounded-lg border border-zinc-700/50">
                        <h4 className="text-sm font-medium text-white mb-2">
                            Redirect URI
                        </h4>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 px-2 py-1 bg-zinc-800/50 rounded text-xs text-zinc-300 font-mono">
                                {config[`${platform}RedirectUri`] ||
                                    `http://localhost:${platform === "kick" ? "8889" : "8888"}/callback`}
                            </code>
                            <button
                                onClick={() =>
                                    copyToClipboard(
                                        config[`${platform}RedirectUri`] || ""
                                    )
                                }
                                className="p-1 text-zinc-400 hover:text-white transition-colors"
                                title="Copy redirect URI"
                            >
                                <Copy className="w-3 h-3" />
                            </button>
                        </div>
                        <p className="text-xs text-zinc-500 mt-1">
                            Copy this URL to your {platform} app settings
                        </p>
                    </div>

                    <button
                        onClick={() => handleAuth(platform)}
                        disabled={
                            !config[`${platform}ClientId`] ||
                            !hasClientSecret ||
                            authState === "connecting"
                        }
                        className={`w-full py-3 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                            isConnected
                                ? "bg-green-500/20 border border-green-500/30 text-green-300 hover:bg-green-500/30"
                                : "bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30"
                        }`}
                    >
                        {authState === "connecting" && "Connecting..."}
                        {authState === "success" && `✓ ${t("common.success")}`}
                        {authState === "error" && "✗ Connection Failed"}
                        {authState === "idle" &&
                            (isConnected
                                ? `Reconnect to ${title}`
                                : `Connect to ${title}`)}
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-8">
            <div className="flex items-center gap-3 mb-6">
                <Shield className="w-6 h-6 text-blue-400" />
                <div>
                    <h2 className="text-xl font-semibold text-white">
                        API Authentication
                    </h2>
                    <p className="text-zinc-400 text-sm">
                        Connect your Kick and Spotify accounts securely
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <AuthCard
                    platform="kick"
                    title="Kick.com"
                    description="Connect to your Kick channel to read chat and send messages"
                    color="green"
                    isConnected={config.hasKickAccessToken === true}
                    connectionInfo={
                        config.username
                            ? `Connected as ${config.username}`
                            : undefined
                    }
                    fields={[
                        {
                            key: "kickClientId",
                            label: "Client ID",
                            placeholder: "Your Kick application client ID",
                        },
                        {
                            key: "kickClientSecret",
                            label: "Client Secret",
                            placeholder: "Your Kick application client secret",
                            isSecret: true,
                        },
                    ]}
                />

                <AuthCard
                    platform="spotify"
                    title="Spotify"
                    description="Connect to Spotify to control music playback and add songs to queue"
                    color="purple"
                    isConnected={config.hasSpotifyAccessToken === true}
                    fields={[
                        {
                            key: "spotifyClientId",
                            label: "Client ID",
                            placeholder: "Your Spotify application client ID",
                        },
                        {
                            key: "spotifyClientSecret",
                            label: "Client Secret",
                            placeholder:
                                "Your Spotify application client secret",
                            isSecret: true,
                        },
                    ]}
                />
            </div>

            <div className="bg-zinc-800/30 rounded-xl border border-zinc-700/50 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">
                    Setup Instructions
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <h4 className="font-medium text-green-300 mb-2">
                            Kick Setup
                        </h4>
                        <ol className="text-sm text-zinc-300 space-y-1 list-decimal list-inside">
                            <li>Visit the Kick Developer Portal</li>
                            <li>Create a new application</li>
                            <li>Copy your Client ID and Client Secret</li>
                            <li>
                                Set the redirect URI to:{" "}
                                <code className="text-xs bg-zinc-700 px-1 rounded">
                                    http://localhost:8889/callback
                                </code>
                            </li>
                            <li>Paste credentials above and connect</li>
                        </ol>
                    </div>
                    <div>
                        <h4 className="font-medium text-purple-300 mb-2">
                            Spotify Setup
                        </h4>
                        <ol className="text-sm text-zinc-300 space-y-1 list-decimal list-inside">
                            <li>Visit the Spotify Developer Dashboard</li>
                            <li>Create a new app</li>
                            <li>Copy your Client ID and Client Secret</li>
                            <li>
                                Add redirect URI:{" "}
                                <code className="text-xs bg-zinc-700 px-1 rounded">
                                    http://127.0.0.1:8888/callback
                                </code>
                            </li>
                            <li>Paste credentials above and connect</li>
                        </ol>
                    </div>
                </div>
            </div>
        </div>
    );
}
