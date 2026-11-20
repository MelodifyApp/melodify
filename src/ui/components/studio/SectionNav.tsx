import { forwardRef, useId } from "react";
import type { HTMLAttributes, MouseEventHandler, ReactNode } from "react";
import { cn } from "../../../shared/utils";
import { Button } from "./Button";
import { BackIcon } from "./icons";

export interface SectionNavItem { id: string; label: ReactNode; disabled?: boolean }
export interface SectionNavGroup { id: string; label: ReactNode; items: readonly SectionNavItem[] }
export interface SectionNavProps extends Omit<HTMLAttributes<HTMLElement>, "onSelect" | "children" | "title"> {
    groups: readonly SectionNavGroup[];
    activeId: string;
    onSelect: (id: string) => void;
    onHome: MouseEventHandler<HTMLButtonElement>;
    homeLabel?: string;
    homeAriaLabel?: string;
    navTitle?: ReactNode;
}
export const SectionNav = forwardRef<HTMLElement, SectionNavProps>(
    ({ groups, activeId, onSelect, onHome, homeLabel = "Home", homeAriaLabel = "Return Home", navTitle, className, ...props }, ref) => {
        const prefix = useId();
        return (
            <nav {...props} ref={ref} className={cn("studio-nav", className)} aria-label={props["aria-label"] || "Settings sections"}>
                {navTitle && <h2 className="studio-nav-title">{navTitle}</h2>}
                {groups.map(group => <div className="studio-nav-group" key={group.id} role="group" aria-labelledby={`${prefix}-${group.id}`}>
                    <h3 className="studio-nav-label" id={`${prefix}-${group.id}`}>{group.label}</h3>
                    <div className="studio-nav-items">{group.items.map(item => <button type="button" className="studio-nav-item" key={item.id} disabled={item.disabled} aria-current={activeId === item.id ? "page" : undefined} onClick={() => onSelect(item.id)}>{item.label}</button>)}</div>
                </div>)}
                <Button variant="ghost" className="studio-nav-home" onClick={onHome} aria-label={homeAriaLabel}><BackIcon />{homeLabel}</Button>
            </nav>
        );
    }
);
SectionNav.displayName = "SectionNav";
