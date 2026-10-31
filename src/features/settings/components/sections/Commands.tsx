// Commands settings - Studio layout over the existing command config.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Hash, MessageSquare, X } from "lucide-react";
import {
    Button,
    Field,
    IconButton,
    Input,
    SettingGroup,
    Toggle,
} from "@/ui/components/studio";
import {
    validateCommandAlias,
    validateField,
    validateTemplate,
} from "../validation";

interface CommandsProps {
    config: any;
    commands: any[];
    onConfigChange: (key: string, value: any) => void;
    onCommandToggle: (name: string, enabled: boolean) => void;
}

function StringListEditor({
    id,
    label,
    helper,
    placeholder,
    values,
    onChange,
    maxLength,
    validate,
    addLabel,
    removeLabel,
}: {
    id: string;
    label: string;
    helper?: string;
    placeholder: string;
    values: string[];
    onChange: (values: string[]) => void;
    maxLength: number;
    validate: (candidate: string, current: string[]) => string | null;
    addLabel: string;
    removeLabel: (value: string) => string;
}) {
    const [draft, setDraft] = useState("");
    const [error, setError] = useState<string | null>(null);

    const addValue = () => {
        const value = draft.trim();
        if (!value) return;
        const validationError = validate(value, values);
        if (validationError) {
            setError(validationError);
            return;
        }
        onChange([...values, value]);
        setDraft("");
        setError(null);
    };

    return (
        <div className="studio-string-list">
            <Field
                id={id}
                label={label}
                helper={helper}
                error={error || undefined}
            >
                {(control) => (
                    <div className="studio-string-list-row">
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
                                    addValue();
                                }
                            }}
                            placeholder={placeholder}
                            maxLength={maxLength}
                            spellCheck={false}
                            autoCorrect="off"
                            autoCapitalize="off"
                        />
                        <Button
                            variant="secondary"
                            onClick={addValue}
                            disabled={!draft.trim()}
                        >
                            {addLabel}
                        </Button>
                    </div>
                )}
            </Field>
            {values.length > 0 && (
                <ul className="studio-token-list" aria-label={label}>
                    {values.map((value, index) => (
                        <li
                            key={`${value}-${index}`}
                            className="studio-token"
                        >
                            <span>{value}</span>
                            <IconButton
                                label={removeLabel(value)}
                                variant="ghost"
                                size="small"
                                onClick={() =>
                                    onChange(
                                        values.filter(
                                            (_, itemIndex) =>
                                                itemIndex !== index
                                        )
                                    )
                                }
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

export default function Commands({
    config,
    commands,
    onConfigChange,
    onCommandToggle,
}: CommandsProps) {
    const { t } = useTranslation();
    const [performanceStats, setPerformanceStats] = useState<
        Record<string, any>
    >({});

    useEffect(() => {
        window.electronAPI
            .invoke("commands:getPerformanceStats")
            .then((stats) => {
                const statsMap = (stats || []).reduce(
                    (accumulator: Record<string, any>, stat: any) => {
                        accumulator[stat.commandName] = stat;
                        return accumulator;
                    },
                    {}
                );
                setPerformanceStats(statsMap);
            })
            .catch((error) =>
                console.error("Failed to load performance stats:", error)
            );
    }, []);

    const handleAliasChange = (commandName: string, aliases: string[]) => {
        onConfigChange("commands", {
            ...config.commands,
            [commandName]: {
                ...config.commands?.[commandName],
                aliases,
            },
        });
    };

    const handleReplyToggle = (key: string, enabled: boolean) => {
        onConfigChange(key, enabled);
    };

    const handleReplyTemplateChange = (key: string, template: string) => {
        let allowedVars: string[] = [];
        if (key.includes("songRequest")) {
            allowedVars = ["title", "artist"];
        } else if (key.includes("volume")) {
            allowedVars = key.includes("Change") || key.includes("Get")
                ? ["volume"]
                : ["error"];
        }
        if (allowedVars.length > 0) {
            const validationError = validateTemplate(template, allowedVars);
            if (validationError) {
                console.warn(
                    `Template validation failed for ${key}: ${validationError}`
                );
            }
        }
        onConfigChange(key, template);
    };

    const getReplyConfig = (commandName: string) => {
        switch (commandName) {
            case "songRequest":
            case "sr":
                return {
                    successToggle: "replyOnSongRequest",
                    successTemplate: "songRequestReplyTemplate",
                    errorToggle: "replyOnSongRequestError",
                    errorTemplate: "songRequestErrorTemplate",
                    successLabel: t("commands.sr.replyOnSuccess"),
                    errorLabel: t("commands.sr.replyOnError"),
                    successPlaceholder: t("commands.sr.successPlaceholder"),
                    errorPlaceholder: t("commands.sr.errorPlaceholder"),
                    variables: t("commands.sr.variables"),
                    errorVariables: "{error}",
                };
            case "volume":
            case "vol":
                return {
                    successToggle: "replyOnVolumeChange",
                    successTemplate: "volumeChangeReplyTemplate",
                    errorToggle: "replyOnVolumeError",
                    errorTemplate: "volumeErrorTemplate",
                    getToggle: "replyOnVolumeGet",
                    getTemplate: "volumeGetReplyTemplate",
                    successLabel: t("commands.volume.replyOnChange"),
                    errorLabel: t("commands.volume.replyOnError"),
                    getLabel: t("commands.volume.replyOnGet"),
                    successPlaceholder: t("commands.volume.changePlaceholder"),
                    errorPlaceholder: t("commands.volume.errorPlaceholder"),
                    getPlaceholder: t("commands.volume.getPlaceholder"),
                    variables: t("commands.volume.variables"),
                    errorVariables: "{error}",
                };
            default:
                return null;
        }
    };

    const prefix = config.prefix || "!";

    return (
        <div className="studio-settings-api studio-commands">
            <div className="studio-settings-api-heading">
                <h2>{t("commands.title")}</h2>
            </div>

            <SettingGroup heading={t("commands.prefixAndModerators")}>
                <Input
                    id="commands-prefix"
                    label={t("commands.prefixCharacter")}
                    helper={t("requests.commandPrefixDesc")}
                    value={prefix}
                    onChange={(event) =>
                        onConfigChange("prefix", event.target.value)
                    }
                    placeholder="!"
                    maxLength={5}
                    wrapperClassName="studio-requests-prefix"
                />
                <StringListEditor
                    id="commands-moderators"
                    label={t("commands.moderatorsList")}
                    helper={t("commands.customModeratorsDesc")}
                    placeholder={t("commands.addModeratorPlaceholder")}
                    values={
                        Array.isArray(config.customModerators)
                            ? config.customModerators
                            : []
                    }
                    onChange={(values) =>
                        onConfigChange("customModerators", values)
                    }
                    maxLength={50}
                    validate={(candidate, current) =>
                        validateField("customModerators", [
                            ...current,
                            candidate,
                        ])
                    }
                    addLabel={t("commands.addModerator")}
                    removeLabel={(name) =>
                        t("commands.removeModerator", { name })
                    }
                />
            </SettingGroup>

            <SettingGroup heading={t("commands.registeredCommands")}>
                {commands.length > 0 ? (
                    <div className="studio-command-stack">
                        {commands.map((command) => {
                            const commandConfig = config.commands?.[
                                command.name
                            ] || { enabled: true, aliases: [] };
                            const enabled =
                                command.enabled !== undefined
                                    ? command.enabled
                                    : commandConfig.enabled !== false;
                            const aliases = Array.isArray(commandConfig.aliases)
                                ? commandConfig.aliases
                                : [];
                            const replyConfig = getReplyConfig(command.name);
                            const stats = performanceStats[command.name];
                            return (
                                <article
                                    key={command.name}
                                    className="studio-card studio-command-card"
                                    aria-labelledby={`command-title-${command.name}`}
                                >
                                    <header className="studio-command-head">
                                        <div className="studio-command-identity">
                                            <span
                                                className="studio-command-icon"
                                                aria-hidden="true"
                                            >
                                                <Hash />
                                            </span>
                                            <div className="studio-command-copy">
                                                <h3
                                                    id={`command-title-${command.name}`}
                                                >
                                                    {prefix}
                                                    {command.name}
                                                </h3>
                                                <p>
                                                    {t(
                                                        `commands.${command.name}.description`
                                                    )}
                                                </p>
                                                {stats && (
                                                    <span className="studio-command-stat">
                                                        <Clock
                                                            aria-hidden="true"
                                                        />
                                                        {t(
                                                            "commands.averageTime",
                                                            {
                                                                time: Number(
                                                                    stats.averageTime
                                                                ).toFixed(1),
                                                            }
                                                        )}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <Toggle
                                            id={`command-enabled-${command.name}`}
                                            label={t("commands.enabled")}
                                            aria-label={`${t("commands.enabled")} ${prefix}${command.name}`}
                                            checked={enabled}
                                            onCheckedChange={(checked) =>
                                                onCommandToggle(
                                                    command.name,
                                                    checked
                                                )
                                            }
                                            wrapperClassName="studio-command-toggle"
                                        />
                                    </header>

                                    <div className="studio-command-body">
                                        <StringListEditor
                                            id={`command-aliases-${command.name}`}
                                            label={t("commands.aliases")}
                                            helper={t("commands.aliasesDesc")}
                                            placeholder={t("commands.addAlias")}
                                            values={aliases}
                                            onChange={(values) =>
                                                handleAliasChange(
                                                    command.name,
                                                    values
                                                )
                                            }
                                            maxLength={20}
                                            validate={(candidate, current) =>
                                                validateCommandAlias(
                                                    candidate,
                                                    current,
                                                    command.name
                                                )
                                            }
                                            addLabel={t(
                                                "commands.addAliasAction"
                                            )}
                                            removeLabel={(alias) =>
                                                t("commands.removeAlias", {
                                                    name: alias,
                                                })
                                            }
                                        />

                                        {replyConfig && (
                                            <div className="studio-command-replies">
                                                <div className="studio-command-replies-head">
                                                    <MessageSquare
                                                        aria-hidden="true"
                                                    />
                                                    <h4>
                                                        {t(
                                                            "commands.chatReplies"
                                                        )}
                                                    </h4>
                                                </div>

                                                <Toggle
                                                    id={`command-${command.name}-reply-success`}
                                                    label={
                                                        replyConfig.successLabel
                                                    }
                                                    helper={t(
                                                        "commands.sendConfirmationMessage"
                                                    )}
                                                    checked={
                                                        config[
                                                            replyConfig
                                                                .successToggle
                                                        ] || false
                                                    }
                                                    onCheckedChange={(
                                                        checked
                                                    ) =>
                                                        handleReplyToggle(
                                                            replyConfig.successToggle,
                                                            checked
                                                        )
                                                    }
                                                />
                                                {config[
                                                    replyConfig.successToggle
                                                ] && (
                                                    <Input
                                                        id={`command-${command.name}-success-template`}
                                                        label={t(
                                                            "commands.successTemplate"
                                                        )}
                                                        helper={`${t("commands.availableVariables")}: ${replyConfig.variables}`}
                                                        value={
                                                            config[
                                                                replyConfig
                                                                    .successTemplate
                                                            ] || ""
                                                        }
                                                        onChange={(event) =>
                                                            handleReplyTemplateChange(
                                                                replyConfig.successTemplate,
                                                                event.target
                                                                    .value
                                                            )
                                                        }
                                                        placeholder={
                                                            replyConfig.successPlaceholder
                                                        }
                                                    />
                                                )}

                                                <Toggle
                                                    id={`command-${command.name}-reply-error`}
                                                    label={replyConfig.errorLabel}
                                                    helper={t(
                                                        "commands.sendMessageOnFailure"
                                                    )}
                                                    checked={
                                                        config[
                                                            replyConfig
                                                                .errorToggle
                                                        ] || false
                                                    }
                                                    onCheckedChange={(
                                                        checked
                                                    ) =>
                                                        handleReplyToggle(
                                                            replyConfig.errorToggle,
                                                            checked
                                                        )
                                                    }
                                                />
                                                {config[
                                                    replyConfig.errorToggle
                                                ] && (
                                                    <Input
                                                        id={`command-${command.name}-error-template`}
                                                        label={t(
                                                            "commands.errorTemplate"
                                                        )}
                                                        helper={`${t("commands.availableVariables")}: ${replyConfig.errorVariables}`}
                                                        value={
                                                            config[
                                                                replyConfig
                                                                    .errorTemplate
                                                            ] || ""
                                                        }
                                                        onChange={(event) =>
                                                            handleReplyTemplateChange(
                                                                replyConfig.errorTemplate,
                                                                event.target
                                                                    .value
                                                            )
                                                        }
                                                        placeholder={
                                                            replyConfig.errorPlaceholder
                                                        }
                                                    />
                                                )}

                                                {replyConfig.getToggle && (
                                                    <>
                                                        <Toggle
                                                            id={`command-${command.name}-reply-get`}
                                                            label={
                                                                replyConfig.getLabel
                                                            }
                                                            helper={t(
                                                                "commands.sendCurrentVolume"
                                                            )}
                                                            checked={
                                                                config[
                                                                    replyConfig
                                                                        .getToggle
                                                                ] || false
                                                            }
                                                            onCheckedChange={(
                                                                checked
                                                            ) =>
                                                                handleReplyToggle(
                                                                    replyConfig.getToggle,
                                                                    checked
                                                                )
                                                            }
                                                        />
                                                        {config[
                                                            replyConfig.getToggle
                                                        ] && (
                                                            <Input
                                                                id={`command-${command.name}-get-template`}
                                                                label={t(
                                                                    "commands.getTemplate"
                                                                )}
                                                                helper={`${t("commands.availableVariables")}: ${replyConfig.variables}`}
                                                                value={
                                                                    config[
                                                                        replyConfig
                                                                            .getTemplate
                                                                    ] || ""
                                                                }
                                                                onChange={(
                                                                    event
                                                                ) =>
                                                                    handleReplyTemplateChange(
                                                                        replyConfig.getTemplate,
                                                                        event
                                                                            .target
                                                                            .value
                                                                    )
                                                                }
                                                                placeholder={
                                                                    replyConfig.getPlaceholder
                                                                }
                                                            />
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                ) : (
                    <div className="studio-empty-state">
                        <Hash aria-hidden="true" />
                        <h3>{t("commands.noCommandsAvailable")}</h3>
                        <p>{t("commands.noCommandsDescription")}</p>
                    </div>
                )}
            </SettingGroup>
        </div>
    );
}
