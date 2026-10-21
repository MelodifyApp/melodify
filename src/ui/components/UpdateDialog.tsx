// UpdateDialog.tsx
// Displays a dialog for update status in the Electron app, including restart prompt when an update is downloaded.

import { useEffect, useState } from "react";
import { useUpdateStatus } from "@/ui/hooks/useUpdateStatus";
import { Button } from "./Button";

/**
 * UpdateDialog component displays update status and restart prompt.
 * Listens for update events from the main process using the new basic-electron-updater integration.
 */
export default function UpdateDialog() {
    const { status, progress, manifest } = useUpdateStatus();
    const [dismissed, setDismissed] = useState(false);

    // Reset dismissed state when new update is available
    useEffect(() => {
        if (status === "available") {
            setDismissed(false);
        }
    }, [status]);

    // Don't show if dismissed or no relevant status
    if (
        dismissed ||
        (status !== "available" &&
            status !== "downloading" &&
            status !== "downloaded" &&
            status !== "error")
    ) {
        return null;
    }

    const handleDownload = () => {
        window.electronAPI?.send?.("update:download", manifest);
    };

    const handleInstall = () => {
        window.electronAPI?.send?.("update:install");
    };

    const handleDismiss = () => {
        setDismissed(true);
    };

    return (
        <div className="fixed bottom-5 right-5 bg-zinc-900 border border-zinc-700 border-l-2 border-l-melodify-primary text-white px-4 py-3 rounded-md shadow-lg z-50 max-w-sm">
            {status === "downloaded" ? (
                <div>
                    <div className="font-bold mb-1">Update Ready!</div>
                    <div className="mb-2">
                        Version {manifest?.version} is ready to install. The app
                        will restart to apply the update.
                    </div>
                    <div className="flex gap-2">
                        <Button
                            className="bg-white text-melodify-primary hover:bg-gray-100"
                            onClick={handleInstall}
                        >
                            Install Now
                        </Button>
                        <Button
                            className="bg-melodify-secondary hover:bg-melodify-secondary-dark"
                            onClick={handleDismiss}
                        >
                            Later
                        </Button>
                    </div>
                </div>
            ) : status === "downloading" ? (
                <div>
                    <div className="font-bold mb-1">Downloading Update...</div>
                    <div className="mb-2">
                        {progress?.percent
                            ? `${Math.round(progress.percent)}% complete`
                            : "Preparing download..."}
                    </div>
                    {progress?.percent && (
                        <div className="w-full bg-melodify-primary-darker rounded-full h-2">
                            <div
                                className="bg-white h-2 rounded-full transition-all duration-300"
                                style={{ width: `${progress.percent}%` }}
                            ></div>
                        </div>
                    )}
                </div>
            ) : status === "available" ? (
                <div>
                    <div className="font-bold mb-1">Update Available</div>
                    <div className="mb-2">
                        Version {manifest?.version} is available. Would you like
                        to download it?
                    </div>
                    <div className="flex gap-2">
                        <Button
                            className="bg-white text-melodify-primary hover:bg-gray-100"
                            onClick={handleDownload}
                        >
                            Download
                        </Button>
                        <Button
                            className="bg-melodify-secondary hover:bg-melodify-secondary-dark"
                            onClick={handleDismiss}
                        >
                            Skip
                        </Button>
                    </div>
                </div>
            ) : status === "error" ? (
                <div>
                    <div className="font-bold mb-1 text-red-400">
                        Update Error
                    </div>
                    <div className="mb-2">
                        There was an error while checking for updates. Please
                        try again later.
                    </div>
                    <div className="flex gap-2">
                        <Button
                            className="bg-white text-melodify-primary hover:bg-gray-100"
                            onClick={() =>
                                window.electronAPI?.send?.("update:check")
                            }
                        >
                            Retry
                        </Button>
                        <Button
                            className="bg-melodify-secondary hover:bg-melodify-secondary-dark"
                            onClick={handleDismiss}
                        >
                            Dismiss
                        </Button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
