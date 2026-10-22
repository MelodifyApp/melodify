import { useState, useEffect, useRef } from "react";
import { AlertCircle, CheckCircle2, ChevronLeftIcon, Clock, MoveLeftIcon } from "lucide-react";
import General from "./sections/General";
import Secrets from "./sections/Secrets";
import Requests from "./sections/Requests";
import Commands from "./sections/Commands";
import Logs from "./sections/Logs";
import Debug from "./sections/Debug";
import { useTranslation } from "react-i18next";

const NAVIGATION_SECTIONS = [
    {
        id: "general",
        title: "general",
        component: General,
    },
    {
        id: "secrets",
        title: "secrets",
        component: Secrets,
    },
    {
        id: "requests",
        title: "requests",
        component: Requests,
    },
    {
        id: "commands",
        title: "commands",
        component: Commands,
    },
    {
        id: "logs",
        title: "logs",
        component: Logs,
    },
    ...(process.env.NODE_ENV === "development"
        ? [
              {
                  id: "debug",
                  title: "debug",
                  component: Debug,
              },
          ]
        : []),
];

interface SettingsProps {
    onClose: () => void;
}

export default function Settings({ onClose }: SettingsProps) {
    const { t } = useTranslation();
    const [activeSection, setActiveSection] = useState("general");
    const [config, setConfig] = useState<any>({});
    const [commands, setCommands] = useState<any[]>([]);
    const [logs, setLogs] = useState<any[]>([]);
    const [saveStatus, setSaveStatus] = useState<
        "idle" | "saving" | "saved" | "error"
    >("idle");
    const [unsavedChanges, setUnsavedChanges] = useState(false);

    const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
    const contentRef = useRef<HTMLDivElement>(null);

    // Load initial data
    useEffect(() => {
        Promise.all([
            window.electronAPI.invoke("config:get"),
            window.electronAPI.invoke("commands:getAll"),
            activeSection === "logs"
                ? window.electronAPI.invoke("log:getAll")
                : Promise.resolve([]),
        ]).then(([configData, commandsData, logsData]) => {
            setConfig(configData || {});
            setCommands(commandsData || []);
            setLogs(logsData || []);
        });
    }, [activeSection]);

    // Reset scroll position when section changes
    useEffect(() => {
        if (contentRef.current) {
            contentRef.current.scrollTop = 0;
        }
    }, [activeSection]);

    // Auto-save with debouncing
    const autoSave = (newConfig: any) => {
        setUnsavedChanges(true);
        setSaveStatus("saving");

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(() => {
            try {
                window.electronAPI.send("config:set", newConfig);
                setSaveStatus("saved");
                setUnsavedChanges(false);

                setTimeout(() => setSaveStatus("idle"), 2000);
            } catch (error) {
                setSaveStatus("error");
                setTimeout(() => setSaveStatus("idle"), 3000);
            }
        }, 500);
    };

    const handleConfigChange = (key: string, value: any) => {
        const newConfig = { ...config, [key]: value };
        setConfig(newConfig);

        // Credentials are stored through their dedicated IPC paths; the
        // config:set allowlist intentionally refuses credential fields.
        if (key.endsWith("ClientSecret")) {
            const prefix = key.slice(0, -"ClientSecret".length);
            window.electronAPI.send(`${prefix}:setSecrets`, {
                [`${prefix}ClientId`]: newConfig[`${prefix}ClientId`],
                [key]: value,
            });
            setSaveStatus("saved");
            setUnsavedChanges(false);
            return;
        }

        autoSave(newConfig);
    };

    const handleCommandToggle = (commandName: string, enabled: boolean) => {
        window.electronAPI.send("commands:setEnabled", {
            name: commandName,
            enabled,
        });
        setCommands((prev) =>
            prev.map((cmd) =>
                cmd.name === commandName ? { ...cmd, enabled } : cmd
            )
        );
    };

    const handleReset = () => {
        if (confirm("Reset all settings to defaults? This cannot be undone.")) {
            window.electronAPI.invoke("config:reset").then(() => {
                window.electronAPI.invoke("config:get").then(setConfig);
            });
        }
    };

    const getStatusIndicator = () => {
        switch (saveStatus) {
            // case "saving":
            //     return (
            //         <div className="flex items-center gap-1.5 text-yellow-400">
            //             <Clock className="w-3.5 h-3.5 animate-spin" />
            //             <span className="text-xs whitespace-nowrap">
            //                 {t("common.saving")}
            //             </span>
            //         </div>
            //     );
            case "saved":
                return (
                    <div className="flex items-center gap-1.5 text-melodify-primary">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {/* <span className="text-xs whitespace-nowrap">
                            {t("common.saved")}
                        </span> */}
                    </div>
                );
            // case "error":
            //     return (
            //         <div className="flex items-center gap-1.5 text-red-400">
            //             <AlertCircle className="w-3.5 h-3.5" />
            //             <span className="text-xs whitespace-nowrap">
            //                 {t("common.error")}
            //             </span>
            //         </div>
            //     );
            default:
                // return unsavedChanges ? (
                //     <div className="flex items-center gap-1.5 text-zinc-400">
                //         <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                //         <span className="text-xs whitespace-nowrap">
                //             Unsaved
                //         </span>
                //     </div>
                // ) : (
                return <div className="w-3.5 h-3.5" /> // Invisible spacer to maintain consistent height
                // );
        }
    };
    return (
        <div className="fixed left-0 bottom-0 w-full h-screen z-50 flex bg-zinc-950">
            <div className="w-48 bg-zinc-900 border-r border-zinc-700/70 flex flex-col">
                <div className="p-4 border-b border-zinc-700/60">
                    <div className="flex items-center justify-between">
                        <h1 className="text-lg font-semibold text-white">
                            {t("settings.title")}
                        </h1>
                    </div>
                </div>

                <div className="flex-1 p-2 space-y-1 overflow-y-auto">
                    {NAVIGATION_SECTIONS.map((section) => {
                        const isActive = activeSection === section.id;
                        return (
                            <button
                                key={section.id}
                                onClick={() => setActiveSection(section.id)}
                                className={`w-full px-3 py-2 rounded text-left text-sm transition-colors ${
                                    isActive
                                        ? "bg-zinc-800 text-white border-l-2 border-l-melodify-primary"
                                        : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                                }`}
                            >
                                {t(`settings.${section.title}`)}
                            </button>
                        );
                    })}
                </div>

                <div className="p-3">
                    <div className="flex items-center justify-between min-h-[20px]">
                        <button
                            className="flex items-center gap-1 text-zinc-400 hover:text-white cursor-pointer text-xs transition-colors"
                            onClick={onClose}
                        >
                            <ChevronLeftIcon className="w-5 h-5" />
                            <span>{t("navigation.homePage")}</span>
                        </button>
                        <div className="min-w-[80px] flex justify-end">
                            {getStatusIndicator()}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col bg-zinc-900">
                <div ref={contentRef} className="flex-1 overflow-y-auto">
                    <div className="p-6 max-w-5xl">
                        {activeSection === "general" && (
                            <General
                                config={config}
                                onConfigChange={handleConfigChange}
                            />
                        )}
                        {activeSection === "secrets" && (
                            <Secrets
                                config={config}
                                onConfigChange={handleConfigChange}
                            />
                        )}
                        {activeSection === "requests" && (
                            <Requests
                                config={config}
                                onConfigChange={handleConfigChange}
                            />
                        )}
                        {activeSection === "commands" && (
                            <Commands
                                config={config}
                                commands={commands}
                                onConfigChange={handleConfigChange}
                                onCommandToggle={handleCommandToggle}
                            />
                        )}
                        {activeSection === "logs" && <Logs logs={logs} />}
                        {activeSection === "debug" && <Debug />}
                    </div>
                </div>
            </div>
        </div>
    );
}
