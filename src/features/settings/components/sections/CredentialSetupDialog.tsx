import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button, IconButton, Input } from "@/ui/components/studio";
import ExternalLink from "@/ui/components/ExternalLink";
import InlineError from "@/ui/components/InlineError";
import {
    credentialSaveFollowUp,
    getSecretService,
    saveServiceSecrets,
    type SecretServiceId,
} from "../../secretsSave";
import { connectErrorMessageKey } from "../../connectErrorMessage";
import { dialogExitDuration } from "./dialogMotion";

const SERVICE_NAMES: Record<SecretServiceId, string> = {
    spotify: "Spotify",
    kick: "Kick",
    twitch: "Twitch",
};

function prefersReducedMotion(): boolean {
    return (
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
}

const PLACEHOLDER_NAMES: Record<SecretServiceId, string> = {
    spotify: "Spotify",
    kick: "Kick",
    twitch: "Twitch",
};

export type CredentialSetupMode = "setup" | "replace";

interface CredentialSetupDialogProps {
    serviceId: SecretServiceId;
    mode: CredentialSetupMode;
    initialClientId: string;
    config: Record<string, unknown>;
    dashboardUrl: string;
    redirectUri: string;
    onClose: () => void;
    onConnected: (clientId: string) => void;
}

async function copyText(text: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(text);
        return;
    } catch {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
    }
}

