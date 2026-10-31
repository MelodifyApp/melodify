interface InlineErrorProps {
    message?: string | null;
    className?: string;
    id?: string;
}

/**
 * Compact in-app error feedback.
 *
 * Red text on a restrained red tint, announced assertively, with a single short
 * fade/translate entrance (disabled by prefers-reduced-motion). Renders nothing
 * without a message so callers can mount it unconditionally.
 */
export default function InlineError({
    message,
    className,
    id,
}: InlineErrorProps) {
    const text = typeof message === "string" ? message.trim() : "";
    if (!text) return null;

    return (
        <p
            id={id}
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
            className={`inline-error studio-inline-error ${className ?? ""}`.trim()}
        >
            {message}
        </p>
    );
}
