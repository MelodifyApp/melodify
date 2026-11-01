import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import General from "./sections/General";
import Secrets from "./sections/Secrets";
import Requests from "./sections/Requests";
import Commands from "./sections/Commands";
import Logs from "./sections/Logs";
import Debug from "./sections/Debug";
import { Button, SectionNav, SaveDock, StudioTheme } from "@/ui/components/studio";
import type { SectionNavGroup, StudioThemeName } from "@/ui/components/studio";
import {
    buildConfigSavePatch,
    acknowledgeSongFilePath,
    commitAcknowledgedDraft,
    createDraftState,
    credentialDraftsFromConfig,
    discardDraft,
    editDraftConfig,
    mergeCredentialDrafts,
    settingsAreDirty,
    toggleDraftCommand,
} from "./draftState";
import { mergeLogEntries } from "./logFeed";
import "./settingsStudio.css";

const SECTION_IDS = ["general", "secrets", "requests", "commands", "logs", "debug"] as const;
type SectionId = (typeof SECTION_IDS)[number];
export type SettingsSectionId = SectionId;
const SECTION_TITLE_KEYS: Record<SectionId, string> = {
    general: "settings.general",
    secrets: "settings.secrets",
    requests: "settings.requests",
    commands: "settings.commands",
    logs: "settings.logs",
    debug: "settings.debug",
};

interface ConfigSaveResponse {
    ok?: boolean;
    code?: string;
    rejected?: Array<{ key?: unknown }>;
    config?: Record<string, unknown>;
}

