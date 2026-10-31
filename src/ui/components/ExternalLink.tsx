import type {
    AnchorHTMLAttributes,
    MouseEvent,
    ReactNode,
} from "react";

interface ExternalLinkProps
    extends AnchorHTMLAttributes<HTMLAnchorElement> {
    children?: ReactNode;
}

export default function ExternalLink({
    className,
    href,
    children,
    onClick,
    ...props
}: ExternalLinkProps) {
    const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        event.stopPropagation();
        onClick?.(event);
        if (href) {
            window.electronAPI.openExternal(href);
        }
    };

    return (
        <a
            {...props}
            href={href}
            onClick={handleClick}
            className={`cursor-pointer ${className || ""}`.trim()}
        >
            {children}
        </a>
    );
}
