import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/ui/components/studio";
import type {
    QueueSessionEntry,
    QueueStreamSession,
} from "@/features/home/streamSession";
import "./queueHistory.css";

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeEntry(value: unknown): QueueSessionEntry | null {
    if (!isRecord(value)) return null;
    if (
        typeof value.id !== "string" ||
        typeof value.title !== "string" ||
        typeof value.artist !== "string" ||
        typeof value.requester !== "string" ||
        (value.platform !== "kick" && value.platform !== "twitch") ||
        typeof value.acceptedAt !== "number" ||
        (value.outcome !== "played" && value.outcome !== "unplayed")
    ) {
        return null;
    }
    return {
        id: value.id,
        title: value.title,
        artist: value.artist,
        requester: value.requester,
        platform: value.platform,
        acceptedAt: value.acceptedAt,
        position: typeof value.position === "number" ? value.position : 1,
        outcome: value.outcome,
        playedAt:
            typeof value.playedAt === "number" ? value.playedAt : null,
    };
}

function normalizeSessions(value: unknown): QueueStreamSession[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter(isRecord)
        .map((raw): QueueStreamSession | null => {
            if (
                typeof raw.id !== "string" ||
                typeof raw.startedAt !== "number" ||
                (raw.endedAt !== null && typeof raw.endedAt !== "number") ||
                !isRecord(raw.providers)
            ) {
                return null;
            }
            const providers = raw.providers;
            const entries = Array.isArray(raw.entries)
                ? raw.entries
                      .map(normalizeEntry)
                      .filter(
                          (entry): entry is QueueSessionEntry => !!entry
                      )
                : [];
            return {
                id: raw.id,
                startedAt: raw.startedAt,
                endedAt: raw.endedAt as number | null,
                endReason:
                    raw.endReason === "offline" ||
                    raw.endReason === "interrupted" ||
                    raw.endReason === "app-quit"
                        ? raw.endReason
                        : null,
                providers: {
                    kick: providers.kick === true,
                    twitch: providers.twitch === true,
                },
                entries,
            };
        })
        .filter((session): session is QueueStreamSession => !!session)
        .sort((a, b) => b.startedAt - a.startedAt);
}

function durationParts(
    session: QueueStreamSession,
    now: number
): { minutes: number; hours: number; remainder: number } {
    const end = session.endedAt ?? now;
    const minutes = Math.max(
        1,
        Math.round(Math.max(0, end - session.startedAt) / 60000)
    );
    return {
        minutes,
        hours: Math.floor(minutes / 60),
        remainder: minutes % 60,
    };
}

