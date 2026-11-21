// Song requests settings - Studio presentation over the existing config keys.

import { FolderOpen } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Button,
    Field,
    IconButton,
    Input,
    Select,
    SettingGroup,
    Toggle,
} from "@/ui/components/studio";
import {
    resolveRewardSelection,
    type RewardOption,
    type RewardUnavailableReason,
} from "@/shared/rewards/rewardTitles";
import { validateField } from "../validation";
import {
    REWARD_CONFIG_KEYS,
    REWARD_ID_CONFIG_KEYS,
    type RewardPlatform,
} from "../../rewardPicker";
import { useRewardTitles } from "../useRewardTitles";
import {
    enabledFieldError,
    rewardTitleOrDefault,
    songFileControlsEnabled,
} from "../requestsView";

interface RequestsProps {
    config: any;
    onConfigChange: (key: string, value: any) => void;
    searchQuery?: string;
}

interface RewardPickerProps {
    platform: RewardPlatform;
    label: string;
    helper: string;
    title: string;
    rewardId: string;
    onTitleChange: (title: string) => void;
    onSelect: (reward: RewardOption) => void;
}

function RewardListStatus({
    id,
    status,
    reason,
}: {
    id?: string;
    status: "loading" | "ready" | "empty" | "unavailable";
    reason?: RewardUnavailableReason;
}) {
    const { t } = useTranslation();
    let message: string;
    let warning = false;
    switch (status) {
        case "loading":
            message = t("requests.rewardListLoading");
            break;
        case "ready":
            message = t("requests.rewardListReady");
            break;
        case "empty":
            warning = true;
            message = t("requests.rewardListEmpty");
            break;
        case "unavailable":
            warning = true;
            message =
                reason === "missing-scope"
                    ? t("requests.rewardListMissingScope")
                    : reason === "not-configured"
                      ? t("requests.rewardListNotConfigured")
                      : reason === "provider-error"
                        ? t("requests.rewardListError")
                        : t("requests.rewardListUnavailable");
            break;
    }

    return (
        <p
            id={id}
            className="studio-reward-status"
            data-tone={warning ? "warning" : undefined}
            role="status"
            aria-live="polite"
        >
            {message}
        </p>
    );
}

function RewardPicker({
    platform,
    label,
    helper,
    title,
    rewardId,
    onTitleChange,
    onSelect,
}: RewardPickerProps) {
    const { t } = useTranslation();
    const state = useRewardTitles(platform);
    const pickerId = `requests-${platform}-reward-picker`;
    const canChoose = state.status === "ready";
    const resolution =
        state.status === "ready"
            ? resolveRewardSelection(rewardId, title, state.rewards)
            : null;
    const selected =
        resolution?.status === "selected" && resolution.source === "id"
            ? resolution.option.id
            : "";
    const titleCounts = new Map<string, number>();
    for (const reward of state.rewards) {
        titleCounts.set(
            reward.title,
            (titleCounts.get(reward.title) || 0) + 1
        );
    }
    const reselectKey =
        resolution?.status === "reselect"
            ? resolution.reason === "duplicate-title"
                ? "requests.rewardReselectDuplicate"
                : resolution.reason === "missing-title"
                  ? "requests.rewardReselectMissingTitle"
                  : "requests.rewardReselectMissingId"
            : null;

    return (
        <div className="studio-reward" role="group" aria-label={label}>
            <div className="studio-reward-fields">
                <Input
                    id={`requests-${platform}-reward-title`}
                    label={label}
                    helper={helper}
                    value={title}
                    onChange={(event) => onTitleChange(event.target.value)}
                    placeholder="Song Request"
                    maxLength={100}
                />
                <Select
                    id={pickerId}
                    label={
                        platform === "kick"
                            ? t("requests.chooseKickReward")
                            : t("requests.chooseTwitchReward")
                    }
                    helper={t("requests.rewardPickerHint")}
                    value={selected}
                    options={state.rewards.map((reward) => ({
                        value: reward.id,
                        label:
                            (titleCounts.get(reward.title) || 0) > 1
                                ? t("requests.rewardOptionWithId", {
                                      title: reward.title,
                                      id: reward.id,
                                  })
                                : reward.title,
                    }))}
                    placeholder={t("requests.selectReward")}
                    onChange={(value) => {
                        const reward = state.rewards.find(
                            (candidate) => candidate.id === value
                        );
                        if (reward) onSelect(reward);
                    }}
                    disabled={!canChoose}
                    aria-describedby={
                        reselectKey
                            ? `${pickerId}-status ${pickerId}-reselect`
                            : `${pickerId}-status`
                    }
                />
            </div>
            <div className="studio-reward-footer">
                <RewardListStatus
                    id={`${pickerId}-status`}
                    status={state.status}
                    reason={
                        state.status === "unavailable"
                            ? state.reason
                            : undefined
                    }
                />
                <Button
                    variant="ghost"
                    size="small"
                    onClick={() => void state.reload()}
                    loading={state.status === "loading"}
                    aria-label={t("requests.refreshRewards")}
                >
                    {t("requests.refreshRewards")}
                </Button>
            </div>
            {reselectKey && (
                <p
                    id={`${pickerId}-reselect`}
                    className="studio-reward-status"
                    data-tone="warning"
                    role="status"
                    aria-live="polite"
                >
                    {t(reselectKey)}
                </p>
            )}
        </div>
    );
}

