// App.tsx
// Main entry point for the renderer process React application.
// Handles routing between HomePage and Settings, and manages update dialogs and error boundaries.

import { ErrorBoundary } from "@/ui/components/ErrorBoundary";
import { useState, useEffect } from "react";
import HomePage from "@/ui/components/HomePage";
import Settings from "@/features/settings/components/Settings";
import Titlebar from "@/ui/components/Titlebar";
import UpdateDialog from "@/ui/components/UpdateDialog";
import UITestPage from "@/ui/components/UITestPage";
import "@/core/i18n"; // Initialize i18n

/**
 * The main App component for the renderer process.
 * Handles navigation between HomePage and Settings, and displays update dialogs.
 */
export default function App() {
    // Check if this is the test window
    const isTestMode =
        new URLSearchParams(window.location.search).get("testmode") === "true";

    // State to control which page is shown
    const [showSettings, setShowSettings] = useState(false);
    // State to control update dialog visibility
    const [showUpdateDialog, setShowUpdateDialog] = useState(false);

    // Handlers for window controls
    const handleMinimize = () => window.electronAPI?.minimize?.();
    const handleClose = () => window.electronAPI?.close?.();
    const handleSettings = () => setShowSettings((prev) => !prev);

    useEffect(() => {
        // Listen for IPC events to open settings or show update dialog
        window.electronAPI.on("open-settings", () => setShowSettings(true));
        window.electronAPI.on("show-update-dialog", () =>
            setShowUpdateDialog(true)
        );
    }, []);

    /**
     * Handles closing the settings page.
     */
    const handleCloseSettings = () => setShowSettings(false);

    // If this is the test window, render only the UITestPage
    if (isTestMode) {
        return (
            <ErrorBoundary>
                <Titlebar
                    onMinimize={handleMinimize}
                    onClose={handleClose}
                    onSettings={handleSettings}
                    showSettings={false}
                />
                <UITestPage />
            </ErrorBoundary>
        );
    }

    return (
        <ErrorBoundary>
            <Titlebar
                onMinimize={handleMinimize}
                onClose={handleClose}
                onSettings={handleSettings}
            />
            {showSettings ? (
                <Settings onClose={handleCloseSettings} />
            ) : (
                <HomePage />
            )}
            {showUpdateDialog && <UpdateDialog />}
        </ErrorBoundary>
    );
}
