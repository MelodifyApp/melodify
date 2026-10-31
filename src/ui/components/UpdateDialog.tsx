// UpdateDialog.tsx
// Studio-themed update toast. Real update state/actions only.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateStatus } from "@/ui/hooks/useUpdateStatus";
import { Button } from "@/ui/components/studio";

export default function UpdateDialog() {
    const { t } = useTranslation();
    const { status, progress, manifest } = useUpdateStatus();
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (
            status === "available" ||
            status === "downloaded" ||
            status === "installing" ||
            status === "install-error" ||
            status === "error"
        ) {
            setDismissed(false);
        }
    }, [status]);

    if (
        dismissed ||
        (status !== "available" &&
            status !== "downloading" &&
            status !== "downloaded" &&
            status !== "installing" &&
            status !== "install-error" &&
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
        <section
            className="studio-update-toast"
            role="status"
            aria-live="polite"
            data-tone={status === "error" || status === "install-error" ? "error" : undefined}
        >
            {status === "downloaded" ? (
                <>
                    <h2>{t("updates.readyTitle")}</h2>
                    <p>
                        {t("updates.readyCopy", {
                            version: manifest?.version || "—",
                        })}
                    </p>
                    <div className="studio-update-actions">
                        <Button variant="primary" onClick={handleInstall}>
                            {t("updates.installNow")}
                        </Button>
                        <Button variant="ghost" onClick={handleDismiss}>
                            {t("updates.later")}
                        </Button>
                    </div>
                </>
            ) : status === "downloading" ? (
                <>
                    <h2>{t("updates.downloadingTitle")}</h2>
                    <p>
                        {progress?.percent
                            ? t("updates.complete", {
                                  percent: Math.round(progress.percent),
                              })
                            : t("updates.preparing")}
                    </p>
                    {progress?.percent ? (
                        <div
                            className="studio-update-progress"
                            role="progressbar"
                            aria-label={t("updates.downloadingTitle")}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(progress.percent)}
                        >
                            <span
                                style={{
                                    width: `${progress.percent}%`,
                                }}
                            />
                        </div>
                    ) : null}
                </>
            ) : status === "available" ? (
                <>
                    <h2>{t("updates.availableTitle")}</h2>
                    <p>
                        {t("updates.availableCopy", {
                            version: manifest?.version || "—",
                        })}
                    </p>
                    <div className="studio-update-actions">
                        <Button variant="primary" onClick={handleDownload}>
                            {t("updates.download")}
                        </Button>
                        <Button variant="ghost" onClick={handleDismiss}>
                            {t("updates.skip")}
                        </Button>
                    </div>
                </>
            ) : status === "installing" ? (
                <>
                    <h2>{t("updates.installingTitle")}</h2>
                    <p>{t("updates.installingCopy")}</p>
                </>
            ) : status === "install-error" ? (
                <>
                    <h2>{t("updates.installErrorTitle")}</h2>
                    <p>{t("updates.installErrorCopy")}</p>
                    <div className="studio-update-actions">
                        <Button variant="primary" onClick={handleInstall}>
                            {t("updates.installRetry")}
                        </Button>
                        <Button variant="ghost" onClick={handleDismiss}>
                            {t("updates.dismiss")}
                        </Button>
                    </div>
                </>
            ) : status === "error" ? (
                <>
                    <h2>{t("updates.errorTitle")}</h2>
                    <p>{t("updates.errorCopy")}</p>
                    <div className="studio-update-actions">
                        <Button
                            variant="primary"
                            onClick={() =>
                                window.electronAPI?.send?.("update:check")
                            }
                        >
                            {t("updates.retry")}
                        </Button>
                        <Button variant="ghost" onClick={handleDismiss}>
                            {t("updates.dismiss")}
                        </Button>
                    </div>
                </>
            ) : null}
        </section>
    );
}
