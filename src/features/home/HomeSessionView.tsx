import { Clock, Headphones } from "lucide-react";
import { useTranslation } from "react-i18next";
import { timeAgoParts } from "./homeTime";
import type {
    HomeNowPlaying,
    HomeQueueEntry,
    HomeSessionSnapshot,
} from "./homeSessionTypes";

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

function NowPlayingCard({
    current,
    loading,
    error,
}: {
    current: HomeNowPlaying | null;
    loading: boolean;
    error: boolean;
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
                ) : failed ? (
                    <>
                        <p className="studio-home-request-title">
                            {t("home.playbackUnavailable")}
                        </p>
                        <p className="studio-home-empty-copy">
                            {t("home.playbackUnavailableCopy")}
                        </p>
                    </>
                ) : isLoading ? (
                    <p className="studio-home-request-title">
                        {t("home.nowPlayingLoading")}
                    </p>
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
    return (
        <li className="studio-home-queue-item">
            <span className="studio-home-queue-position">
                #{entry.position}
            </span>
            <span className="studio-home-queue-copy">
                <strong>{entry.title}</strong>
                <span>{entry.artist}</span>
            </span>
            <span className="studio-home-queue-meta">
                <span>
                    {t("home.queueRequester", {
                        requester: entry.requester,
                        platform:
                            entry.platform === "kick" ? "Kick" : "Twitch",
                    })}
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
}: {
    session: HomeSessionSnapshot | null;
    loading: boolean;
    error: boolean;
    now: number;
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
            />
            <section
                className="studio-home-queue"
                aria-labelledby="home-queue-title"
            >
                <div className="studio-home-queue-head">
                    <h2 id="home-queue-title">{t("home.queueTitle")}</h2>
                </div>
                {queueError ? (
                    <>
                        <p className="studio-home-queue-empty" role="alert">
                            {t("home.queueUnavailable")}
                        </p>
                        <p className="studio-home-queue-note">
                            {t("home.queueUnavailableCopy")}
                        </p>
                    </>
                ) : queueLoading ? (
                    <p className="studio-home-queue-empty">
                        {t("home.queueLoading")}
                    </p>
                ) : queue.length === 0 ? (
                    <>
                        <p className="studio-home-queue-empty">
                            {t("home.queueEmpty")}
                        </p>
                        <p className="studio-home-queue-note">
                            {t("home.queueEmptyCopy")}
                        </p>
                    </>
                ) : (
                    <ol className="studio-home-queue-list">
                        {queue.map((entry) => (
                            <QueueItem
                                key={entry.id}
                                entry={entry}
                                now={now}
                            />
                        ))}
                    </ol>
                )}
                <p className="studio-home-queue-note studio-home-queue-scope">
                    {t("home.queueSessionNote")}
                </p>
            </section>
        </>
    );
}
