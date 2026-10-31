import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../../shared/utils";

export interface ButtonBaseProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "secondary" | "default" | "ghost";
    size?: "default" | "small";
    loading?: boolean;
}
export type ButtonProps = ButtonBaseProps & (
    | { iconOnly: true; "aria-label": string }
    | { iconOnly?: false }
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ variant = "secondary", size = "default", iconOnly = false, loading, disabled, type = "button", className, children, ...props }, ref) => {
        if (iconOnly && !props["aria-label"]?.trim()) {
            throw new Error("An icon-only Button requires a non-empty accessible label.");
        }
        return (
            <button
                {...props}
                ref={ref}
                type={type}
                className={cn("studio-button", className)}
                data-variant={variant}
                data-size={size}
                data-icon-only={iconOnly || undefined}
                data-loading={loading || undefined}
                aria-busy={loading || props["aria-busy"]}
                disabled={disabled || loading}
            >
                {loading && <span className="studio-button-spinner" data-active="true" aria-hidden="true" />}
                <span className="studio-button-content" aria-hidden={iconOnly || undefined}>{children}</span>
            </button>
        );
    }
);
Button.displayName = "Button";

export interface IconButtonProps extends Omit<ButtonBaseProps, "children" | "aria-label"> {
    label: string;
    children: ReactNode;
}
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
    ({ label, title = label, ...props }, ref) => {
        if (!label.trim()) throw new Error("IconButton requires a non-empty label.");
        return <Button {...props} ref={ref} iconOnly aria-label={label} title={title} />;
    }
);
IconButton.displayName = "IconButton";
