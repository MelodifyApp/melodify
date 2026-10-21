// General section - combines system settings and app preferences

import { useEffect, useState } from "react";
import {
    CheckIcon,
    Settings2,
    Clock as Spinner,
    Globe,
} from "lucide-react";
import Toggle from "@/ui/components/Toggle";
import { Button } from "@/ui/components/Button";
import { useUpdateStatus } from "@/ui/hooks/useUpdateStatus";
import LanguageSelector from "@/ui/components/LanguageSelector";
import { useTranslation } from "react-i18next";
import { supportedLanguages } from "@/core/i18n/translations";

interface GeneralProps {
    config: any;
    onConfigChange: (key: string, value: any) => void;
}

export default function General({ config, onConfigChange }: GeneralProps) {
    const { t } = useTranslation();
    const [startupStatus, setStartupStatus] = useState<boolean>(false);
    const [autoUpdateEnabled, setAutoUpdateEnabled] = useState<boolean>(true);
    const [currentVersion, setCurrentVersion] = useState("");
    const { status, progress, manifest } = useUpdateStatus();

    useEffect(() => {
        // Get the current startup status from the system
        window.electronAPI.getStartupStatus().then(setStartupStatus);

        // Get the current auto-update setting
        window.electronAPI.getAutoUpdate().then(setAutoUpdateEnabled);

        // Get the current app version
        window.electronAPI.getAppVersion().then(setCurrentVersion);
    }, []);

    const handleStartupToggle = (enabled: boolean) => {
        setStartupStatus(enabled);
        window.electronAPI.setStartupStatus(enabled);
        onConfigChange("startOnStartup", enabled);
    };

    const handleAutoUpdateToggle = (enabled: boolean) => {
        setAutoUpdateEnabled(enabled);
        window.electronAPI.setAutoUpdate(enabled);
        onConfigChange("autoUpdateEnabled", enabled);
    };

    const handleMinimizeToTrayToggle = (enabled: boolean) => {
        onConfigChange("minimizeToTray", enabled);
    };

    const handleLanguageChange = async (language: string) => {
        // Update the language in config
        // The i18n event listener will automatically handle updating translated defaults
        onConfigChange("language", language);
    };

    const handleDefaultsLanguageChange = async (language: string) => {
        // Manually set defaults language (this will automatically disable auto-follow)
        onConfigChange("defaultsLanguage", language);
    };

    const handleAutoFollowToggle = async (enabled: boolean) => {
        if (enabled) {
            // Enable auto-follow and sync defaults language to app language
            onConfigChange("autoFollowLanguageDefaults", true);
            // The config system will automatically sync defaultsLanguage when autoFollow is enabled
        } else {
            // Just disable auto-follow, keep current defaults language
            onConfigChange("autoFollowLanguageDefaults", false);
        }
    };

    const handleCheck = () => {
        window.electronAPI.checkForUpdates();
    };

    const handleDownload = () => {
        window.electronAPI.send("update:download", manifest);
    };

    const handleInstall = () => {
        window.electronAPI.send("update:install");
    };

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white mb-4">
                {t("general.title")}
            </h3>

            <div className="settings-section">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 bg-blue-500/20 rounded flex items-center justify-center">
                        <Settings2 className="w-4 h-4 text-blue-300" />
                    </div>
                    <h3 className="text-base font-semibold text-white">
                        {t("general.application")}
                    </h3>
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between py-1">
                        <div className="flex-1">
                            <h4 className="text-sm font-medium text-white">
                                {t("general.startWithSystem")}
                            </h4>
                            <p className="text-sm text-zinc-400 leading-relaxed">
                                {t("general.startWithSystemDesc")}
                            </p>
                        </div>
                        <Toggle
                            checked={startupStatus}
                            onChange={handleStartupToggle}
                        />
                    </div>

                    <div className="h-px bg-zinc-700/30"></div>

                    <div className="flex items-center justify-between py-1">
                        <div className="flex-1">
                            <h4 className="text-sm font-medium text-white">
                                {t("general.minimizeToTray")}
                            </h4>
                            <p className="text-sm text-zinc-400 leading-relaxed">
                                {t("general.minimizeToTrayDesc")}
                            </p>
                        </div>
                        <Toggle
                            checked={config.minimizeToTray || false}
                            onChange={handleMinimizeToTrayToggle}
                        />
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 bg-purple-500/20 rounded flex items-center justify-center">
                        <Globe className="w-4 h-4 text-purple-300" />
                    </div>
                    <h3 className="text-base font-semibold text-white">
                        {t("general.language")}
                    </h3>
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between py-1">
                        <div className="flex-1">
                            <h4 className="text-sm font-medium text-white">
                                {t("general.interfaceLanguage")}
                            </h4>
                            <p className="text-sm text-zinc-400 leading-relaxed">
                                {t("general.interfaceLanguageDesc")}
                            </p>
                        </div>
                        <LanguageSelector
                            onLanguageChange={handleLanguageChange}
                        />
                    </div>

                    <div className="h-px bg-zinc-700/30"></div>

                    <div className="flex items-center justify-between py-1">
                        <div className="flex-1">
                            <h4 className="text-sm font-medium text-white">
                                {t("general.autoFollowDefaults")}
                            </h4>
                            <p className="text-sm text-zinc-400 leading-relaxed">
                                {t("general.autoFollowDefaultsDesc")}
                            </p>
                        </div>
                        <Toggle
                            checked={config.autoFollowLanguageDefaults === true}
                            onChange={handleAutoFollowToggle}
                        />
                    </div>

                    {config.autoFollowLanguageDefaults !== true && (
                        <>
                            <div className="h-px bg-zinc-700/30"></div>
                            <div className="flex items-center justify-between py-1">
                                <div className="flex-1">
                                    <h4 className="text-sm font-medium text-white">
                                        {t("general.defaultsLanguage")}
                                    </h4>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        {t("general.defaultsLanguageDesc")}
                                    </p>
                                </div>
                                <select
                                    aria-label={t("general.defaultsLanguage")}
                                    value={config.defaultsLanguage || "en"}
                                    onChange={(event) =>
                                        handleDefaultsLanguageChange(event.target.value)
                                    }
                                    className="min-w-[160px] rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-melodify-primary"
                                >
                                    {supportedLanguages.map((language) => (
                                        <option key={language.code} value={language.code}>
                                            {language.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="settings-section">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 bg-melodify-primary/10 rounded flex items-center justify-center">
                        <Settings2 className="w-4 h-4 text-melodify-primary" />
                    </div>
                    <h3 className="text-base font-semibold text-white">
                        {t("general.updates")}
                    </h3>
                </div>
                <div className="space-y-3">
                    <div className="flex items-center justify-between py-1">
                        <div className="flex-1">
                            <h4 className="text-sm font-medium text-white">
                                {t("general.autoUpdate")}
                            </h4>
                            <p className="text-sm text-zinc-400 leading-relaxed">
                                {t("general.autoUpdateDesc")}
                            </p>
                        </div>
                        <Toggle
                            checked={autoUpdateEnabled}
                            onChange={handleAutoUpdateToggle}
                        />
                    </div>

                    <div className="h-px bg-zinc-700/30"></div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-zinc-700/30 rounded p-3">
                            <p className="text-zinc-400 text-sm mb-1">
                                {t("general.current")}
                            </p>
                            <p className="text-white font-mono text-sm">
                                {currentVersion}
                            </p>
                        </div>
                        <div className="bg-zinc-700/30 rounded p-3">
                            <p className="text-zinc-400 text-sm mb-1">
                                {t("general.latest")}
                            </p>
                            <p className="text-white font-mono text-sm">
                                {status === "available"
                                    ? manifest?.version
                                    : currentVersion}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 items-center">
                        <div className="flex items-center gap-2">
                            <Button
                                onClick={handleCheck}
                                disabled={
                                    status === "checking" ||
                                    status === "downloading"
                                }
                                className="text-sm py-2 px-3 focus:outline-none focus-visible:outline-none"
                            >
                                {status === "checking" ? (
                                    <>
                                        <Spinner className="w-4 h-4 animate-spin mr-1 text-white" />
                                        {t("general.checking")}
                                    </>
                                ) : (
                                    t("general.checkUpdates")
                                )}
                            </Button>
                            {status === "available" && (
                                <Button
                                    onClick={handleDownload}
                                    disabled={status !== "available"}
                                    className="text-sm py-2 px-3 focus:outline-none focus-visible:outline-none"
                                >
                                    {t("general.downloadUpdate")}
                                </Button>
                            )}
                            {status === "downloaded" && (
                                <Button
                                    onClick={handleInstall}
                                    className="text-sm py-2 px-3 focus:outline-none focus-visible:outline-none"
                                >
                                    {t("general.installUpdate")}
                                </Button>
                            )}
                            {status === "downloading" && (
                                <div className="flex items-center gap-2">
                                    <Spinner className="w-4 h-4 animate-spin text-white" />
                                    <span className="text-sm">
                                        {t("general.downloading")}{" "}
                                        {progress.percent}%
                                    </span>
                                </div>
                            )}
                            {status === "error" && (
                                <div className="flex items-center gap-2 text-red-400">
                                    <span className="text-sm">
                                        {t("general.errorDownloading")}
                                    </span>
                                </div>
                            )}
                            {status === "not-available" && (
                                <span className="text-sm text-zinc-400 flex items-center gap-1">
                                    <CheckIcon className="text-melodify-primary" />{" "}
                                    {t("general.upToDate")}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