export default function CredentialSetupDialog({
    serviceId,
    mode,
    initialClientId,
    config,
    dashboardUrl,
    redirectUri,
    onClose,
    onConnected,
}: CredentialSetupDialogProps) {
    const { t } = useTranslation();
    const service = getSecretService(serviceId);
    const followUp = credentialSaveFollowUp(serviceId);
    const serviceName = SERVICE_NAMES[serviceId];
    const placeholderName = PLACEHOLDER_NAMES[serviceId];
    const [step, setStep] = useState<1 | 2>(mode === "replace" ? 2 : 1);
    const [clientId, setClientId] = useState(
        mode === "replace" ? initialClientId : ""
    );
    const [clientSecret, setClientSecret] = useState("");
    const [busy, setBusy] = useState(false);
    const [closing, setClosing] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const dialogRef = useRef<HTMLElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const headingRef = useRef<HTMLHeadingElement>(null);
    const previousFocus = useRef<HTMLElement | null>(null);
    const closeAction = useRef<(() => void) | null>(null);
    const mounted = useRef(true);
    const previousStep = useRef(step);

    const canConnect =
        clientId.trim().length > 0 && clientSecret.trim().length > 0;

    const beginExit = (after: () => void) => {
        if (closing) return;
        closeAction.current = after;
        setClosing(true);
    };

    const closeDialog = () => {
        if (busy) return;
        beginExit(() => onClose());
    };

    useEffect(() => {
        if (!closing) return;
        const finish = closeAction.current;
        if (!finish) return;
        const duration = dialogExitDuration(prefersReducedMotion());
        if (duration === 0) {
            finish();
            return;
        }
        const timer = window.setTimeout(finish, duration);
        return () => window.clearTimeout(timer);
    }, [closing]);

    useEffect(() => {
        mounted.current = true;
        previousFocus.current =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
        closeRef.current?.focus();
        return () => {
            mounted.current = false;
            const previous = previousFocus.current;
            if (previous && previous.isConnected && previous.offsetParent !== null) {
                previous.focus();
            }
        };
    }, []);

    useEffect(() => {
        if (previousStep.current === step) return;
        previousStep.current = step;
        headingRef.current?.focus();
    }, [step]);

    useEffect(() => {
        if (!copied) return;
        const timer = window.setTimeout(() => setCopied(false), 1500);
        return () => window.clearTimeout(timer);
    }, [copied]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                closeDialog();
                return;
            }
            if (event.key !== "Tab") return;
            const dialog = dialogRef.current;
            if (!dialog) return;
            const focusable = [
                ...dialog.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                ),
            ].filter(
                (element) =>
                    element.offsetParent !== null ||
                    element === document.activeElement
            );
            if (focusable.length === 0) {
                event.preventDefault();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [busy, closing, onClose]);

    const handleConnect = async () => {
        if (!canConnect || busy) return;
        setBusy(true);
        setErrorKey(null);
        const result = await saveServiceSecrets(
            serviceId,
            {
                ...config,
                [service.clientIdKey]: clientId.trim(),
            },
            { [service.clientSecretKey]: clientSecret },
            window.electronAPI
        );
        if (!mounted.current) return;
        if (result.ok) {
            beginExit(() => onConnected(clientId.trim()));
            return;
        }
        setBusy(false);
        setErrorKey(connectErrorMessageKey(result.error));
    };

    const title =
        step === 1
            ? mode === "replace"
                ? t("common.replaceCredentialsTitle", { service: serviceName })
                : t("common.setUpServiceTitle", { service: serviceName })
            : mode === "replace"
              ? t("common.replaceCredentialsTitle", { service: serviceName })
              : t("common.pasteCredentialsTitle", { service: serviceName });

    return createPortal(
        <div
            className="studio-setup-overlay"
            role="presentation"
            data-closing={closing || undefined}
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeDialog();
            }}
        >
            <section
                ref={dialogRef}
                className="studio-setup-dialog studio-credential-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="studio-credential-dialog-title"
                data-closing={closing || undefined}
            >
                <div className="studio-setup-head">
                    <h2
                        ref={headingRef}
                        id="studio-credential-dialog-title"
                        tabIndex={-1}
                    >
                        {title}
                    </h2>
                    <IconButton
                        ref={closeRef}
                        variant="ghost"
                        label={t("common.close")}
                        onClick={closeDialog}
                        disabled={busy}
                    >
                        <X size={16} />
                    </IconButton>
                </div>

                <ol
                    className="studio-credential-stepper"
                    aria-label={t("common.setupSteps")}
                >
                    <li aria-current={step === 1 ? "step" : undefined}>
                        <span className="studio-credential-step-number" aria-hidden="true">1</span>
                        {t("common.createAppStep")}
                    </li>
                    <li aria-current={step === 2 ? "step" : undefined}>
                        <span className="studio-credential-step-number" aria-hidden="true">2</span>
                        {t("common.pasteCredentialsStep")}
                    </li>
                </ol>

                {step === 1 ? (
                    <>
                        <p className="studio-credential-lead">
                            {t("common.setupStepCreate")}
                        </p>
                        <ExternalLink
                            href={dashboardUrl}
                            className="studio-link studio-credential-dashboard"
                        >
                            {dashboardUrl}
                        </ExternalLink>
                        <div className="studio-credential-redirect">
                            <span>{t("common.setupStepRedirect")}</span>
                            <div className="studio-credential-redirect-row">
                                <code>{redirectUri}</code>
                                <Button
                                    variant="ghost"
                                    size="small"
                                    onClick={() => void copyText(redirectUri).then(() => setCopied(true))}
                                >
                                    {copied ? t("common.copied") : t("common.copy")}
                                </Button>
                            </div>
                        </div>
                        <div className="studio-credential-dialog-footer studio-credential-dialog-footer--end">
                            <Button
                                variant="primary"
                                onClick={() => {
                                    setErrorKey(null);
                                    setStep(2);
                                }}
                            >
                                {t("common.continue")}
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <p className="studio-credential-lead">
                            {t("common.credentialsVerifiedOnConnect")}
                        </p>
                        <div className="studio-credential-fields">
                            <Input
                                label={t("setup.clientId")}
                                type="text"
                                value={clientId}
                                onChange={(event) => {
                                    setClientId(event.target.value);
                                    setErrorKey(null);
                                }}
                                placeholder={t(
                                    `setup.enter${placeholderName}ClientId`
                                )}
                                maxLength={100}
                                autoComplete="off"
                                disabled={busy}
                                required
                            />
                            <Input
                                label={t("setup.clientSecret")}
                                type="password"
                                value={clientSecret}
                                onChange={(event) => {
                                    setClientSecret(event.target.value);
                                    setErrorKey(null);
                                }}
                                placeholder={t(
                                    `setup.enter${placeholderName}ClientSecret`
                                )}
                                maxLength={200}
                                autoComplete="off"
                                disabled={busy}
                                required
                            />
                        </div>
                        <InlineError
                            className="studio-credential-error"
                            message={errorKey ? t(errorKey) : null}
                        />
                        <div className="studio-credential-dialog-footer">
                            <Button
                                variant="ghost"
                                onClick={() => {
                                    setErrorKey(null);
                                    setStep(1);
                                }}
                                disabled={busy}
                            >
                                {t("common.back")}
                            </Button>
                            <Button
                                variant="primary"
                                onClick={() => void handleConnect()}
                                loading={busy}
                                disabled={!canConnect || busy}
                            >
                                {busy
                                    ? t("common.saving")
                                    : t(followUp.actionKey)}
                            </Button>
                        </div>
                    </>
                )}
            </section>
        </div>,
        document.querySelector(".studio") ?? document.body
    );
}
