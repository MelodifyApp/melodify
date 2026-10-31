// Home is the quiet session overview: latest request, accepted empty queue and
// the real connection actions behind one modal.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
    AlertTriangle,
    Clock,
    Headphones,
    LoaderCircleIcon,
    RotateCcwIcon,
} from "lucide-react";
import { Button, StudioTheme } from "@/ui/components/studio";
import type { StudioThemeName } from "@/ui/components/studio";
import { useUpdateStatus } from "@/ui/hooks/useUpdateStatus";
import { homeUpdatePresentation } from "@/ui/homeUpdateStatus";
import SpotifyIcon from "@/features/spotify/components/SpotifyIcon";
import KickIcon from "@/features/kick/components/KickIcon";
import TwitchIcon from "@/features/twitch/components/TwitchIcon";
import HomeConnectionsDialog from "@/features/home/HomeConnectionsDialog";
import { useHomeConnections } from "@/features/home/useHomeConnections";
import {
    homeConnectionMessageKey,
    type HomeConnectionView,
} from "@/features/home/homeConnections";
import { timeAgoParts } from "@/features/home/homeTime";
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
}: {
    theme?: StudioThemeName;
    onOpenSettings?: () => void;
}) {
    const { t } = useTranslation();
    const [songRequestCount, setSongRequestCount] = useState(0);
    const [lastRequestTime, setLastRequestTime] = useState<Date | null>(null);
    const [lastRequestedSong, setLastRequestedSong] = useState<{
        title: string;
        artist: string;
    } | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const { status, progress, manifest } = useUpdateStatus();
    const [version, setVersion] = useState("");
    const [connectionsOpen, setConnectionsOpen] = useState(false);

    const bridge =
        typeof window !== "undefined" ? window.electronAPI : undefined;
    const { views, refreshAll } = useHomeConnections(bridge);

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

        const onSongRequestCompleted = (
            data: { title?: string; artist?: string } = {}
        ) => {
            setSongRequestCount((previous) => previous + 1);
            setNow(Date.now());
            setLastRequestTime(new Date());
            if (data?.title && data?.artist) {
                setLastRequestedSong({
                    title: data.title,
                    artist: data.artist,
                });
            }
        };
        bridge.on("songRequest:completed", onSongRequestCompleted);

        bridge
            .invoke("songRequest:getCount")
            .then(
                (data: {
                    count: number;
                    lastRequestTime: string | null;
                    lastSong?: { title: string; artist: string };
                }) => {
                    setSongRequestCount(data?.count || 0);
                    if (data?.lastRequestTime) {
                        const parsed = new Date(data.lastRequestTime);
                        if (!Number.isNaN(parsed.getTime())) {
                            setLastRequestTime(parsed);
                        }
                    }
                    if (
                        data?.lastSong &&
                        typeof data.lastSong.title === "string" &&
                        typeof data.lastSong.artist === "string"
                    ) {
                        setLastRequestedSong(data.lastSong);
                    }
                }
            )
            .catch(() => {
                setSongRequestCount(0);
                setLastRequestTime(null);
                setLastRequestedSong(null);
            });

        return () => {
            bridge.removeListener(
                "songRequest:completed",
                onSongRequestCompleted
            );
        };
    }, [bridge]);

    const timeParts = lastRequestTime
        ? timeAgoParts(lastRequestTime, new Date(now))
        : null;
    let timeAgoLabel = "";
    if (timeParts?.unit === "now") {
        timeAgoLabel = t("home.timeNow");
    } else if (timeParts?.unit === "minutes") {
        timeAgoLabel = t("home.timeMinutes", { count: timeParts.count });
    } else if (timeParts?.unit === "hours") {
        timeAgoLabel = t("home.timeHours", { count: timeParts.count });
    } else if (timeParts?.unit === "days") {
        timeAgoLabel = t("home.timeDays", { count: timeParts.count });
    }

    const requestCountLabel =
        songRequestCount === 1
            ? t("home.acceptedRequest")
            : t("home.acceptedRequests", { count: songRequestCount });

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
        <StudioTheme className="studio-home" theme={theme}>
            <div className="studio-home-body">
                <main
                    className="studio-home-main"
                    aria-labelledby="home-title"
                >
                    <h1 id="home-title" className="studio-home-visually-hidden">
                        {t("navigation.homePage")}
                    </h1>

                    <section
                        className="studio-home-latest"
                        aria-labelledby="home-latest-title"
                    >
                        <div
                            className="studio-home-art"
                            aria-hidden="true"
                        >
                            <Headphones />
                        </div>
                        <div className="studio-home-latest-body">
                            <h2
                                id="home-latest-title"
                                className="studio-home-label"
                            >
                                {t("home.latestRequest")}
                            </h2>
                            {lastRequestedSong ? (
                                <>
                                    <p className="studio-home-request-title">
                                        {lastRequestedSong.title}
                                    </p>
                                    <p className="studio-home-request-artist">
                                        {t("home.byArtist", {
                                            artist: lastRequestedSong.artist,
                                        })}
                                    </p>
                                    {timeAgoLabel && (
                                        <p className="studio-home-request-time">
                                            <Clock aria-hidden="true" />
                                            {timeAgoLabel}
                                        </p>
                                    )}
                                </>
                            ) : (
                                <>
                                    <p className="studio-home-request-title">
                                        {t("home.noRequestsYet")}
                                    </p>
                                    <p className="studio-home-empty-copy">
                                        {t("home.noRequestsCopy")}
                                    </p>
                                </>
                            )}
                            <p className="studio-home-count">
                                {requestCountLabel}
                            </p>
                        </div>
                    </section>

                    <section
                        className="studio-home-queue"
                        aria-labelledby="home-queue-title"
                    >
                        <div className="studio-home-queue-head">
                            <h2 id="home-queue-title">
                                {t("home.queueTitle")}
                            </h2>
                            <span className="studio-home-queue-count">
                                {t("home.queueCount", { count: 0 })}
                            </span>
                        </div>
                        <p className="studio-home-queue-empty">
                            {t("home.queueEmpty")}
                        </p>
                    </section>
                </main>

                <aside
                    className="studio-home-rail"
                    aria-labelledby="home-connections-title"
                >
                    <div className="studio-home-rail-head">
                        <h2 id="home-connections-title">
                            {t("home.connections.title")}
                        </h2>
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
                />
            )}
        </StudioTheme>
    );
}
