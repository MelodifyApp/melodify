import { useEffect, useRef, useState } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "../../../shared/utils";
import { CheckIcon } from "./icons";

export const CREDENTIAL_STATUS_LABELS = {
    verified: "Verified", unverified: "Unverified", verifying: "Verifying",
    failed: "Verification failed", needed: "Needs credentials", "api-draft": "API draft pending",
    unavailable: "Verification unavailable",
} as const;
export type CredentialStatus = keyof typeof CREDENTIAL_STATUS_LABELS;
export interface StatusChipProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children" | "role" | "aria-live"> {
    status: CredentialStatus;
    /** Localized copy, if needed; does not determine verification state. */
    label?: string;
    /** Disable when a containing live region already announces this status. */
    announce?: boolean;
}

/** Presentation only. Callers must supply verified only after their own successful check. */
export function StatusChip({ status, label, announce = true, className, ...props }: StatusChipProps) {
    const previous = useRef(status);
    const [verifiedEntered, setVerifiedEntered] = useState(false);
    useEffect(() => {
        if (previous.current === status) return;
        previous.current = status;
        setVerifiedEntered(status === "verified");
    }, [status]);
    return (
        <span {...props} className={cn("studio-status", className)} data-status={status} data-verified-entered={verifiedEntered || undefined}
            role={announce ? "status" : undefined} aria-live={announce ? "polite" : undefined} aria-atomic={announce || undefined}>
            <span className="studio-status-icon" aria-hidden="true">
                {status === "verified" ? <CheckIcon /> : <span className={status === "verifying" ? "studio-spinner" : "studio-status-dot"} />}
            </span>
            <span>{label || CREDENTIAL_STATUS_LABELS[status]}</span>
        </span>
    );
}
