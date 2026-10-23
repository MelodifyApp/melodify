import InlineError from "./InlineError";

interface CredentialSetupFeedbackProps {
    message: string | null;
    /** True only in the slot that is currently on screen. */
    visible: boolean;
    className?: string;
}

/**
 * Renders the credential-setup error only in the visible slot, so an open
 * setup overlay never hides the message underneath it and the same error is
 * never announced twice.
 */
export default function CredentialSetupFeedback({
    message,
    visible,
    className,
}: CredentialSetupFeedbackProps) {
    if (!visible) return null;
    return <InlineError message={message} className={className} />;
}
