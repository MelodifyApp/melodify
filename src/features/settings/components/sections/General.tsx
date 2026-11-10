import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Download, RefreshCw } from "lucide-react";
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
    const replyLanguage = autoFollow
        ? "auto"
        : config.defaultsLanguage || language;
    const replyLanguageOptions = [
        { value: "auto", label: t("general.sameAsInterface") },
        ...languageOptions,
    ];

    useEffect(() => {
        window.electronAPI
            .getAppVersion()
            .then(setCurrentVersion)
            .catch((error) => console.error("Failed to load app version", error));
    }, []);

    const handleReplyLanguageChange = (value: string) => {
        if (value === "auto") {
            onConfigChange("autoFollowLanguageDefaults", true);
            onConfigChange("defaultsLanguage", language);
            return;
        }
        onConfigChange("autoFollowLanguageDefaults", false);
        onConfigChange("defaultsLanguage", value);
    };

    const updateInFlight = ["checking", "downloading", "installing"].includes(
        status ?? ""
    );
    const updateReady =
        status === "available" || status === "downloaded";
    const updateFailed = status === "error" || status === "install-error";
    const latestVersion =
        status === "available" ||
        status === "downloading" ||
        status === "downloaded" ||
        status === "installing" ||
        status === "install-error"
            ? manifest?.version || "—"
            : currentVersion || "—";
    const showLatestVersion =
        latestVersion !== "—" &&
        latestVersion !== currentVersion &&
        ["available", "downloading", "downloaded", "installing", "install-error"].includes(
            status ?? ""
        );
    const updateState = updateReady
        ? "available"
        : updateFailed
          ? "error"
          : updateInFlight
            ? "busy"
            : status === "not-available"
              ? "current"
              : "idle";
    const statusLabel =
        status === "available"
            ? t("general.updateAvailable")
            : status === "downloaded"
              ? t("general.readyToInstall")
              : status === "checking"
                ? t("general.checking")
                : status === "downloading"
                  ? `${t("general.downloading")} ${Math.max(
                        0,
                        Math.min(100, Math.round(progress?.percent ?? 0))
                    )}%`
                  : status === "installing"
                    ? t("general.installing")
                    : status === "not-available"
                      ? t("general.upToDate")
                      : updateFailed
                        ? t("general.updateFailed")
                        : null;
    const progressPercent = Math.max(
        0,
        Math.min(100, Math.round(progress?.percent ?? 0))
    );

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
                <Select
                    id="general-reply-language"
                    label={t("general.replyLanguage")}
                    value={replyLanguage}
                    options={replyLanguageOptions}
                    onChange={handleReplyLanguageChange}
                />
            </SettingGroup>

            <SettingGroup heading={t("general.updates")}>
                <Toggle
                    id="general-auto-update"
                    label={t("general.autoUpdate")}
                    helper={t("general.autoUpdateDesc")}
                    checked={autoUpdate}
                    onCheckedChange={(enabled) => onConfigChange("autoUpdateEnabled", enabled)}
                />
                <div className="studio-updates" data-state={updateState}>
                    <div className="studio-update-head">
                        <div className="studio-update-versions">
                            <div className="studio-update-version">
                                <span>{t("general.current")}</span>
                                <strong>{currentVersion || "—"}</strong>
                            </div>
                            {showLatestVersion && (
                                <>
                                    <ArrowRight
                                        className="studio-update-arrow studio-update-latest-arrow"
                                        aria-hidden="true"
                                    />
                                    <div
                                        className="studio-update-version studio-update-latest"
                                        data-latest="true"
                                    >
                                        <span>{t("general.latest")}</span>
                                        <strong>{latestVersion}</strong>
                                    </div>
                                </>
                            )}
                        </div>
                        {statusLabel && (
                            <span
                                className="studio-update-state"
                                data-tone={updateState}
                                role="status"
                                aria-live="polite"
                            >
                                {updateReady && (
                                    <span
                                        className="studio-update-beacon"
                                        aria-hidden="true"
                                    />
                                )}
                                {status === "not-available" && (
                                    <CheckIcon aria-hidden="true" />
                                )}
                                {statusLabel}
                            </span>
                        )}
                    </div>

                    <div
                        className="studio-update-progress"
                        data-active={status === "downloading"}
                        role={
                            status === "downloading"
                                ? "progressbar"
                                : undefined
                        }
                        aria-hidden={status !== "downloading"}
                        aria-valuemin={
                            status === "downloading" ? 0 : undefined
                        }
                        aria-valuemax={
                            status === "downloading" ? 100 : undefined
                        }
                        aria-valuenow={
                            status === "downloading"
                                ? progressPercent
                                : undefined
                        }
                    >
                        <span style={{ width: `${progressPercent}%` }} />
                    </div>

                    <div className="studio-update-footer">
                        <div className="studio-update-actions">
                            <Button
                                variant="secondary"
                                onClick={() =>
                                    window.electronAPI.checkForUpdates()
                                }
                                disabled={updateInFlight}
                                aria-busy={
                                    status === "checking" ? true : undefined
                                }
                            >
                                <RefreshCw
                                    size={15}
                                    aria-hidden="true"
                                    className="studio-update-refresh"
                                    data-spinning={
                                        status === "checking"
                                            ? "true"
                                            : undefined
                                    }
                                />
                                {status === "checking"
                                    ? t("general.checking")
                                    : t("general.checkUpdates")}
                            </Button>
                            {status === "available" && (
                                <Button
                                    variant="primary"
                                    onClick={() =>
                                        window.electronAPI.send(
                                            "update:download",
                                            manifest
                                        )
                                    }
                                >
                                    <Download size={15} aria-hidden="true" />
                                    {t("general.downloadUpdate")}
                                </Button>
                            )}
                            {status === "downloaded" && (
                                <Button
                                    variant="primary"
                                    onClick={() =>
                                        window.electronAPI.send(
                                            "update:install"
                                        )
                                    }
                                >
                                    <CheckIcon aria-hidden="true" />
                                    {t("general.installUpdate")}
                                </Button>
                            )}
                            {status === "install-error" && (
                                <Button
                                    variant="primary"
                                    onClick={() =>
                                        window.electronAPI.send(
                                            "update:install"
                                        )
                                    }
                                >
                                    {t("general.retryInstall")}
                                </Button>
                            )}
                        </div>

                        <div className="studio-update-feedback">
                            {status === "error" && (
                                <InlineError
                                    message={t("general.errorDownloading")}
                                />
                            )}
                            {status === "install-error" && (
                                <InlineError
                                    message={t("general.installError")}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </SettingGroup>
        </>
    );
}