export default function Settings({ onClose, theme = "graphite", active = true, requestedSection, onRequestedSectionHandled }: { onClose: () => void; theme?: StudioThemeName; active?: boolean; requestedSection?: SettingsSectionId; onRequestedSectionHandled?: () => void }) {
    const { t, i18n } = useTranslation();
    const [activeSection, setActiveSection] = useState<SectionId>("general");
    const [drafts, setDrafts] = useState(() => createDraftState());
    const [credentialDrafts, setCredentialDrafts] = useState<Record<string, unknown>>({});
    const [credentialBaseline, setCredentialBaseline] = useState<Record<string, unknown>>({});
    const [apiDraftPending, setApiDraftPending] = useState(false);
    const [logs, setLogs] = useState<any[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [hasNavigated, setHasNavigated] = useState(false);
    const contentRef = useRef<HTMLElement>(null);
    const headingRef = useRef<HTMLHeadingElement>(null);

    const loadSettings = useCallback(async (reloadFirst = false) => {
        setLoading(true);
        setLoaded(false);
        setLoadError(false);
        setSaveError(null);
        try {
            if (reloadFirst) {
                const reload = await window.electronAPI.invoke("config:reload");
                if (!reload || reload.ok !== true) {
                    throw new Error("Config reload failed");
                }
            }
            const [configData, commandsData] = await Promise.all([
                window.electronAPI.invoke("config:get"),
                window.electronAPI.invoke("commands:getAll"),
            ]);
            if (
                !configData ||
                typeof configData !== "object" ||
                Array.isArray(configData)
            ) {
                throw new Error("Invalid config response");
            }
            if (!Array.isArray(commandsData)) {
                throw new Error("Invalid command response");
            }
            setDrafts(createDraftState(configData, commandsData));
            setCredentialDrafts(credentialDraftsFromConfig(configData));
            setCredentialBaseline(credentialDraftsFromConfig(configData));
            if (
                typeof configData.language === "string" &&
                i18n.language !== configData.language
            ) {
                void i18n.changeLanguage(configData.language);
            }
            setLoaded(true);
        } catch (error) {
            console.error("Failed to load settings", error);
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, [i18n]);

    useEffect(() => {
        void loadSettings();
    }, [loadSettings]);

    useEffect(() => {
        if (!requestedSection) return;
        setHasNavigated(true);
        setActiveSection(requestedSection);
        onRequestedSectionHandled?.();
    }, [requestedSection, onRequestedSectionHandled]);

    useEffect(() => {
        if (!active || activeSection !== "logs") return;
        let disposed = false;
        const onLogEntry = (entry: unknown) => {
            if (disposed) return;
            setLogs((current) => mergeLogEntries(current, [entry]));
        };

        // Subscribe before hydrating so an entry emitted during the snapshot
        // request is retained; the merge removes the overlap.
        window.electronAPI.on("log:entry", onLogEntry);
        window.electronAPI
            .invoke("log:getAll")
            .then((data) => {
                if (disposed) return;
                const snapshot = Array.isArray(data) ? data : [];
                setLogs((current) => mergeLogEntries(snapshot, current));
            })
            .catch((error) => console.error("Failed to load logs", error));

        return () => {
            disposed = true;
            window.electronAPI.removeListener("log:entry", onLogEntry);
        };
    }, [active, activeSection]);

    useEffect(() => {
        if (!loaded) return;
        if (contentRef.current) contentRef.current.scrollTop = 0;
        if (hasNavigated) headingRef.current?.focus({ preventScroll: true });
    }, [activeSection, loaded, hasNavigated]);

    const handleConfigChange = (key: string, value: unknown) => {
        setSaveError(null);
        setDrafts((current) =>
            key === "currentSongFilePath" && typeof value === "string"
                ? acknowledgeSongFilePath(current, value)
                : editDraftConfig(current, key, value)
        );
    };
    const handleCommandToggle = (name: string, enabled: boolean) => {
        setSaveError(null);
        setDrafts((current) => toggleDraftCommand(current, name, enabled));
    };
    const handleCredentialChange = (key: string, value: unknown) => {
        setSaveError(null);
        setCredentialDrafts((current) => ({ ...current, [key]: value }));
    };
    const handleServiceSaved = (serviceId: "spotify" | "kick" | "twitch") => {
        const key = `${serviceId}ClientId`;
        setCredentialBaseline((current) => ({
            ...current,
            [key]: credentialDrafts[key] ?? "",
        }));
    };

    const dirty = settingsAreDirty(drafts);
    const handleSave = async () => {
        if (saving || !loaded) return;
        const patch = buildConfigSavePatch(drafts);
        const languageChanged =
            drafts.draftConfig.language &&
            drafts.draftConfig.language !== drafts.baselineConfig.language;
        setSaving(true);
        setSaveError(null);
        try {
            const result: ConfigSaveResponse = await window.electronAPI.invoke(
                "config:save",
                patch
            );
            if (result?.ok !== true) {
                if (
                    result?.code === "rejected" &&
                    Array.isArray(result.rejected) &&
                    result.rejected.length > 0
                ) {
                    const keys = result.rejected
                        .map((entry) => String(entry.key || ""))
                        .filter(Boolean)
                        .join(", ");
                    setSaveError(
                        keys
                            ? t("settings.saveRejected", { keys })
                            : t("settings.saveFailed")
                    );
                } else if (result?.code === "write-failed") {
                    setSaveError(t("settings.saveWriteFailed"));
                } else {
                    setSaveError(t("settings.saveFailed"));
                }
                return;
            }

            setDrafts((current) => {
                const acknowledgedConfig =
                    result.config &&
                    typeof result.config === "object" &&
                    !Array.isArray(result.config)
                        ? result.config
                        : patch;
                return commitAcknowledgedDraft(
                    current,
                    acknowledgedConfig,
                    patch
                );
            });
            if (languageChanged) {
                void i18n.changeLanguage(
                    String(drafts.draftConfig.language)
                );
            }
        } catch (error) {
            console.error("Failed to save settings", error);
            setSaveError(t("settings.saveFailed"));
        } finally {
            setSaving(false);
        }
    };
    const handleDiscard = () => {
        setSaveError(null);
        setDrafts((current) => discardDraft(current));
    };
    const handleHome = () => {
        onClose();
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                document.querySelector<HTMLElement>("[data-titlebar-brand]")?.focus();
            });
        });
    };
    const groups: SectionNavGroup[] = [
        { id: "application", label: t("settings.groups.application"), items: [
            { id: "general", label: t("settings.general") },
            { id: "secrets", label: t("settings.secrets") },
        ] },
        { id: "requests", label: t("settings.groups.requests"), items: [
            { id: "requests", label: t("settings.requests") },
            { id: "commands", label: t("settings.commands") },
        ] },
        { id: "diagnostics", label: t("settings.groups.diagnostics"), items: [
            { id: "logs", label: t("settings.logs") },
            ...(process.env.NODE_ENV === "development" ? [{ id: "debug", label: t("settings.debug") }] : []),
        ] },
    ];

    if (loading) {
        return (
            <StudioTheme theme={theme} className="studio-settings-shell">
                <div className="studio-settings-loading">
                    {t("settings.loading")}
                </div>
            </StudioTheme>
        );
    }

    if (loadError || !loaded) {
        return (
            <StudioTheme theme={theme} className="studio-settings-shell">
                <div className="studio-settings-load">
                    <div className="studio-settings-load-card" role="alert">
                        <h2>{t("settings.loadFailedTitle")}</h2>
                        <p>{t("settings.loadFailedDescription")}</p>
                        <Button
                            variant="primary"
                            onClick={() => void loadSettings(true)}
                        >
                            {t("settings.retry")}
                        </Button>
                    </div>
                </div>
            </StudioTheme>
        );
    }

    return (
        <StudioTheme theme={theme} className="studio-settings-shell">
            <aside className="studio-settings-rail" aria-label={t("settings.title")}>
                <SectionNav
                    groups={groups}
                    activeId={activeSection}
                    onSelect={(id) => {
                        setHasNavigated(true);
                        setActiveSection(id as SectionId);
                    }}
                    onHome={handleHome}
                    homeLabel={t("navigation.homePage")}
                    homeAriaLabel={t("navigation.homePage")}
                    navTitle={t("settings.title")}
                    aria-label={t("settings.sections")}
                />
            </aside>
            <div className="studio-settings-workspace">
                <main
                    ref={contentRef}
                    className="studio-settings-main"
                    tabIndex={0}
                    aria-labelledby="studio-settings-title"
                >
                    <div className="studio-settings-content">
                        <h1
                            ref={headingRef}
                            id="studio-settings-title"
                            className="studio-settings-title"
                            tabIndex={-1}
                        >
                            {t(SECTION_TITLE_KEYS[activeSection])}
                        </h1>
                        {activeSection === "general" && (
                            <General config={drafts.draftConfig} onConfigChange={handleConfigChange} />
                        )}
                        {activeSection === "secrets" && (
                            <Secrets
                                config={mergeCredentialDrafts(drafts.draftConfig, credentialDrafts)}
                                baselineConfig={mergeCredentialDrafts(drafts.baselineConfig, credentialBaseline)}
                                onConfigChange={handleCredentialChange}
                                onDraftStateChange={setApiDraftPending}
                                onServiceSaved={handleServiceSaved}
                                active={active}
                            />
                        )}
                        {activeSection === "requests" && (
                            <Requests config={drafts.draftConfig} onConfigChange={handleConfigChange} />
                        )}
                        {activeSection === "commands" && (
                            <Commands
                                config={drafts.draftConfig}
                                commands={drafts.draftCommands}
                                onConfigChange={handleConfigChange}
                                onCommandToggle={handleCommandToggle}
                            />
                        )}
                        {activeSection === "logs" && <Logs logs={logs} />}
                        {activeSection === "debug" && <Debug />}
                    </div>
                </main>
                {activeSection === "secrets" ? (
                    <SaveDock mode="api" draftPending={apiDraftPending} className="studio-settings-dock" />
                ) : (
                    <SaveDock
                        dirty={dirty}
                        error={saveError}
                        saving={saving}
                        onSave={handleSave}
                        onDiscard={handleDiscard}
                        className="studio-settings-dock"
                    />
                )}
            </div>
        </StudioTheme>
    );
}
