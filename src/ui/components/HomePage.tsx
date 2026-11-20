// Home is the quiet session overview: main-owned now playing, the local
// session queue and the real connection actions behind one modal.

import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
    AlertTriangle,
    LoaderCircleIcon,
    RotateCcwIcon,
} from "lucide-react";
import { Button, StudioTheme } from "@/ui/components/studio";
import type { StudioThemeName } from "@/ui/components/studio";
import { SettingsIcon } from "@/ui/components/studio/icons";
import { useUpdateStatus } from "@/ui/hooks/useUpdateStatus";
import { homeUpdatePresentation } from "@/ui/homeUpdateStatus";
import SpotifyIcon from "@/features/spotify/components/SpotifyIcon";
import KickIcon from "@/features/kick/components/KickIcon";
import TwitchIcon from "@/features/twitch/components/TwitchIcon";
import HomeConnectionsDialog from "@/features/home/HomeConnectionsDialog";
import HomeSessionView from "@/features/home/HomeSessionView";
import { useHomeConnections } from "@/features/home/useHomeConnections";
import { useHomeSession } from "@/features/home/useHomeSession";
import {
    buildHomeConnectionAnnouncement,
    changedHomeConnectionIds,
    homeConnectionMessageKey,
    homeConnectionStateMap,
    type HomeConnectionStateMap,
    type HomeConnectionView,
} from "@/features/home/homeConnections";
import "./homeStudio.css";

function ConnectionRow({
    connection,
    name,
    role,
    icon,
}: {
    connection: HomeConnectionView;
    name: string;
    role: string;
    icon: ReactNode;
}) {
    const { t } = useTranslation();
    return (
        <li className="studio-home-connection">
            <span
                className="studio-service-tile"
                data-service={connection.id}
                aria-hidden="true"
            >
                {icon}
            </span>
            <span className="studio-home-connection-name">
                <strong>{name}</strong>
                <span>{role}</span>
            </span>
            <span className="studio-home-chip" data-tone={connection.tone}>
                {t(homeConnectionMessageKey(connection))}
            </span>
        </li>
    );
}

