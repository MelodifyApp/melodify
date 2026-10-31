// App.tsx
// Main entry point for the renderer process React application.
// Handles routing between HomePage and Settings, and manages update dialogs and error boundaries.

import { ErrorBoundary } from "@/ui/components/ErrorBoundary";
import { useCallback, useState, useEffect } from "react";
import HomePage from "@/ui/components/HomePage";
import Settings from "@/features/settings/components/Settings";
import type { SettingsSectionId } from "@/features/settings/components/Settings";
import Titlebar from "@/ui/components/Titlebar";
import UpdateDialog from "@/ui/components/UpdateDialog";
import UITestPage from "@/ui/components/UITestPage";
import { StudioTheme } from "@/ui/components/studio";
import type { StudioThemeName } from "@/ui/components/studio";
import { persistTheme, readStoredTheme } from "@/ui/theme";
import "@/core/i18n"; // Initialize i18n
import {
    INITIAL_SETTINGS_VISIBILITY,
    closeSettingsView,
    openSettingsView,
    toggleSettingsView,
} from "./settingsVisibility";
import { initializeCredentialStatusStore } from "@/features/settings/credentialStatusStore";

/**
 * The main App component for the renderer process.
 * Handles navigation between HomePage and Settings, and displays update dialogs.
 */
export default function App() {
    // Check if this is the test window
    const isTestMode =
        new URLSearchParams(window.location.search).get("testmode") === "true";

    // State to control which page is shown. Settings mounts on first open and
    // stays mounted while hidden so drafts, status and scroll survive Home.
    const [settingsVisibility, setSettingsVisibility] = useState(
        INITIAL_SETTINGS_VISIBILITY
    );
    // State to control update dialog visibility
    const [showUpdateDialog, setShowUpdateDialog] = useState(false);
    const [requestedSection, setRequestedSection] =
        useState<SettingsSectionId | null>(null);
    const [theme, setTheme] = useState<StudioThemeName>(() =>
        readStoredTheme(
            typeof window !== "undefined" ? window.localStorage : undefined
        )
    );
    const [maximized, setMaximized] = useState(false);

    // Handlers for window controls
    const handleMinimize = () => window.electronAPI?.minimize?.();
    const handleMaximize = () => window.electronAPI?.maximize?.();
    const handleClose = () => window.electronAPI?.close?.();
    const handleSettings = () => setSettingsVisibility(toggleSettingsView);
    const handleHome = () => setSettingsVisibility(closeSettingsView);
    const handleOpenApiKeys = useCallback(() => {
        setRequestedSection("secrets");
        setSettingsVisibility(openSettingsView);
    }, []);
    const handleRequestedSectionHandled = useCallback(
        () => setRequestedSection(null),
        []
    );
    const handleThemeChange = useCallback((next: StudioThemeName) => {
        setTheme(next);
        persistTheme(
            next,
            typeof window !== "undefined" ? window.localStorage : undefined
        );
    }, []);

    useEffect(() => {
        if (isTestMode || !window.electronAPI) return;
        void initializeCredentialStatusStore(window.electronAPI);
    }, [isTestMode]);

    useEffect(() => {
        const api = window.electronAPI;
        if (!api) return;
        api.isMaximized?.()
            .then((value) => setMaximized(value === true))
            .catch(() => setMaximized(false));
        const onMaximized = (value: boolean) => setMaximized(value === true);
        api.on("window:maximized", onMaximized);
        return () => {
            api.removeListener("window:maximized", onMaximized);
        };
    }, []);

    useEffect(() => {
        // Listen for IPC events to open settings or show update dialog
        window.electronAPI.on("open-settings", () =>
            setSettingsVisibility(openSettingsView)
        );
        window.electronAPI.on("show-update-dialog", () =>
            setShowUpdateDialog(true)
        );
    }, []);

    /**
     * Handles closing the settings page.
     */
    const handleCloseSettings = () => setSettingsVisibility(closeSettingsView);

    // If this is the test window, render only the UITestPage
    if (isTestMode) {
        return (
            <ErrorBoundary>
                <StudioTheme theme={theme} className="studio-app">
                    <Titlebar
                        onMinimize={handleMinimize}
                        onMaximize={handleMaximize}
                        onClose={handleClose}
                        onSettings={handleSettings}
                        onHome={handleHome}
                        onThemeChange={handleThemeChange}
                        theme={theme}
                        maximized={maximized}
                        showSettings={false}
                    />
                    <UITestPage />
                </StudioTheme>
            </ErrorBoundary>
        );
    }

    return (
        <ErrorBoundary>
            <StudioTheme theme={theme} className="studio-app">
                <Titlebar
                    onMinimize={handleMinimize}
                    onMaximize={handleMaximize}
                    onClose={handleClose}
                    onSettings={handleSettings}
                    onHome={handleHome}
                    onThemeChange={handleThemeChange}
                    theme={theme}
                    maximized={maximized}
                />
                {settingsVisibility.mounted && (
                    <div hidden={!settingsVisibility.open}>
                        <Settings
                            onClose={handleCloseSettings}
                            active={settingsVisibility.open}
                            theme={theme}
                            requestedSection={requestedSection ?? undefined}
                            onRequestedSectionHandled={
                                handleRequestedSectionHandled
                            }
                        />
                    </div>
                )}
                {!settingsVisibility.open && (
                    <HomePage
                        theme={theme}
                        onOpenSettings={handleOpenApiKeys}
                    />
                )}
                {showUpdateDialog && <UpdateDialog />}
            </StudioTheme>
        </ErrorBoundary>
    );
}
