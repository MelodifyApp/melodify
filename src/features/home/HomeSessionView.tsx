import { Clock, Headphones } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/ui/components/studio";
import { timeAgoParts } from "./homeTime";
import type {
    HomeNowPlaying,
    HomeQueueEntry,
    HomeSessionSnapshot,
} from "./homeSessionTypes";
import type { HomeConnectionView } from "./homeConnections";

function timeAgoLabel(
    acceptedAt: number,
    now: number,
    t: (key: string, options?: Record<string, unknown>) => string
): string {
    const parts = timeAgoParts(new Date(acceptedAt), new Date(now));
    if (!parts) return "";
    if (parts.unit === "now") return t("home.timeNow");
    if (parts.unit === "minutes") {
        return t("home.timeMinutes", { count: parts.count });
    }
    if (parts.unit === "hours") {
        return t("home.timeHours", { count: parts.count });
    }
    return t("home.timeDays", { count: parts.count });
}

interface PlaybackPrompt {
    title: string;
    copy: string;
    actionLabel: string | null;
    onAction: (() => void) | null;
}

/**
 * When Spotify is not ready, the empty card must explain the real reason and
 * offer the matching action instead of claiming nothing is playing.
 */
function spotifyPlaybackPrompt(
    spotify: HomeConnectionView | undefined,
    t: (key: string) => string,
    onConnectSpotify?: () => void,
    onOpenSettings?: () => void
): PlaybackPrompt | null {
    if (!spotify) return null;
    switch (spotify.state) {
        case "setup":
            return {
                title: t("home.spotifyNotSetUp"),
                copy: t("home.spotifyNotSetUpCopy"),
                actionLabel: onOpenSettings
                    ? t("home.connections.actionSetUp")
                    : null,
                onAction: onOpenSettings ?? null,
            };
        case "connect":
            return {
                title: t("home.spotifyNotConnected"),
                copy: t("home.spotifyNotConnectedCopy"),
                actionLabel: onConnectSpotify
                    ? t("home.connections.actionConnect")
                    : null,
                onAction: onConnectSpotify ?? null,
            };
        case "auth-error":
            return {
                title: t("home.spotifyConnectFailed"),
                copy: t("home.spotifyConnectFailedCopy"),
                actionLabel: onConnectSpotify
                    ? t("home.connections.actionRetry")
                    : null,
                onAction: onConnectSpotify ?? null,
            };
        case "pending":
            return {
                title: t("home.spotifyConnecting"),
                copy: t("home.spotifyConnectingCopy"),
                actionLabel: null,
                onAction: null,
            };
        default:
            return null;
    }
}

