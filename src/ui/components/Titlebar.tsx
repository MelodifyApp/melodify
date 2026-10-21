// Titlebar.tsx
// Custom title bar component for the Electron app, including app name, version, update status, and window controls.

import React from "react";
import { SettingsIcon, XIcon, Music, TestTube } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Props for the Titlebar component.
 * @property onMinimize - Function to minimize the window.
 * @property onClose - Function to close the window.
 * @property onSettings - Function to open the settings page.
 */
interface TitlebarProps {
    onMinimize: () => void;
    onClose: () => void;
    onSettings: () => void;
    showSettings?: boolean;
}

/**
 * Renders the custom title bar for the Electron app.
 * Displays app name, version, update status, and window controls.
 */
export default function Titlebar({
    onMinimize,
    onClose,
    onSettings,
    showSettings = true,
}: TitlebarProps) {
    const { t } = useTranslation();
    const isDevelopment = process.env.NODE_ENV === "development";

    const openUITestWindow = () => {
        window.electronAPI?.openUITestWindow();
    };

    return (
        <div
            className="w-full flex items-center border-b border-zinc-700/70 justify-between bg-zinc-900 h-9 select-none pl-3 gap-3"
            style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-melodify-primary rounded-md flex items-center justify-center">
                        <Music className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="flex items-center font-bold text-white">
                        {t("app.name")}
                    </div>
                </div>
            </div>

            <div
                className="flex items-center h-full ml-auto"
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
                {isDevelopment && (
                    <button
                        className="h-full w-10 flex items-center justify-center transition-colors hover:bg-zinc-800 text-melodify-secondary border-none bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-melodify-secondary"
                        onClick={openUITestWindow}
                        title="UI Test Window (Dev Only)"
                        aria-label="Open UI Test Window"
                    >
                        <TestTube className="size-4" />
                    </button>
                )}
                {showSettings && (
                    <button
                        className="h-full w-10 flex items-center justify-center transition-colors hover:bg-zinc-800 text-zinc-300 border-none bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-melodify-primary"
                        onClick={onSettings}
                        title={t("settings.title")}
                        aria-label={t("settings.title")}
                    >
                        <SettingsIcon className="size-4" />
                    </button>
                )}
                <button
                    className="h-full w-10 flex items-center justify-center transition-colors hover:bg-zinc-800 text-zinc-300 border-none bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-melodify-primary"
                    onClick={onMinimize}
                    title="Minimize"
                    aria-label="Minimize window"
                >
                    <svg width="16" height="16" fill="none" viewBox="0 0 16 16">
                        <rect
                            y="7.5"
                            width="16"
                            height="1"
                            rx="0.5"
                            fill="currentColor"
                        />
                    </svg>
                </button>
                <button
                    className="h-full w-12 flex items-center justify-center transition-colors hover:bg-red-700 text-zinc-300 border-none bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
                    onClick={onClose}
                    title={t("common.close")}
                    aria-label="Close application"
                >
                    <XIcon className="size-5" />
                </button>
            </div>
        </div>
    );
}
