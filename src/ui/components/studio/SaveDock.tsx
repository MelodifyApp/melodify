import { forwardRef } from "react";
import type { HTMLAttributes, MouseEventHandler } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../../shared/utils";
import { Button } from "./Button";
import { StatusChip } from "./StatusChip";
import { CheckIcon } from "./icons";

type DockCommon = Omit<HTMLAttributes<HTMLElement>, "children">;
export type SaveDockProps = DockCommon & (
    | { mode?: "settings"; dirty: boolean; onSave: MouseEventHandler<HTMLButtonElement>; onDiscard: MouseEventHandler<HTMLButtonElement>; saving?: boolean; disabled?: boolean; error?: string | null; draftPending?: never }
    | { mode: "api"; draftPending?: boolean; dirty?: never; onSave?: never; onDiscard?: never; saving?: never; disabled?: never; error?: never }
    | { mode: "auto"; status: "saved" | "saving" | "error"; error?: string | null; onRetry?: MouseEventHandler<HTMLButtonElement>; dirty?: never; onSave?: never; onDiscard?: never; saving?: never; disabled?: never; draftPending?: never }
);

/** Reserved flex sibling, not an overlay. This component never persists anything. */
export const SaveDock = forwardRef<HTMLElement, SaveDockProps>((props, ref) => {
    const { t } = useTranslation();
    const { mode = "settings", className, draftPending = false, dirty, onSave, onDiscard, saving = false, disabled, error, ...footerProps } = props;
    const errorMessage = error?.trim() || "";
    if (props.mode === "auto") {
        const { status, onRetry, ...autoFooterProps } = props;
        const failed = status === "error";
        const label = failed
            ? errorMessage || t("saveDock.saveFailed", { defaultValue: "Could not save changes" })
            : status === "saving"
              ? t("saveDock.saving", { defaultValue: "Saving…" })
              : t("common.saved", { defaultValue: "Saved" });
        return (
            <footer {...autoFooterProps} ref={ref} className={cn("studio-save-dock", className)} data-mode={mode} aria-label={props["aria-label"] || t("saveDock.autoActions", { defaultValue: "Automatic settings save status" })}>
                <span className="studio-save-status-slot">
                    <span className="studio-save-state" data-dirty={failed || undefined} data-tone={failed ? "error" : undefined} role={failed ? "alert" : "status"} aria-live={failed ? "assertive" : "polite"} aria-atomic="true">
                        <span className="studio-status-icon" aria-hidden="true">
                            {status === "saving" ? <span className="studio-spinner" /> : failed ? <span className="studio-status-dot" /> : <CheckIcon />}
                        </span>
                        {label}
                    </span>
                </span>
                {failed && onRetry && (
                    <div className="studio-save-actions">
                        <Button variant="secondary" onClick={onRetry}>
                            {t("saveDock.retry", { defaultValue: "Retry" })}
                        </Button>
                    </div>
                )}
            </footer>
        );
    }
    if (props.mode === "api") {
        return (
            <footer {...footerProps} ref={ref} className={cn("studio-save-dock", className)} data-mode={mode} aria-label={props["aria-label"] || t("saveDock.apiActions", { defaultValue: "API credential actions" })}>
                <span className="studio-save-status-slot" data-hidden={!draftPending} aria-hidden={!draftPending}>
                    <StatusChip
                        status="api-draft"
                        label={t("common.apiDraftPending", {
                            defaultValue: "API draft pending",
                        })}
                    />
                </span>
                <span className="studio-save-note">{t("saveDock.credentialsSavePerService", { defaultValue: "Credentials save per service" })}</span>
            </footer>
        );
    }
    return (
        <footer {...footerProps} ref={ref} className={cn("studio-save-dock", className)} data-mode={mode} aria-label={props["aria-label"] || t("saveDock.settingsActions", { defaultValue: "Settings save actions" })}>
            <span className="studio-save-status-slot">
                <span className="studio-save-state" data-dirty={dirty || undefined} data-tone={errorMessage ? "error" : undefined} role={errorMessage ? "alert" : "status"} aria-live={errorMessage ? "assertive" : "polite"} aria-atomic="true">
                    <span className="studio-status-icon" aria-hidden="true">{dirty || errorMessage ? <span className="studio-status-dot" /> : <CheckIcon />}</span>
                    {errorMessage || (dirty ? t("saveDock.unsavedChanges", { defaultValue: "Unsaved changes" }) : t("common.saved", { defaultValue: "Saved" }))}
                </span>
            </span>
            <div className="studio-save-actions">
                <Button variant="primary" loading={saving} disabled={disabled} onClick={onSave} aria-label={t("saveDock.saveSettings", { defaultValue: "Save settings" })}>{t("common.save", { defaultValue: "Save" })}</Button>
                <Button variant="ghost" disabled={disabled || saving} onClick={onDiscard} aria-label={t("saveDock.discardTitle", { defaultValue: "Discard unsaved settings and command edits." })} title={t("saveDock.discardTitle", { defaultValue: "Discard unsaved settings and command edits." })}>{t("saveDock.discard", { defaultValue: "Discard" })}</Button>
            </div>
        </footer>
    );
});
SaveDock.displayName = "SaveDock";
