import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "../../../shared/utils";

export type StudioThemeName =
    | "graphite"
    | "midnight"
    | "plum"
    | "forest"
    | "deepsea"
    | "ember"
    | "light"
    | "dark";
export type StudioLookName = "studio" | "aurora" | "dusk" | "bloom";
export interface StudioThemeProps extends HTMLAttributes<HTMLDivElement> {
    theme?: StudioThemeName;
    look?: StudioLookName;
}

/** Token boundary only; does not read or write app preferences. */
export const StudioTheme = forwardRef<HTMLDivElement, StudioThemeProps>(
    ({ theme = "graphite", look = "dusk", className, ...props }, ref) => (
        <div
            {...props}
            ref={ref}
            className={cn("studio", className)}
            data-studio-theme={theme}
            data-studio-look={look}
        />
    )
);
StudioTheme.displayName = "StudioTheme";
