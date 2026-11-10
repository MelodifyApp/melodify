import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type FocusEvent,
} from "react";
import { useTranslation } from "react-i18next";
import General from "./sections/General";
import Secrets from "./sections/Secrets";
import Requests from "./sections/Requests";
import Commands from "./sections/Commands";
import Logs from "./sections/Logs";
import Debug from "./sections/Debug";
import { Button, SectionNav, StudioTheme } from "@/ui/components/studio";
import type { SectionNavGroup, StudioThemeName } from "@/ui/components/studio";
import InlineError from "@/ui/components/InlineError";
import {
    buildConfigSavePatch,
    acknowledgeSongFilePath,
    commitAcknowledgedDraft,
    createDraftState,
    editDraftConfig,
    toggleDraftCommand,
} from "./draftState";
import { autoSaveDelayForKey } from "./autoSavePolicy";
import type { SecretServiceId } from "../secretsSave";
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
    const [logs, setLogs] = useState<any[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
    const [hasNavigated, setHasNavigated] = useState(false);
    const [animateSections, setAnimateSections] = useState(false);
    const contentRef = useRef<HTMLElement>(null);
    const headingRef = useRef<HTMLHeadingElement>(null);
    const draftsRef = useRef(drafts);
    const loadedRef = useRef(false);
    const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveInFlight = useRef(false);
    const pendingAutoSave = useRef(false);

    const loadSettings = useCallback(async (reloadFirst = false) => {
        if (autoSaveTimer.current) {
            clearTimeout(autoSaveTimer.current);
            autoSaveTimer.current = null;
        }
        pendingAutoSave.current = false;
        setLoading(true);
        setLoaded(false);
        setLoadError(false);
        setAutoSaveError(null);
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
            const nextDrafts = createDraftState(configData, commandsData);
            draftsRef.current = nextDrafts;
            setDrafts(nextDrafts);
            setAutoSaveError(null);
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
        draftsRef.current = drafts;
    }, [drafts]);

    useEffect(() => {
        loadedRef.current = loaded;
    }, [loaded]);

    useEffect(() => {
        return () => {
            if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        };
    }, []);

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

    const saveErrorMessage = (result: ConfigSaveResponse): string => {
        if (
            result?.code === "rejected" &&
            Array.isArray(result.rejected) &&
            result.rejected.length > 0
        ) {
            const keys = result.rejected
                .map((entry) => String(entry.key || ""))
                .filter(Boolean)
                .join(", ");
            return keys
                ? t("settings.saveRejected", { keys })
                : t("settings.saveFailed");
        }
        if (result?.code === "write-failed") {
            return t("settings.saveWriteFailed");
        }
        return t("settings.saveFailed");
    };

    const runAutoSave = async () => {
        if (!loadedRef.current || saveInFlight.current) {
            if (saveInFlight.current) pendingAutoSave.current = true;
            return;
        }
        const submitted = draftsRef.current;
        const patch = buildConfigSavePatch(submitted);
        if (Object.keys(patch).length === 0) {
            setAutoSaveError(null);
            return;
        }

        saveInFlight.current = true;
        pendingAutoSave.current = false;
        setAutoSaveError(null);
        let saveAgain = false;
        const languageChanged =
            submitted.draftConfig.language &&
            submitted.draftConfig.language !== submitted.baselineConfig.language;

        try {
            const result: ConfigSaveResponse = await window.electronAPI.invoke(
                "config:save",
                patch
            );
            if (result?.ok !== true) {
                pendingAutoSave.current = false;
                setAutoSaveError(saveErrorMessage(result));
                return;
            }

            const acknowledgedConfig =
                result.config &&
                typeof result.config === "object" &&
                !Array.isArray(result.config)
                    ? result.config
                    : patch;
            const acknowledged = commitAcknowledgedDraft(
                draftsRef.current,
                acknowledgedConfig,
                patch
            );
            draftsRef.current = acknowledged;
            setDrafts(acknowledged);
            setAutoSaveError(null);

            if (languageChanged) {
                void i18n.changeLanguage(
                    String(submitted.draftConfig.language)
                );
            }

            saveAgain = pendingAutoSave.current;
            pendingAutoSave.current = false;
        } catch (error) {
            console.error("Failed to save settings", error);
            pendingAutoSave.current = false;
            setAutoSaveError(t("settings.saveFailed"));
        } finally {
            saveInFlight.current = false;
        }

        if (saveAgain) {
            void runAutoSave();
        }
    };

    const scheduleAutoSave = (delay: number) => {
        if (!loadedRef.current) return;
        if (autoSaveTimer.current) {
            clearTimeout(autoSaveTimer.current);
            autoSaveTimer.current = null;
        }
        if (delay === 0) {
            void runAutoSave();
            return;
        }
        // A newer text edit supersedes any request that became due while the
        // previous save was in flight; honor the debounce for the new value.
        pendingAutoSave.current = false;
        autoSaveTimer.current = setTimeout(() => {
            autoSaveTimer.current = null;
            void runAutoSave();
        }, delay);
    };

    const handleConfigChange = (key: string, value: unknown) => {
        const current = draftsRef.current;
        const next =
            key === "currentSongFilePath" && typeof value === "string"
                ? acknowledgeSongFilePath(current, value)
                : editDraftConfig(current, key, value);
        draftsRef.current = next;
        setDrafts(next);
        setAutoSaveError(null);
        const delay = autoSaveDelayForKey(key, value);
        if (delay < 0) return;
        scheduleAutoSave(delay);
    };
    const handleCommandToggle = (name: string, enabled: boolean) => {
        const next = toggleDraftCommand(draftsRef.current, name, enabled);
        draftsRef.current = next;
        setDrafts(next);
        setAutoSaveError(null);
        scheduleAutoSave(0);
    };
    const handleCredentialsSaved = (
        serviceId: SecretServiceId,
        clientId: string
    ) => {
        const key = `${serviceId}ClientId`;
        setDrafts((current) => {
            const next = {
                ...current,
                draftConfig: {
                    ...current.draftConfig,
                    [key]: clientId,
                },
                baselineConfig: {
                    ...current.baselineConfig,
                    [key]: clientId,
                },
            };
            draftsRef.current = next;
            return next;
        });
    };

    const flushPendingAutoSave = () => {
        if (autoSaveTimer.current) {
            clearTimeout(autoSaveTimer.current);
            autoSaveTimer.current = null;
        }
        if (saveInFlight.current) {
            pendingAutoSave.current = true;
            return;
        }
        void runAutoSave();
    };

    const handleBlurCapture = (event: FocusEvent<HTMLElement>) => {
        if (!["general", "requests", "commands"].includes(activeSection)) {
            return;
        }
        if (
            event.target instanceof HTMLInputElement ||
            event.target instanceof HTMLTextAreaElement
        ) {
            flushPendingAutoSave();
        }
    };

    const handleHome = () => {
        flushPendingAutoSave();
        onClose();
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                document.querySelector<HTMLElement>("[data-titlebar-brand]")?.focus();
            });
        });
    };

    useEffect(() => {
        if (active || !loadedRef.current) return;
        flushPendingAutoSave();
        // The active flag is the lifecycle boundary; refs contain the latest
        // drafts and in-flight state, so no further dependencies are needed.
    }, [active]);

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
                        setAnimateSections(true);
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
                    onBlurCapture={handleBlurCapture}
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
                        {autoSaveError && (
                            <div className="studio-settings-save-alert">
                                <InlineError message={autoSaveError} />
                            </div>
                        )}
                        <div
                            key={activeSection}
                            className="studio-settings-section"
                            data-enter={animateSections ? "true" : undefined}
                        >
                            {activeSection === "general" && (
                                <General config={drafts.draftConfig} onConfigChange={handleConfigChange} />
                            )}
                            {activeSection === "secrets" && (
                                <Secrets
                                    config={drafts.draftConfig}
                                    onCredentialsSaved={handleCredentialsSaved}
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
                    </div>
                </main>
            </div>
        </StudioTheme>
    );
}
