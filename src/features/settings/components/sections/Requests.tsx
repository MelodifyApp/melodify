// Song requests settings - Studio presentation over the existing config keys.

import { FolderOpen, X } from "lucide-react";
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
import type { RewardUnavailableReason } from "@/shared/rewards/rewardTitles";
import { validateField } from "../validation";
import {
    rewardPickerValue,
    REWARD_CONFIG_KEYS,
    type RewardPlatform,
} from "../../rewardPicker";
import { useRewardTitles } from "../useRewardTitles";
import {
    rewardTitleOrDefault,
    showSongFileControls,
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
    onTitleChange: (title: string) => void;
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
    onTitleChange,
}: RewardPickerProps) {
    const { t } = useTranslation();
    const state = useRewardTitles(platform);
    const pickerId = `requests-${platform}-reward-picker`;
    const canChoose = state.status === "ready";
    const selected = rewardPickerValue(title, state.titles);

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
                    options={state.titles.map((option) => ({
                        value: option,
                        label: option,
                    }))}
                    placeholder={t("requests.selectReward")}
                    onChange={(value) => {
                        if (value) onTitleChange(value);
                    }}
                    disabled={!canChoose}
                    aria-describedby={`${pickerId}-status`}
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
        </div>
    );
}

function CustomModerators({
    values,
    onChange,
}: {
    values: unknown;
    onChange: (values: string[]) => void;
}) {
    const { t } = useTranslation();
    const moderators = Array.isArray(values)
        ? values.filter((value): value is string => typeof value === "string")
        : [];
    const [draft, setDraft] = useState("");
    const [error, setError] = useState<string | null>(null);

    const addModerator = () => {
        const name = draft.trim();
        if (!name) return;
        const next = [...moderators, name];
        const validationError = validateField(
            "customModerators",
            next,
            t
        );
        if (validationError) {
            setError(validationError);
            return;
        }
        onChange(next);
        setDraft("");
        setError(null);
    };

    return (
        <div className="studio-moderators">
            <Field
                id="requests-moderator-input"
                label={t("commands.moderatorsList")}
                helper={t("commands.customModeratorsDesc")}
                error={error || undefined}
            >
                {(control) => (
                    <div className="studio-moderators-add-row">
                        <input
                            {...control}
                            className="studio-input"
                            value={draft}
                            onChange={(event) => {
                                setDraft(event.target.value);
                                if (error) setError(null);
                            }}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    addModerator();
                                }
                            }}
                            placeholder={t(
                                "commands.addModeratorPlaceholder"
                            )}
                            maxLength={50}
                            spellCheck={false}
                            autoCorrect="off"
                            autoCapitalize="off"
                        />
                        <Button
                            variant="secondary"
                            onClick={addModerator}
                            disabled={!draft.trim()}
                        >
                            {t("commands.addModerator")}
                        </Button>
                    </div>
                )}
            </Field>
            {moderators.length > 0 && (
                <ul
                    className="studio-moderator-list"
                    aria-label={t("commands.customModerators")}
                >
                    {moderators.map((name, index) => (
                        <li
                            key={`${name}-${index}`}
                            className="studio-moderator"
                        >
                            <span>{name}</span>
                            <IconButton
                                label={t("requests.removeModerator", { name })}
                                variant="ghost"
                                size="small"
                                onClick={() => {
                                    setError(null);
                                    onChange(
                                        moderators.filter(
                                            (_, itemIndex) =>
                                                itemIndex !== index
                                        )
                                    );
                                }}
                            >
                                <X size={14} />
                            </IconButton>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default function Requests({ config, onConfigChange }: RequestsProps) {
    const { t } = useTranslation();
    const [validationErrors, setValidationErrors] = useState<
        Record<string, string | null>
    >({});

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
                    helper={t("requests.anyoneCanRequestDesc")}
                    checked={config.canAnyonePlaySong === true}
                    onCheckedChange={(checked) =>
                        onConfigChange("canAnyonePlaySong", checked)
                    }
                />
                <Input
                    id="requests-prefix"
                    label={t("requests.commandPrefix")}
                    helper={t("requests.commandPrefixDesc")}
                    value={config.prefix || "!"}
                    onChange={(event) =>
                        handleInputChange("prefix", event.target.value)
                    }
                    placeholder="!"
                    maxLength={10}
                    wrapperClassName="studio-requests-prefix"
                    error={validationErrors.prefix || undefined}
                />
                <CustomModerators
                    values={config.customModerators}
                    onChange={(values) =>
                        onConfigChange("customModerators", values)
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
                    helper={t("requests.saveCurrentSongDesc")}
                    checked={config.saveCurrentSongToFile === true}
                    onCheckedChange={(checked) =>
                        onConfigChange("saveCurrentSongToFile", checked)
                    }
                />
                {showSongFileControls(config) && (
                    <Field
                        id="requests-song-file-path"
                        label={t("requests.filePath")}
                        helper={t("requests.filePathDesc")}
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
                                >
                                    <FolderOpen size={16} />
                                </IconButton>
                            </div>
                        )}
                    </Field>
                )}
            </SettingGroup>

            <SettingGroup heading={t("requests.songRequestRewards")}>
                <RewardPicker
                    platform="kick"
                    label={t("requests.kickRewardTitle")}
                    helper={t("requests.kickRewardHelper")}
                    title={rewardTitleOrDefault(config.rewardTitle)}
                    onTitleChange={(title) =>
                        handleInputChange(REWARD_CONFIG_KEYS.kick, title)
                    }
                />
                <RewardPicker
                    platform="twitch"
                    label={t("requests.twitchRewardTitle")}
                    helper={t("requests.twitchRewardHelper")}
                    title={rewardTitleOrDefault(config.twitchRewardTitle)}
                    onTitleChange={(title) =>
                        handleInputChange(REWARD_CONFIG_KEYS.twitch, title)
                    }
                />
            </SettingGroup>

            <SettingGroup heading={t("requests.chatResponses")}>
                <Toggle
                    id="requests-reply-success"
                    label={t("requests.replyOnSongRequest")}
                    helper={t("requests.replyOnSongRequestDesc")}
                    checked={config.replyOnSongRequest === true}
                    onCheckedChange={(checked) =>
                        onConfigChange("replyOnSongRequest", checked)
                    }
                />
                {config.replyOnSongRequest && (
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
                        error={
                            validationErrors.songRequestReplyTemplate ||
                            undefined
                        }
                    />
                )}
                <Toggle
                    id="requests-reply-error"
                    label={t("requests.replyOnErrors")}
                    helper={t("requests.replyOnErrorsDesc")}
                    checked={config.replyOnSongRequestError === true}
                    onCheckedChange={(checked) =>
                        onConfigChange("replyOnSongRequestError", checked)
                    }
                />
                {config.replyOnSongRequestError && (
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
                        error={
                            validationErrors.songRequestErrorTemplate ||
                            undefined
                        }
                    />
                )}
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
                {config.globalCooldownEnabled && (
                    <Field
                        id="requests-global-cooldown-seconds"
                        label={t("requests.globalCooldownDuration")}
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
                )}
                <Toggle
                    id="requests-per-user-cooldown"
                    label={t("requests.perUserCooldown")}
                    helper={t("requests.perUserCooldownDesc")}
                    checked={config.perUserCooldownEnabled === true}
                    onCheckedChange={(checked) =>
                        onConfigChange("perUserCooldownEnabled", checked)
                    }
                />
                {config.perUserCooldownEnabled && (
                    <Field
                        id="requests-per-user-cooldown-seconds"
                        label={t("requests.perUserCooldownDuration")}
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
                )}
                <Toggle
                    id="requests-reply-cooldown"
                    label={t("requests.replyOnCooldown")}
                    helper={t("requests.replyOnCooldownDesc")}
                    checked={config.replyOnCooldown === true}
                    onCheckedChange={(checked) =>
                        onConfigChange("replyOnCooldown", checked)
                    }
                />
                {config.replyOnCooldown && (
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
                    />
                )}
            </SettingGroup>
        </div>
    );
}