export default function HomePage({
    theme = "graphite",
    onOpenSettings,
    onOpenHistory,
    hidden = false,
}: {
    theme?: StudioThemeName;
    onOpenSettings?: () => void;
    onOpenHistory?: () => void;
    hidden?: boolean;
}) {
    const { t } = useTranslation();
    const [now, setNow] = useState(() => Date.now());
    const { status, progress, manifest } = useUpdateStatus();
    const [version, setVersion] = useState("");
    const [connectionsOpen, setConnectionsOpen] = useState(false);

    const bridge =
        typeof window !== "undefined" ? window.electronAPI : undefined;
    const { views, refreshAll, beginSpotifyAuth } =
        useHomeConnections(bridge);
    const {
        session,
        loading: sessionLoading,
        error: sessionError,
    } = useHomeSession(bridge);
    const [connectionAnnouncement, setConnectionAnnouncement] = useState("");
    const previousConnectionStates =
        useRef<HomeConnectionStateMap | null>(null);
    const connectionSignature = `${views.spotify.state}:${views.kick.state}:${views.twitch.state}`;

    useEffect(() => {
        const current = homeConnectionStateMap(views);
        const previous = previousConnectionStates.current;
        previousConnectionStates.current = current;
        if (!previous) return;
        const changed = changedHomeConnectionIds(previous, views);
        if (changed.length === 0) return;
        setConnectionAnnouncement(
            buildHomeConnectionAnnouncement(changed, views, t)
        );
    }, [connectionSignature, t, views]);

    const closeConnections = useCallback(() => {
        setConnectionsOpen(false);
        void refreshAll();
    }, [refreshAll]);

    const openSettingsFromConnections = useCallback(() => {
        setConnectionsOpen(false);
        onOpenSettings?.();
    }, [onOpenSettings]);

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 60000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!bridge) return;
        bridge
            .getAppVersion?.()
            .then(setVersion)
            .catch(() => setVersion(""));
    }, [bridge]);

    const needsSetup = Object.values(views).some(
        (view) => view.state === "setup"
    );

    const presentation = homeUpdatePresentation(status, progress, manifest);
    const updateStatus = presentation.version
        ? `${t(presentation.key)} · v${presentation.version}`
        : t(presentation.key, {
              percent: presentation.percent,
          });
    let updateIcon = null;
    if (presentation.icon === "spin") {
        updateIcon = (
            <LoaderCircleIcon
                className="studio-home-spin"
                aria-hidden="true"
            />
        );
    } else if (presentation.icon === "available") {
        updateIcon = <RotateCcwIcon aria-hidden="true" />;
    } else if (presentation.icon === "error") {
        updateIcon = <AlertTriangle aria-hidden="true" />;
    }
    const updateTone = presentation.tone;

    return (
        <StudioTheme className="studio-home" theme={theme} hidden={hidden}>
            <div className="studio-home-body">
                <main
                    className="studio-home-main"
                    aria-labelledby="home-title"
                >
                    <h1 id="home-title" className="studio-home-visually-hidden">
                        {t("navigation.homePage")}
                    </h1>
                    <p
                        className="studio-home-visually-hidden"
                        role="status"
                        aria-live="polite"
                        aria-atomic="true"
                        data-home-connection-announcement
                    >
                        {connectionAnnouncement}
                    </p>

                    <HomeSessionView
                        session={session}
                        loading={sessionLoading}
                        error={sessionError}
                        now={now}
                        onOpenHistory={onOpenHistory}
                    />
                </main>

                <aside
                    className="studio-home-rail"
                    aria-labelledby="home-connections-title"
                >
                    <div className="studio-home-rail-head">
                        <h2 id="home-connections-title">
                            {t("home.connections.title")}
                        </h2>
                        {onOpenSettings && (
                            <button
                                type="button"
                                className="studio-home-rail-settings"
                                onClick={onOpenSettings}
                                aria-label={t("home.connections.settings")}
                                title={t("home.connections.settings")}
                            >
                                <SettingsIcon width={15} height={15} />
                            </button>
                        )}
                    </div>

                    <div
                        className="studio-home-rail-group"
                        role="group"
                        aria-labelledby="home-connections-music"
                    >
                        <h3
                            className="studio-home-rail-label"
                            id="home-connections-music"
                        >
                            {t("home.connections.music")}
                        </h3>
                        <ul
                            className="studio-home-conn-list"
                            aria-labelledby="home-connections-music"
                        >
                            <ConnectionRow
                                connection={views.spotify}
                                name="Spotify"
                                role={t("home.connections.spotifyRole")}
                                icon={<SpotifyIcon />}
                            />
                        </ul>
                    </div>

                    <div
                        className="studio-home-rail-group"
                        role="group"
                        aria-labelledby="home-connections-streaming"
                    >
                        <h3
                            className="studio-home-rail-label"
                            id="home-connections-streaming"
                        >
                            {t("home.connections.streaming")}
                        </h3>
                        <ul
                            className="studio-home-conn-list"
                            aria-labelledby="home-connections-streaming"
                        >
                            <ConnectionRow
                                connection={views.kick}
                                name="Kick"
                                role={t("home.connections.kickRole")}
                                icon={<KickIcon />}
                            />
                            <ConnectionRow
                                connection={views.twitch}
                                name="Twitch"
                                role={t("home.connections.twitchRole")}
                                icon={<TwitchIcon />}
                            />
                        </ul>
                    </div>

                    <div className="studio-home-rail-foot">
                        <Button
                            variant={needsSetup ? "primary" : "ghost"}
                            onClick={() => setConnectionsOpen(true)}
                        >
                            {needsSetup
                                ? t("home.connections.setUp")
                                : t("home.connections.manage")}
                        </Button>
                    </div>
                </aside>
            </div>

            <footer className="studio-home-footer">
                <span>v{version || "—"}</span>
                <span
                    className="studio-home-footer-status"
                    data-tone={updateTone}
                    role="status"
                    aria-live="polite"
                >
                    {updateIcon}
                    {updateStatus}
                </span>
            </footer>

            {connectionsOpen && (
                <HomeConnectionsDialog
                    views={views}
                    onClose={closeConnections}
                    onRefresh={refreshAll}
                    onOpenSettings={openSettingsFromConnections}
                    onSpotifyAuth={beginSpotifyAuth}
                />
            )}
        </StudioTheme>
    );
}
