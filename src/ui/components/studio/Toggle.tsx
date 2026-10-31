import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../../../shared/utils";

export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role" | "checked" | "defaultChecked" | "children"> {
    label: ReactNode;
    helper?: ReactNode;
    checked: boolean;
    onCheckedChange?: (checked: boolean) => void;
    wrapperClassName?: string;
}

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
    ({ id, label, helper, checked, disabled, onCheckedChange, onChange, className, wrapperClassName, "aria-describedby": describedBy, ...props }, ref) => {
        const generated = useId();
        const controlId = id || `studio-toggle-${generated}`;
        const descriptions = [describedBy, helper ? `${controlId}-helper` : undefined].filter(Boolean).join(" ") || undefined;
        return (
            <div className={cn("studio-toggle-row", wrapperClassName)} data-disabled={disabled || undefined}>
                <div className="studio-toggle-copy">
                    <label htmlFor={controlId}>{label}</label>
                    {helper && <span className="studio-field-helper" id={`${controlId}-helper`}>{helper}</span>}
                </div>
                <input {...props} ref={ref} id={controlId} type="checkbox" role="switch" checked={checked} disabled={disabled} aria-checked={checked} aria-describedby={descriptions}
                    className={cn("studio-toggle", className)}
                    onChange={event => { onChange?.(event); if (!event.defaultPrevented) onCheckedChange?.(event.currentTarget.checked); }} />
            </div>
        );
    }
);
Toggle.displayName = "Toggle";
