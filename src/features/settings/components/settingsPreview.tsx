import "./settingsPreviewEnvironment";
import "@/core/i18n";
import { useEffect, useState } from "react";
import Settings from "./Settings";
import Titlebar from "@/ui/components/Titlebar";
import { Button } from "@/ui/components/studio";
import type { StudioThemeName } from "@/ui/components/studio";
import { initializeCredentialStatusStore } from "@/features/settings/credentialStatusStore";
import "./settingsPreview.css";

/** Development-only host for the actual Settings screen and titlebar. */
export function StudioPreview() {
    if (process.env.NODE_ENV === "production") return null;
    return <SettingsPreviewHost />;
}

function SettingsPreviewHost() {
    const [showSettings, setShowSettings] = useState(true);
    const requested = new URLSearchParams(window.location.search).get("theme");
    const theme: StudioThemeName = requested === "light" || requested === "dark" ? requested : "graphite";
    const close = () => setShowSettings(false);

    useEffect(() => {
        void initializeCredentialStatusStore(
            window.electronAPI as unknown as Parameters<
                typeof initializeCredentialStatusStore
            >[0]
        );
    }, []);

    return (
        <div className="settings-preview-host">
            <Titlebar
                onMinimize={() => undefined}
                onClose={() => undefined}
                onSettings={() => setShowSettings((value) => !value)}
                onHome={close}
            />
            {showSettings ? (
                <Settings onClose={close} theme={theme} />
            ) : (
                <main className="settings-preview-home">
                    <p>Home preview</p>
                    <Button variant="primary" onClick={() => setShowSettings(true)}>Open Settings</Button>
                </main>
            )}
        </div>
    );
}

export default StudioPreview;
