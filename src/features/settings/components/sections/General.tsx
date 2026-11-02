import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Select, SettingGroup, Toggle } from "@/ui/components/studio";
import { CheckIcon } from "@/ui/components/studio/icons";
import { useUpdateStatus } from "@/ui/hooks/useUpdateStatus";
import InlineError from "@/ui/components/InlineError";
import { supportedLanguages } from "@/core/i18n/translations";

interface GeneralProps {
    config: any;
    onConfigChange: (key: string, value: any) => void;
}

const languageOptions = supportedLanguages.map((item) => ({
    value: item.code,
    label: item.name,
}));

export default function General({ config, onConfigChange }: GeneralProps) {
    const { t } = useTranslation();
    const [currentVersion, setCurrentVersion] = useState("");
    const { status, progress, manifest } = useUpdateStatus();
    const language = config.language || "en";
    const autoFollow = config.autoFollowLanguageDefaults !== false;
    const autoUpdate = config.autoUpdateEnabled !== false;

    useEffect(() => {
        window.electronAPI
            .getAppVersion()
            .then(setCurrentVersion)
            .catch((error) => console.error("Failed to load app version", error));
    }, []);

    const handleAutoFollowToggle = (enabled: boolean) => {
        onConfigChange("autoFollowLanguageDefaults", enabled);
        if (enabled) onConfigChange("defaultsLanguage", language);
    };

    return (
        <>
            <SettingGroup heading={t("general.application")}>
                <Toggle
                    id="general-start-with-system"
                    label={t("general.startWithSystem")}
                    checked={config.startOnStartup === true}
                    onCheckedChange={(enabled) => onConfigChange("startOnStartup", enabled)}
                />
                <Toggle
                    id="general-minimize-to-tray"
                    label={t("general.minimizeToTray")}
                    helper={t("general.minimizeToTrayDesc")}
                    checked={config.minimizeToTray === true}
                    onCheckedChange={(enabled) => onConfigChange("minimizeToTray", enabled)}
                />
            </SettingGroup>

            <SettingGroup heading={t("general.language")}>
                <Select
                    id="general-language"
                    label={t("general.interfaceLanguage")}
                    value={language}
                    options={languageOptions}
                    onChange={(value) => onConfigChange("language", value)}
                />
                <Toggle
                    id="general-auto-follow"
                    label={t("general.autoFollowDefaults")}
                    checked={autoFollow}
                    onCheckedChange={handleAutoFollowToggle}
                />
                {!autoFollow && (
                    <Select
                        id="general-defaults-language"
                        label={t("general.defaultsLanguage")}
                        value={config.defaultsLanguage || language}
                        options={languageOptions}
                        onChange={(value) =>
                            onConfigChange("defaultsLanguage", value)
                        }
                    />
                )}
            </SettingGroup>

            <SettingGroup heading={t("general.updates")}>
                <Toggle
                    id="general-auto-update"
                    label={t("general.autoUpdate")}
                    helper={t("general.autoUpdateDesc")}
                    checked={autoUpdate}
                    onCheckedChange={(enabled) => onConfigChange("autoUpdateEnabled", enabled)}
                />
                <div className="studio-general-versions">
                    <div>
                        <span>{t("general.current")}</span>
                        <strong>{currentVersion || "—"}</strong>
                    </div>
                    <div>
                        <span>{t("general.latest")}</span>
                        <strong>{status === "available" ? manifest?.version || "—" : currentVersion || "—"}</strong>
                    </div>
                </div>
                <div className="studio-general-update-actions">
                    <Button
                        onClick={() => window.electronAPI.checkForUpdates()}
                        loading={status === "checking"}
                        disabled={status === "checking" || status === "downloading" || status === "installing"}
                    >
                        {status === "checking" ? t("general.checking") : t("general.checkUpdates")}
                    </Button>
                    {status === "available" && (
                        <Button onClick={() => window.electronAPI.send("update:download", manifest)}>
                            {t("general.downloadUpdate")}
                        </Button>
                    )}
                    {status === "downloaded" && (
                        <Button onClick={() => window.electronAPI.send("update:install")}>
                            {t("general.installUpdate")}
                        </Button>
                    )}
                    {status === "downloading" && (
                        <span className="studio-general-update-status" role="status" aria-live="polite">
                            <span className="studio-spinner" aria-hidden="true" />
                            {t("general.downloading")} {progress?.percent ?? 0}%
                        </span>
                    )}
                    {status === "installing" && (
                        <span className="studio-general-update-status" role="status" aria-live="polite">
                            <span className="studio-spinner" aria-hidden="true" />
                            {t("general.installing")}
                        </span>
                    )}
                    {status === "error" && (
                        <InlineError message={t("general.errorDownloading")} />
                    )}
                    {status === "install-error" && (
                        <>
                            <InlineError message={t("general.installError")} />
                            <Button
                                onClick={() =>
                                    window.electronAPI.send("update:install")
                                }
                            >
                                {t("general.retryInstall")}
                            </Button>
                        </>
                    )}
                    {status === "not-available" && (
                        <span className="studio-general-update-status">
                            <CheckIcon aria-hidden="true" />
                            {t("general.upToDate")}
                        </span>
                    )}
                </div>
            </SettingGroup>
        </>
    );
}
