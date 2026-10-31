import { forwardRef, useId } from "react";
import type { AriaAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { cn } from "../../../shared/utils";

export interface FieldControlProps {
    id: string;
    required?: boolean;
    disabled?: boolean;
    "aria-invalid"?: AriaAttributes["aria-invalid"];
    "aria-describedby"?: string;
}
export interface FieldPresentation {
    label: ReactNode;
    helper?: ReactNode;
    error?: ReactNode;
    wrapperClassName?: string;
}
export interface FieldProps extends Omit<HTMLAttributes<HTMLDivElement>, "children">, Omit<FieldPresentation, "wrapperClassName"> {
    required?: boolean;
    disabled?: boolean;
    invalid?: AriaAttributes["aria-invalid"];
    describedBy?: string;
    children: (props: FieldControlProps) => ReactNode;
}

/** Render-prop association primitive for native or custom controls. */
export function Field({ id, label, helper, error, required, disabled, invalid, describedBy, className, children, ...props }: FieldProps) {
    const generated = useId();
    const controlId = id || `studio-field-${generated}`;
    const hasError = Boolean(error);
    const descriptions = [...new Set([
        ...(describedBy?.split(/\s+/).filter(Boolean) || []),
        ...(helper ? [`${controlId}-helper`] : []),
        ...(hasError ? [`${controlId}-error`] : []),
    ])].join(" ") || undefined;
    return (
        <div {...props} className={cn("studio-field", className)} data-disabled={disabled || undefined}>
            <label className="studio-field-label" id={`${controlId}-label`} htmlFor={controlId}>{label}{required && <span aria-hidden="true"> *</span>}</label>
            {children({ id: controlId, required, disabled, "aria-invalid": hasError ? true : invalid, "aria-describedby": descriptions })}
            {helper && <span className="studio-field-helper" id={`${controlId}-helper`}>{helper}</span>}
            <div className="studio-field-error-slot" data-visible={hasError || undefined} aria-hidden={!hasError}>
                <span className="studio-field-error" id={`${controlId}-error`} role={hasError ? "alert" : undefined}>{error}</span>
            </div>
        </div>
    );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldPresentation {}
export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ id, label, helper, error, required, disabled, wrapperClassName, className, type = "text", "aria-describedby": describedBy, "aria-invalid": invalid, ...props }, ref) => (
        <Field id={id} label={label} helper={helper} error={error} required={required} disabled={disabled} describedBy={describedBy} invalid={invalid} className={wrapperClassName}>
            {control => <input {...props} {...control} ref={ref} type={type} spellCheck={props.spellCheck ?? false} autoCorrect={props.autoCorrect ?? "off"} autoCapitalize={props.autoCapitalize ?? "off"} className={cn("studio-input", className)} />}
        </Field>
    )
);
Input.displayName = "Input";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldPresentation {}
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ id, label, helper, error, required, disabled, wrapperClassName, className, "aria-describedby": describedBy, "aria-invalid": invalid, ...props }, ref) => (
        <Field id={id} label={label} helper={helper} error={error} required={required} disabled={disabled} describedBy={describedBy} invalid={invalid} className={wrapperClassName}>
            {control => <textarea {...props} {...control} ref={ref} spellCheck={props.spellCheck ?? false} autoCorrect={props.autoCorrect ?? "off"} autoCapitalize={props.autoCapitalize ?? "off"} className={cn("studio-input", className)} />}
        </Field>
    )
);
Textarea.displayName = "Textarea";
