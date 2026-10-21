// Music section - compact UI for existing music/song request settings

import Toggle from "@/ui/components/Toggle";
import Input from "@/ui/components/Input";
import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { validateField } from "../validation";

interface RequestsProps {
    config: any;
    onConfigChange: (key: string, value: any) => void;
    searchQuery?: string;
}

export default function Requests({ config, onConfigChange }: RequestsProps) {
    const { t } = useTranslation();
    const [validationErrors, setValidationErrors] = useState<
        Record<string, string | null>
    >({});

    const handleInputChange = (key: string, value: string) => {
        // Validate the field
        const error = validateField(key, value);
        setValidationErrors((prev) => ({
            ...prev,
            [key]: error,
        }));

        // Update config
        onConfigChange(key, value);
    };

    const handleBrowseFilePath = async () => {
        try {
            const filePath = await window.electronAPI.selectSongFilePath();
            if (filePath) {
                onConfigChange("currentSongFilePath", filePath);
            }
        } catch (error) {
            console.error("Failed to select file path:", error);
        }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-lg font-semibold text-white">
                {t("requests.title")}
            </h2>

            <div className="settings-section">
                <h3 className="text-base font-medium text-white mb-4">
                    {t("requests.basicSettings")}
                </h3>

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <label className="text-sm font-medium text-zinc-200">
                                {t("requests.anyoneCanRequest")}
                            </label>
                            <span className="text-xs text-zinc-400">
                                {t("requests.anyoneCanRequestDesc")}
                            </span>
                        </div>
                        <Toggle
                            checked={config.canAnyonePlaySong || false}
                            onChange={(checked: any) =>
                                onConfigChange("canAnyonePlaySong", checked)
                            }
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-200 mb-2">
                            {t("requests.commandPrefix")}
                        </label>
                        <Input
                            value={config.prefix || "!"}
                            onChange={(e) =>
                                handleInputChange("prefix", e.target.value)
                            }
                            placeholder="!"
                            maxLength={10}
                            className="max-w-24"
                            error={!!validationErrors.prefix}
                            helperText={
                                validationErrors.prefix ||
                                t("requests.commandPrefixDesc")
                            }
                        />
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <h3 className="text-base font-medium text-white mb-4">
                    {t("requests.currentSongDisplay")}
                </h3>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-zinc-200 mb-2">
                            {t("requests.songFormatTemplate")}
                        </label>
                        <Input
                            value={
                                config.currentSongFormat || "{title} - {artist}"
                            }
                            onChange={(e) =>
                                handleInputChange(
                                    "currentSongFormat",
                                    e.target.value
                                )
                            }
                            placeholder="{title} - {artist}"
                            error={!!validationErrors.currentSongFormat}
                            helperText={
                                validationErrors.currentSongFormat ||
                                `${t("requests.availableVariables")}: {title}, {artist}`
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <label className="text-sm font-medium text-zinc-200">
                                {t("requests.saveCurrentSong")}
                            </label>
                            <span className="text-xs text-zinc-400">
                                {t("requests.saveCurrentSongDesc")}
                            </span>
                        </div>
                        <Toggle
                            checked={config.saveCurrentSongToFile || false}
                            onChange={(checked: any) =>
                                onConfigChange("saveCurrentSongToFile", checked)
                            }
                        />
                    </div>

                    {config.saveCurrentSongToFile && (
                        <div className="pl-4 border-l-2 border-zinc-600">
                            <label className="block text-sm font-medium text-zinc-200 mb-2">
                                {t("requests.filePath")}
                            </label>
                            <div className="flex gap-2 h-10">
                                <input
                                    value={config.currentSongFilePath || ""}
                                    placeholder="C:\Users\Username\current-song.txt"
                                    readOnly
                                    className="flex-1 h-full px-3 bg-zinc-700/50 border border-zinc-700 rounded text-white placeholder-zinc-400 cursor-not-allowed focus:outline-none"
                                />
                                <button
                                    onClick={handleBrowseFilePath}
                                    className="px-3 h-full bg-zinc-600 hover:bg-zinc-500 border border-zinc-500 rounded text-white text-sm flex items-center gap-2 transition-colors"
                                    title={t("requests.browse")}
                                >
                                    <FolderOpen size={16} />
                                    {t("requests.browse")}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="settings-section">
                <h3 className="text-base font-medium text-white mb-4">
                    Song Request Rewards
                </h3>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-zinc-200 mb-2">
                            Kick reward title
                        </label>
                        <Input
                            value={config.rewardTitle || "Song Request"}
                            onChange={(e) =>
                                handleInputChange("rewardTitle", e.target.value)
                            }
                            placeholder="Song Request"
                        />
                        <p className="mt-1 text-xs text-zinc-400">
                            Matches Kick reward redemptions.
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-200 mb-2">
                            Twitch channel points reward title
                        </label>
                        <Input
                            value={config.twitchRewardTitle || "Song Request"}
                            onChange={(e) =>
                                handleInputChange(
                                    "twitchRewardTitle",
                                    e.target.value
                                )
                            }
                            placeholder="Song Request"
                        />
                        <p className="mt-1 text-xs text-zinc-400">
                            Matches Twitch channel point redemptions.
                        </p>
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <h3 className="text-base font-medium text-white mb-4">
                    {t("requests.chatResponses")}
                </h3>

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <label className="text-sm font-medium text-zinc-200">
                                {t("requests.replyOnSongRequest")}
                            </label>
                            <span className="text-xs text-zinc-400">
                                {t("requests.replyOnSongRequestDesc")}
                            </span>
                        </div>
                        <Toggle
                            checked={config.replyOnSongRequest || false}
                            onChange={(checked: any) =>
                                onConfigChange("replyOnSongRequest", checked)
                            }
                        />
                    </div>

                    {config.replyOnSongRequest && (
                        <div className="pl-4 border-l-2 border-zinc-600">
                            <label className="block text-sm font-medium text-zinc-200 mb-2">
                                {t("requests.successMessageTemplate")}
                            </label>
                            <Input
                                value={config.songRequestReplyTemplate || ""}
                                onChange={(e) =>
                                    handleInputChange(
                                        "songRequestReplyTemplate",
                                        e.target.value
                                    )
                                }
                                placeholder="✅ Added to queue: {title} by {artist}"
                            />
                        </div>
                    )}

                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <label className="text-sm font-medium text-zinc-200">
                                {t("requests.replyOnErrors")}
                            </label>
                            <span className="text-xs text-zinc-400">
                                {t("requests.replyOnErrorsDesc")}
                            </span>
                        </div>
                        <Toggle
                            checked={config.replyOnSongRequestError || false}
                            onChange={(checked: any) =>
                                onConfigChange(
                                    "replyOnSongRequestError",
                                    checked
                                )
                            }
                        />
                    </div>

                    {config.replyOnSongRequestError && (
                        <div className="pl-4 border-l-2 border-zinc-600">
                            <label className="block text-sm font-medium text-zinc-200 mb-2">
                                {t("requests.errorMessageTemplate")}
                            </label>
                            <Input
                                value={config.songRequestErrorTemplate || ""}
                                onChange={(e) =>
                                    handleInputChange(
                                        "songRequestErrorTemplate",
                                        e.target.value
                                    )
                                }
                                placeholder="❌ Song not found or unavailable. Try a different search."
                            />
                        </div>
                    )}
                </div>
            </div>

            <div className="settings-section">
                <h3 className="text-base font-medium text-white mb-4">
                    {t("requests.cooldowns")}
                </h3>

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <label className="text-sm font-medium text-zinc-200">
                                {t("requests.globalCooldown")}
                            </label>
                            <span className="text-xs text-zinc-400">
                                {t("requests.globalCooldownDesc")}
                            </span>
                        </div>
                        <Toggle
                            checked={config.globalCooldownEnabled || false}
                            onChange={(checked: any) =>
                                onConfigChange("globalCooldownEnabled", checked)
                            }
                        />
                    </div>

                    {config.globalCooldownEnabled && (
                        <div className="pl-4 border-l-2 border-zinc-600">
                            <label className="block text-sm font-medium text-zinc-200 mb-2">
                                {t("requests.globalCooldownDuration")}
                            </label>
                            <div className="flex items-center gap-2 w-min">
                                <Input
                                    type="number"
                                    value={config.globalCooldownSeconds || "30"}
                                    onChange={(e) =>
                                        handleInputChange(
                                            "globalCooldownSeconds",
                                            e.target.value
                                        )
                                    }
                                    placeholder="30"
                                    className="w-20"
                                    min="1"
                                />
                                <span className="text-sm text-zinc-400">
                                    {t("requests.seconds")}
                                </span>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <label className="text-sm font-medium text-zinc-200">
                                {t("requests.perUserCooldown")}
                            </label>
                            <span className="text-xs text-zinc-400">
                                {t("requests.perUserCooldownDesc")}
                            </span>
                        </div>
                        <Toggle
                            checked={config.perUserCooldownEnabled || false}
                            onChange={(checked: any) =>
                                onConfigChange(
                                    "perUserCooldownEnabled",
                                    checked
                                )
                            }
                        />
                    </div>

                    {config.perUserCooldownEnabled && (
                        <div className="pl-4 border-l-2 border-zinc-600">
                            <label className="block text-sm font-medium text-zinc-200 mb-2">
                                {t("requests.perUserCooldownDuration")}
                            </label>
                            <div className="flex items-center gap-2 w-min">
                                <Input
                                    type="number"
                                    value={
                                        config.perUserCooldownSeconds || "60"
                                    }
                                    onChange={(e) =>
                                        handleInputChange(
                                            "perUserCooldownSeconds",
                                            e.target.value
                                        )
                                    }
                                    placeholder="60"
                                    className="w-20"
                                    min="1"
                                />
                                <span className="text-sm text-zinc-400">
                                    {t("requests.seconds")}
                                </span>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <label className="text-sm font-medium text-zinc-200">
                                {t("requests.replyOnCooldown")}
                            </label>
                            <span className="text-xs text-zinc-400">
                                {t("requests.replyOnCooldownDesc")}
                            </span>
                        </div>
                        <Toggle
                            checked={config.replyOnCooldown || false}
                            onChange={(checked: any) =>
                                onConfigChange("replyOnCooldown", checked)
                            }
                        />
                    </div>

                    {config.replyOnCooldown && (
                        <div className="pl-4 border-l-2 border-zinc-600">
                            <label className="block text-sm font-medium text-zinc-200 mb-2">
                                {t("requests.cooldownMessageTemplate")}
                            </label>
                            <Input
                                value={config.cooldownMessageTemplate || ""}
                                onChange={(e) =>
                                    handleInputChange(
                                        "cooldownMessageTemplate",
                                        e.target.value
                                    )
                                }
                                placeholder="⏰ Please wait {time} seconds before requesting another song."
                            />
                            <p className="text-xs text-zinc-400 mt-1">
                                {t("requests.cooldownTemplateDesc")}{" "}
                                <code className="bg-zinc-700 px-1 rounded text-zinc-300">
                                    {"{time}"}
                                </code>{" "}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
