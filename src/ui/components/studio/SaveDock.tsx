import { forwardRef } from "react";
import type { HTMLAttributes, MouseEventHandler } from "react";
import { cn } from "../../../shared/utils";
import { Button } from "./Button";
import { StatusChip } from "./StatusChip";
import { CheckIcon } from "./icons";

type DockCommon = Omit<HTMLAttributes<HTMLElement>, "children">;
export type SaveDockProps = DockCommon & (
    | { mode?: "settings"; dirty: boolean; onSave: MouseEventHandler<HTMLButtonElement>; onDiscard: MouseEventHandler<HTMLButtonElement>; saving?: boolean; disabled?: boolean; error?: string | null; draftPending?: never }
    | { mode: "api"; draftPending?: boolean; dirty?: never; onSave?: never; onDiscard?: never; saving?: never; disabled?: never; error?: never }
);

/** Reserved flex sibling, not an overlay. This component never persists anything. */
export const SaveDock = forwardRef<HTMLElement, SaveDockProps>((props, ref) => {
    const { mode = "settings", className, draftPending = false, dirty, onSave, onDiscard, saving = false, disabled, error, ...footerProps } = props;
    const errorMessage = error?.trim() || "";
    if (props.mode === "api") {
        return (
            <footer {...footerProps} ref={ref} className={cn("studio-save-dock", className)} data-mode={mode} aria-label={props["aria-label"] || "API credential actions"}>
                <span className="studio-save-status-slot" data-hidden={!draftPending} aria-hidden={!draftPending}>
                    <StatusChip status="api-draft" />
                </span>
                <span className="studio-save-note">Credentials save per service</span>
            </footer>
        );
    }
    return (
        <footer {...footerProps} ref={ref} className={cn("studio-save-dock", className)} data-mode={mode} aria-label={props["aria-label"] || "Settings save actions"}>
            <span className="studio-save-status-slot">
                <span className="studio-save-state" data-dirty={dirty || undefined} data-tone={errorMessage ? "error" : undefined} role={errorMessage ? "alert" : "status"} aria-live={errorMessage ? "assertive" : "polite"} aria-atomic="true">
                    <span className="studio-status-icon" aria-hidden="true">{dirty || errorMessage ? <span className="studio-status-dot" /> : <CheckIcon />}</span>
                    {errorMessage || (dirty ? "Unsaved changes" : "Saved")}
                </span>
            </span>
            <div className="studio-save-actions">
                <Button variant="primary" loading={saving} disabled={disabled} onClick={onSave} aria-label="Save settings">Save</Button>
                <Button variant="ghost" disabled={disabled || saving} onClick={onDiscard} aria-label="Discard unsaved settings and command edits." title="Discard unsaved settings and command edits.">Discard</Button>
            </div>
        </footer>
    );
});
SaveDock.displayName = "SaveDock";
