import { forwardRef, useId } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../../shared/utils";

export interface SettingSurfaceProps extends HTMLAttributes<HTMLElement> {
    heading: ReactNode;
    headingLevel?: 2 | 3 | 4;
}
export const SettingCard = forwardRef<HTMLElement, SettingSurfaceProps>(
    ({ heading, headingLevel = 2, className, children, ...props }, ref) => {
        const titleId = useId();
        const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
        return <section {...props} ref={ref} className={cn("studio-card", className)} aria-labelledby={titleId}><Heading className="studio-group-heading" id={titleId}>{heading}</Heading><div className="studio-group-content">{children}</div></section>;
    }
);
SettingCard.displayName = "SettingCard";

export const SettingGroup = forwardRef<HTMLElement, SettingSurfaceProps>(
    ({ heading, headingLevel = 2, className, children, ...props }, ref) => {
        const titleId = useId();
        const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
        return <section {...props} ref={ref} className={cn("studio-group", className)} aria-labelledby={titleId}><Heading className="studio-group-heading" id={titleId}>{heading}</Heading><div className="studio-group-content">{children}</div></section>;
    }
);
SettingGroup.displayName = "SettingGroup";
