import { useEffect, useRef, type ReactNode } from "react";
import { RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, IconButton } from "@/ui/components/studio";
import SpotifyIcon from "@/features/spotify/components/SpotifyIcon";
import KickIcon from "@/features/kick/components/KickIcon";
import TwitchIcon from "@/features/twitch/components/TwitchIcon";
import {
    homeConnectionMessageKey,
    type HomeConnectionId,
    type HomeConnectionView,
} from "./homeConnections";

const icons: Record<HomeConnectionId, ReactNode> = {
    spotify: <SpotifyIcon />,
    kick: <KickIcon />,
    twitch: <TwitchIcon />,
};

const names: Record<HomeConnectionId, string> = {
    spotify: "Spotify",
    kick: "Kick",
    twitch: "Twitch",
};

const roles: Record<HomeConnectionId, string> = {
    spotify: "home.connections.spotifyRole",
    kick: "home.connections.kickRole",
    twitch: "home.connections.twitchRole",
};

function actionFor(
    view: HomeConnectionView
): { key: string; disabled?: boolean } {
    switch (view.state) {
        case "loading":
            return { key: "home.connections.checking", disabled: true };
        case "setup":
            return { key: "home.connections.actionSetUp" };
        case "connect":
            return { key: "home.connections.actionConnect" };
        case "pending":
            return {
                key: "home.connections.connecting",
                disabled: true,
            };
        case "connected":
            return { key: "home.connections.actionDisconnect" };
        case "attention":
            return {
                key:
                    view.id === "spotify"
                        ? "home.connections.actionRefresh"
                        : "home.connections.actionReconnect",
            };
        case "auth-error":
            return { key: "home.connections.actionRetry" };
        case "unavailable":
            return { key: "home.connections.actionRefresh" };
    }
}

export default function HomeConnectionsDialog({
    views,
    onClose,
    onRefresh,
    onOpenSettings,
    onSpotifyAuth,
}: {
    views: Record<HomeConnectionId, HomeConnectionView>;
    onClose: () => void;
    onRefresh: () => void | Promise<void>;
    onOpenSettings: () => void;
    onSpotifyAuth?: () => void;
}) {
    const { t } = useTranslation();
    const dialogRef = useRef<HTMLElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const previousFocus = useRef<HTMLElement | null>(null);

    useEffect(() => {
        previousFocus.current =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
        closeRef.current?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
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
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            const previous = previousFocus.current;
            if (
                previous &&
                previous.isConnected &&
                previous.offsetParent !== null
            ) {
                previous.focus();
            }
        };
    }, [onClose]);

    const runAction = (view: HomeConnectionView) => {
        if (view.state === "setup") {
            onOpenSettings();
            return;
        }
        if (view.state === "pending") {
            return;
        }
        if (view.state === "unavailable" || view.state === "loading") {
            void onRefresh();
            return;
        }
        if (view.state === "auth-error") {
            onSpotifyAuth?.();
            return;
        }
        if (view.state === "connect") {
            if (view.id === "spotify") {
                onSpotifyAuth?.();
                return;
            }
            window.electronAPI.send(`${view.id}:auth`);
        } else if (view.state === "connected") {
            window.electronAPI.send(`${view.id}:logout`);
        } else if (view.id === "kick") {
            void window.electronAPI.invoke("kick:retryChat");
        } else if (view.id === "twitch") {
            window.electronAPI.send("twitch:stopListening");
            void window.electronAPI.invoke("twitch:checkAuth");
        } else {
            void window.electronAPI.invoke("spotify:checkAuth");
        }
        void onRefresh();
        window.setTimeout((): void => {
            void onRefresh();
        }, 1200);
    };

    return (
        <div
            className="studio-home-dialog-overlay"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <section
                ref={dialogRef}
                className="studio-home-dialog studio-home-dialog-connections"
                role="dialog"
                aria-modal="true"
                aria-labelledby="home-connections-dialog-title"
            >
                <header className="studio-home-dialog-head">
                    <div>
                        <h2 id="home-connections-dialog-title">
                            {t("home.connections.title")}
                        </h2>
                    </div>
                    <IconButton
                        ref={closeRef}
                        variant="ghost"
                        label={t("common.close")}
                        onClick={onClose}
                    >
                        <X size={16} />
                    </IconButton>
                </header>
                <div className="studio-home-dialog-body">
                    <ul className="studio-home-dialog-services">
                        {(Object.keys(views) as HomeConnectionId[]).map(
                            (serviceId) => {
                                const view = views[serviceId];
                                const action = actionFor(view);
                                return (
                                    <li
                                        className="studio-home-dialog-service"
                                        key={serviceId}
                                    >
                                        <span
                                            className="studio-service-tile"
                                            data-service={serviceId}
                                            aria-hidden="true"
                                        >
                                            {icons[serviceId]}
                                        </span>
                                        <span className="studio-home-dialog-service-name">
                                            <strong>
                                                {names[serviceId]}
                                            </strong>
                                            <span>{t(roles[serviceId])}</span>
                                        </span>
                                        <span
                                            className="studio-home-chip"
                                            data-tone={view.tone}
                                        >
                                            {t(
                                                homeConnectionMessageKey(view)
                                            )}
                                        </span>
                                        <Button
                                            size="small"
                                            variant={
                                                view.state === "setup"
                                                    ? "primary"
                                                    : "secondary"
                                            }
                                            disabled={action.disabled}
                                            onClick={() => runAction(view)}
                                        >
                                            {t(action.key)}
                                        </Button>
                                    </li>
                                );
                            }
                        )}
                    </ul>
                </div>
                <footer className="studio-home-dialog-foot">
                    <Button
                        variant="ghost"
                        size="small"
                        onClick={() => void onRefresh()}
                    >
                        <RefreshCw aria-hidden="true" />
                        {t("home.connections.refreshStatus")}
                    </Button>
                </footer>
            </section>
        </div>
    );
}