export default function Requests({ config, onConfigChange }: RequestsProps) {
    const { t } = useTranslation();
    const [validationErrors, setValidationErrors] = useState<
        Record<string, string | null>
    >({});
    const songFileEnabled = songFileControlsEnabled(config);

    const handleInputChange = (key: string, value: string) => {
        const error = validateField(key, value, t);
        setValidationErrors((current) => ({ ...current, [key]: error }));
        onConfigChange(key, value);
    };

    const handleBrowseFilePath = async () => {
        try {
            const filePath = await window.electronAPI.selectSongFilePath();
            if (filePath) {
                // The main process already persisted the dialog selection;
                // this only mirrors it locally for display (the ordinary
                // config save excludes currentSongFilePath).
                onConfigChange("currentSongFilePath", filePath);
            }
        } catch (error) {
            console.error("Failed to select file path:", error);
        }
    };

    return (
        <div className="studio-settings-api studio-requests">
            <div className="studio-settings-api-heading">
                <h2>{t("requests.title")}</h2>
            </div>

            <SettingGroup heading={t("requests.whoCanRequest")}>
                <Toggle
                    id="requests-anyone"
                    label={t("requests.anyoneCanRequest")}
                    helper={
                        config.canAnyonePlaySong
                            ? undefined
                            : t("requests.allowedRolesOnly")
                    }
                    checked={config.canAnyonePlaySong === true}
                    onCheckedChange={(checked) =>
                        onConfigChange("canAnyonePlaySong", checked)
                    }
                />
                <Toggle
                    id="requests-require-live"
                    label={t("requests.requireLive")}
                    helper={t("requests.requireLiveHelper")}
                    checked={config.requireLiveForRequests === true}
                    onCheckedChange={(checked) =>
                        onConfigChange("requireLiveForRequests", checked)
                    }
                />
            </SettingGroup>

            <SettingGroup heading={t("requests.currentSongDisplay")}>
                <Input
                    id="requests-song-format"
                    label={t("requests.songFormatTemplate")}
                    helper={`${t("requests.availableVariables")}: {title}, {artist}`}
                    value={config.currentSongFormat || "{title} - {artist}"}
                    onChange={(event) =>
                        handleInputChange(
                            "currentSongFormat",
                            event.target.value
                        )
                    }
                    placeholder="{title} - {artist}"
                    error={validationErrors.currentSongFormat || undefined}
                />
                <Toggle
                    id="requests-save-current-song"
                    label={t("requests.saveCurrentSong")}
                    checked={config.saveCurrentSongToFile === true}
                    onCheckedChange={(checked) =>
                        onConfigChange("saveCurrentSongToFile", checked)
                    }
                />
                <Field
                    id="requests-song-file-path"
                    label={t("requests.filePath")}
                    disabled={!songFileEnabled}
                >
                    {(control) => (
                        <div className="studio-requests-path-row">
                            <input
                                {...control}
                                className="studio-input"
                                value={config.currentSongFilePath || ""}
                                placeholder="C:\Users\Username\current-song.txt"
                                readOnly
                                spellCheck={false}
                                autoCorrect="off"
                                autoCapitalize="off"
                            />
                            <IconButton
                                label={t("requests.chooseFilePath")}
                                title={t("requests.chooseFilePathTitle")}
                                onClick={handleBrowseFilePath}
                                disabled={!songFileEnabled}
                            >
                                <FolderOpen size={16} />
                            </IconButton>
                        </div>
                    )}
                </Field>
            </SettingGroup>

            <SettingGroup heading={t("requests.songRequestRewards")}>
                <RewardPicker
                    platform="kick"
                    label={t("requests.kickRewardTitle")}
                    helper={t("requests.kickRewardHelper")}
                    title={rewardTitleOrDefault(config.rewardTitle)}
                    rewardId={String(config.rewardId || "")}
                    onTitleChange={(title) => {
                        onConfigChange(REWARD_ID_CONFIG_KEYS.kick, "");
                        handleInputChange(REWARD_CONFIG_KEYS.kick, title);
                    }}
                    onSelect={(reward) => {
                        onConfigChange(REWARD_ID_CONFIG_KEYS.kick, reward.id);
                        handleInputChange(
                            REWARD_CONFIG_KEYS.kick,
                            reward.title
                        );
                    }}
                />
                <RewardPicker
                    platform="twitch"
                    label={t("requests.twitchRewardTitle")}
                    helper={t("requests.twitchRewardHelper")}
                    title={rewardTitleOrDefault(config.twitchRewardTitle)}
                    rewardId={String(config.twitchRewardId || "")}
                    onTitleChange={(title) => {
                        onConfigChange(REWARD_ID_CONFIG_KEYS.twitch, "");
                        handleInputChange(
                            REWARD_CONFIG_KEYS.twitch,
                            title
                        );
                    }}
                    onSelect={(reward) => {
                        onConfigChange(
                            REWARD_ID_CONFIG_KEYS.twitch,
                            reward.id
                        );
                        handleInputChange(
                            REWARD_CONFIG_KEYS.twitch,
                            reward.title
                        );
                    }}
                />
            </SettingGroup>

            <SettingGroup heading={t("requests.chatResponses")}>
                <Toggle
                    id="requests-reply-success"
                    label={t("requests.replyOnSongRequest")}
                    checked={config.replyOnSongRequest === true}
                    onCheckedChange={(checked) =>
                        onConfigChange("replyOnSongRequest", checked)
                    }
                />
                <Input
                    id="requests-success-template"
                    label={t("requests.successMessageTemplate")}
                    helper={`${t("requests.availableVariables")}: {title}, {artist}`}
                    value={config.songRequestReplyTemplate || ""}
                    onChange={(event) =>
                        handleInputChange(
                            "songRequestReplyTemplate",
                            event.target.value
                        )
                    }
                    placeholder="✅ Added to queue: {title} by {artist}"
                    disabled={config.replyOnSongRequest !== true}
                    error={enabledFieldError(
                        config.replyOnSongRequest === true,
                        validationErrors.songRequestReplyTemplate
                    )}
                />
                <Toggle
                    id="requests-reply-error"
                    label={t("requests.replyOnErrors")}
                    checked={config.replyOnSongRequestError === true}
                    onCheckedChange={(checked) =>
                        onConfigChange("replyOnSongRequestError", checked)
                    }
                />
                <Input
                    id="requests-error-template"
                    label={t("requests.errorMessageTemplate")}
                    helper={`${t("requests.availableVariables")}: {error}`}
                    value={config.songRequestErrorTemplate || ""}
                    onChange={(event) =>
                        handleInputChange(
                            "songRequestErrorTemplate",
                            event.target.value
                        )
                    }
                    placeholder="❌ Song not found or unavailable. Try a different search."
                    disabled={config.replyOnSongRequestError !== true}
                    error={enabledFieldError(
                        config.replyOnSongRequestError === true,
                        validationErrors.songRequestErrorTemplate
                    )}
                />
            </SettingGroup>

            <SettingGroup heading={t("requests.cooldowns")}>
                <Toggle
                    id="requests-global-cooldown"
                    label={t("requests.globalCooldown")}
                    helper={t("requests.globalCooldownDesc")}
                    checked={config.globalCooldownEnabled === true}
                    onCheckedChange={(checked) =>
                        onConfigChange("globalCooldownEnabled", checked)
                    }
                />
                <Field
                    id="requests-global-cooldown-seconds"
                    label={t("requests.globalCooldownDuration")}
                    disabled={config.globalCooldownEnabled !== true}
                >
                    {(control) => (
                        <div className="studio-requests-number-row">
                            <input
                                {...control}
                                className="studio-input"
                                type="number"
                                min={1}
                                spellCheck={false}
                                autoCorrect="off"
                                autoCapitalize="off"
                                value={config.globalCooldownSeconds || "30"}
                                placeholder="30"
                                onChange={(event) =>
                                    handleInputChange(
                                        "globalCooldownSeconds",
                                        event.target.value
                                    )
                                }
                            />
                            <span className="studio-requests-unit">
                                {t("requests.seconds")}
                            </span>
                        </div>
                    )}
                </Field>
                <Toggle
                    id="requests-per-user-cooldown"
                    label={t("requests.perUserCooldown")}
                    helper={t("requests.perUserCooldownDesc")}
                    checked={config.perUserCooldownEnabled === true}
                    onCheckedChange={(checked) =>
                        onConfigChange("perUserCooldownEnabled", checked)
                    }
                />
                <Field
                    id="requests-per-user-cooldown-seconds"
                    label={t("requests.perUserCooldownDuration")}
                    disabled={config.perUserCooldownEnabled !== true}
                >
                    {(control) => (
                        <div className="studio-requests-number-row">
                            <input
                                {...control}
                                className="studio-input"
                                type="number"
                                min={1}
                                spellCheck={false}
                                autoCorrect="off"
                                autoCapitalize="off"
                                value={config.perUserCooldownSeconds || "60"}
                                placeholder="60"
                                onChange={(event) =>
                                    handleInputChange(
                                        "perUserCooldownSeconds",
                                        event.target.value
                                    )
                                }
                            />
                            <span className="studio-requests-unit">
                                {t("requests.seconds")}
                            </span>
                        </div>
                    )}
                </Field>
                <Toggle
                    id="requests-reply-cooldown"
                    label={t("requests.replyOnCooldown")}
                    checked={config.replyOnCooldown === true}
                    onCheckedChange={(checked) =>
                        onConfigChange("replyOnCooldown", checked)
                    }
                />
                <Input
                    id="requests-cooldown-template"
                    label={t("requests.cooldownMessageTemplate")}
                    helper={`${t("requests.cooldownTemplateDesc")} {time}`}
                    value={config.cooldownMessageTemplate || ""}
                    onChange={(event) =>
                        handleInputChange(
                            "cooldownMessageTemplate",
                            event.target.value
                        )
                    }
                    placeholder="⏰ Please wait {time} seconds before requesting another song."
                    disabled={config.replyOnCooldown !== true}
                />
            </SettingGroup>
        </div>
    );
}
