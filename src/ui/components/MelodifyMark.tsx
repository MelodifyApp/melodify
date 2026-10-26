interface MelodifyMarkProps {
    className?: string;
}

/**
 * Approved Melodify brand mark. Decorative here because the titlebar already
 * exposes the app name as text.
 */
export default function MelodifyMark({ className }: MelodifyMarkProps) {
    return (
        <svg
            className={className}
            viewBox="0 0 64 64"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                <linearGradient
                    id="melodify-mark-gradient"
                    x1="0"
                    y1="0"
                    x2="1"
                    y2="1"
                >
                    <stop offset="0" stopColor="#34d399" />
                    <stop offset="1" stopColor="#c084fc" />
                </linearGradient>
            </defs>
            <rect
                width="64"
                height="64"
                rx="16"
                fill="url(#melodify-mark-gradient)"
            />
            <g
                transform="translate(14 14) scale(1.5)"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
            </g>
        </svg>
    );
}