function NowPlayingCard({
    current,
    loading,
    error,
    spotify,
    onConnectSpotify,
    onOpenSettings,
}: {
    current: HomeNowPlaying | null;
    loading: boolean;
    error: boolean;
    spotify?: HomeConnectionView;
    onConnectSpotify?: () => void;
    onOpenSettings?: () => void;
}) {
    const { t } = useTranslation();
    const isLoading = loading || current?.status === "loading";
    const playing =
        !isLoading &&
        !error &&
        current?.status === "playing" &&
        !!current.title &&
        !!current.artist;
    const failed = error || current?.status === "error";
    const isIdle = !isLoading && !failed && !playing;
    const prompt = spotifyPlaybackPrompt(
        spotify,
        t,
        onConnectSpotify,
        onOpenSettings
    );

    return (
        <section
            className="studio-home-now-playing"
            aria-labelledby="home-now-playing-title"
        >
            <div className="studio-home-art" aria-hidden="true">
                {playing && current?.artworkUrl ? (
                    <img
                        src={current.artworkUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                    />
                ) : (
                    <Headphones />
                )}
            </div>
            <div className="studio-home-now-playing-body">
                <h2
                    id="home-now-playing-title"
                    className="studio-home-label"
                >
                    {t("home.nowPlaying")}
                </h2>
                {playing ? (
                    <>
                        <p className="studio-home-request-title">
                            {current.title}
                        </p>
                        <p className="studio-home-request-artist">
                            {t("home.byArtist", { artist: current.artist })}
                        </p>
                    </>
                ) : isLoading ? (
                    <p className="studio-home-request-title">
                        {t("home.nowPlayingLoading")}
                    </p>
                ) : prompt ? (
                    <>
                        <p className="studio-home-request-title">
                            {prompt.title}
                        </p>
                        <p className="studio-home-empty-copy">{prompt.copy}</p>
                        {prompt.actionLabel && prompt.onAction && (
                            <Button
                                variant="secondary"
                                size="small"
                                className="studio-home-now-playing-action"
                                onClick={prompt.onAction}
                            >
                                {prompt.actionLabel}
                            </Button>
                        )}
                    </>
                ) : failed ? (
                    <>
                        <p className="studio-home-request-title">
                            {t("home.playbackUnavailable")}
                        </p>
                        <p className="studio-home-empty-copy">
                            {t("home.playbackUnavailableCopy")}
                        </p>
                    </>
                ) : isIdle ? (
                    <>
                        <p className="studio-home-request-title">
                            {t("home.nothingPlaying")}
                        </p>
                        <p className="studio-home-empty-copy">
                            {t("home.nothingPlayingCopy")}
                        </p>
                    </>
                ) : null}
            </div>
        </section>
    );
}

function QueueItem({
    entry,
    now,
}: {
    entry: HomeQueueEntry;
    now: number;
}) {
    const { t } = useTranslation();
    const requesterLabel = t("home.queueRequester", {
        requester: entry.requester,
        platform: entry.platform === "kick" ? "Kick" : "Twitch",
    });
    return (
        <li className="studio-home-queue-item">
            <span className="studio-home-queue-art" aria-hidden="true">
                {entry.artworkUrl ? (
                    <img
                        src={entry.artworkUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                    />
                ) : (
                    <Headphones />
                )}
            </span>
            <span className="studio-home-queue-copy">
                <strong title={entry.title}>{entry.title}</strong>
                <span title={entry.artist}>{entry.artist}</span>
            </span>
            <span className="studio-home-queue-meta">
                <span title={requesterLabel}>
                    {requesterLabel}
                </span>
                <time dateTime={new Date(entry.acceptedAt).toISOString()}>
                    <Clock aria-hidden="true" />
                    {timeAgoLabel(entry.acceptedAt, now, t)}
                </time>
            </span>
        </li>
    );
}

export default function HomeSessionView({
    session,
    loading,
    error,
    now,
    onOpenHistory,
    spotify,
    onConnectSpotify,
    onOpenSettings,
}: {
    session: HomeSessionSnapshot | null;
    loading: boolean;
    error: boolean;
    now: number;
    onOpenHistory?: () => void;
    spotify?: HomeConnectionView;
    onConnectSpotify?: () => void;
    onOpenSettings?: () => void;
}) {
    const { t } = useTranslation();
    const queue = session?.queue ?? [];
    const queueLoading = loading && !session;
    const queueError = error;
    return (
        <>
            <NowPlayingCard
                current={session?.current ?? null}
                loading={loading}
                error={error}
                spotify={spotify}
                onConnectSpotify={onConnectSpotify}
                onOpenSettings={onOpenSettings}
            />
            <section
                className="studio-home-queue"
                aria-labelledby="home-queue-title"
                aria-busy={queueLoading}
            >
                <div className="studio-home-queue-head">
                    <div className="studio-home-queue-title">
                        <h2 id="home-queue-title">{t("home.queueTitle")}</h2>
                        <span>{t("home.queueStreamScope")}</span>
                    </div>
                    {onOpenHistory && (
                        <Button
                            variant="ghost"
                            size="small"
                            onClick={onOpenHistory}
                        >
                            {t("history.open")}
                        </Button>
                    )}
                </div>
                {queueError ? (
                    <div className="studio-home-queue-state">
                        <p className="studio-home-queue-empty" role="alert">
                            {t("home.queueUnavailable")}
                        </p>
                        <p className="studio-home-queue-note">
                            {t("home.queueUnavailableCopy")}
                        </p>
                    </div>
                ) : queueLoading ? (
                    <div className="studio-home-queue-state">
                        <p className="studio-home-queue-empty" role="status">
                            {t("home.queueLoading")}
                        </p>
                    </div>
                ) : queue.length === 0 ? (
                    <div className="studio-home-queue-state">
                        <p className="studio-home-queue-empty">
                            {t("home.queueEmpty")}
                        </p>
                        <p className="studio-home-queue-note">
                            {t("home.queueEmptyCopy")}
                        </p>
                    </div>
                ) : (
                    <ol
                        className="studio-home-queue-list"
                        role="list"
                        tabIndex={0}
                        aria-labelledby="home-queue-title"
                    >
                        {queue.map((entry) => (
                            <QueueItem
                                key={entry.id}
                                entry={entry}
                                now={now}
                            />
                        ))}
                    </ol>
                )}
            </section>
        </>
    );
}