function SessionCard({
    session,
    locale,
}: {
    session: QueueStreamSession;
    locale: string;
}) {
    const { t } = useTranslation();
    const now = Date.now();
    const duration = durationParts(session, now);
    const played = session.entries.filter(
        (entry) => entry.outcome === "played"
    ).length;
    const unplayed = session.entries.length - played;
    const status = session.endedAt === null ? "active" : session.endReason ?? "offline";
    const statusKey =
        status === "active"
            ? "history.active"
            : status === "interrupted"
              ? "history.interrupted"
              : status === "app-quit"
                ? "history.appQuit"
                : "history.offline";
    const formatter = new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
    });
    const started = formatter.format(new Date(session.startedAt));
    const providers = [
        session.providers.kick ? "Kick" : null,
        session.providers.twitch ? "Twitch" : null,
    ]
        .filter(Boolean)
        .join(" · ");

    return (
        <article className="studio-card studio-history-session">
            <header className="studio-history-head">
                <div>
                    <h3>{started}</h3>
                    <p>
                        {providers || t("history.noProviders")}
                        {" · "}
                        {duration.hours > 0
                            ? t("history.durationHours", {
                                  hours: duration.hours,
                                  minutes: duration.remainder,
                              })
                            : t("history.durationMinutes", {
                                  count: duration.minutes,
                              })}
                    </p>
                </div>
                <span
                    className="studio-history-status"
                    data-status={status}
                >
                    {t(statusKey)}
                </span>
            </header>

            <div className="studio-history-stats">
                <span>{t("history.requests", { count: session.entries.length })}</span>
                <span data-tone="played">
                    {t("history.played", { count: played })}
                </span>
                <span>{t("history.unplayed", { count: unplayed })}</span>
            </div>

            {session.entries.length > 0 && (
                <details className="studio-history-details">
                    <summary>
                        {t("history.showRequests", {
                            count: session.entries.length,
                        })}
                    </summary>
                    <ol className="studio-history-list">
                        {session.entries.map((entry) => (
                            <li
                                className="studio-history-row"
                                key={entry.id}
                            >
                                <span className="studio-history-track">
                                    <strong>{entry.title}</strong>
                                    <span>{entry.artist}</span>
                                </span>
                                <span className="studio-history-meta">
                                    <span>
                                        {entry.requester} ·{" "}
                                        {entry.platform === "kick"
                                            ? "Kick"
                                            : "Twitch"}
                                    </span>
                                    <span
                                        className="studio-history-outcome"
                                        data-outcome={entry.outcome}
                                    >
                                        {t(
                                            entry.outcome === "played"
                                                ? "history.outcomePlayed"
                                                : "history.outcomeUnplayed"
                                        )}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ol>
                </details>
            )}
        </article>
    );
}

export default function QueueHistory({ active }: { active: boolean }) {
    const { t, i18n } = useTranslation();
    const [sessions, setSessions] = useState<QueueStreamSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [confirmingClear, setConfirmingClear] = useState(false);
    const [actionBusy, setActionBusy] = useState(false);
    const [actionMessage, setActionMessage] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const result = await window.electronAPI?.invoke?.(
                "queue:getHistory"
            );
            setSessions(normalizeSessions(result));
        } catch {
            setSessions([]);
            setError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (active) void load();
    }, [active, load]);

    const exportHistory = useCallback(async () => {
        setActionBusy(true);
        setActionMessage(null);
        try {
            const result = await window.electronAPI?.invoke?.(
                "queue:exportHistory"
            );
            const payload = result as { canceled?: boolean } | null;
            if (!payload?.canceled) {
                setActionMessage(t("history.exported"));
            }
        } catch {
            setActionMessage(t("history.actionFailed"));
        } finally {
            setActionBusy(false);
        }
    }, [t]);

    const clearHistory = useCallback(async () => {
        if (!confirmingClear) {
            setConfirmingClear(true);
            setActionMessage(null);
            return;
        }
        setActionBusy(true);
        setActionMessage(null);
        try {
            const result = await window.electronAPI?.invoke?.(
                "queue:clearHistory",
                { confirmed: true }
            );
            const payload = result as {
                ok?: boolean;
                removed?: number;
            } | null;
            if (payload?.ok === false) {
                setConfirmingClear(false);
                setActionMessage(t("history.actionFailed"));
                return;
            }
            const removed = payload?.removed ?? 0;
            setConfirmingClear(false);
            setActionMessage(t("history.cleared", { count: removed }));
            await load();
        } catch {
            setActionMessage(t("history.actionFailed"));
        } finally {
            setActionBusy(false);
        }
    }, [confirmingClear, load, t]);

    if (loading) {
        return (
            <p className="studio-history-state" role="status">
                {t("history.loading")}
            </p>
        );
    }

    if (error) {
        return (
            <div className="studio-history-state" role="alert">
                <p>{t("history.error")}</p>
                <Button variant="ghost" size="small" onClick={() => void load()}>
                    {t("history.retry")}
                </Button>
            </div>
        );
    }

    if (sessions.length === 0) {
        return (
            <div className="studio-history">
                <div
                    className="studio-history-actions"
                    aria-label={t("history.actions")}
                >
                    <Button
                        variant="ghost"
                        size="small"
                        onClick={() => void exportHistory()}
                        disabled
                    >
                        {t("history.export")}
                    </Button>
                    <Button variant="ghost" size="small" disabled>
                        {t("history.clear")}
                    </Button>
                </div>
                <div className="studio-history-state">
                    <p>{t("history.empty")}</p>
                    <p className="studio-history-state-copy">
                        {t("history.emptyCopy")}
                    </p>
                </div>
            </div>
        );
    }

    const hasEnded = sessions.some(
        (session) => session.endedAt !== null
    );

    return (
        <div className="studio-history">
            <div
                className="studio-history-actions"
                aria-label={t("history.actions")}
            >
                <Button
                    variant="ghost"
                    size="small"
                    onClick={() => void exportHistory()}
                    disabled={actionBusy}
                >
                    {t("history.export")}
                </Button>
                <Button
                    variant="ghost"
                    size="small"
                    onClick={() => void clearHistory()}
                    disabled={actionBusy || !hasEnded}
                    className={
                        confirmingClear
                            ? "studio-history-clear-confirm"
                            : undefined
                    }
                >
                    {confirmingClear
                        ? t("history.confirmClear")
                        : t("history.clear")}
                </Button>
                {confirmingClear && (
                    <Button
                        variant="ghost"
                        size="small"
                        onClick={() => setConfirmingClear(false)}
                        disabled={actionBusy}
                    >
                        {t("history.cancel")}
                    </Button>
                )}
                {actionMessage && (
                    <span
                        className="studio-history-action-message"
                        role="status"
                    >
                        {actionMessage}
                    </span>
                )}
            </div>
            {confirmingClear && (
                <p className="studio-history-clear-hint">
                    {t("history.clearHint")}
                </p>
            )}
            <p className="studio-history-lead">{t("history.description")}</p>
            <div className="studio-history-sessions">
                {sessions.map((session) => (
                    <SessionCard
                        key={session.id}
                        session={session}
                        locale={i18n.language || "en"}
                    />
                ))}
            </div>
        </div>
    );
}
