import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { logError, logWarn } from "@/core/logging";
import type {
    QueueHistoryPersistence,
    QueueSessionEndReason,
    QueueSessionEntry,
    QueueStreamSession,
} from "./streamSession";

const MAX_SESSIONS = 50;
const MAX_ENTRIES = 500;
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export function queueHistoryFilePath(): string {
    return path.join(app.getPath("userData"), "queue-history.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

function finite(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value)
        ? value
        : null;
}

function endReason(value: unknown): QueueSessionEndReason | null {
    return value === "offline" ||
        value === "interrupted" ||
        value === "app-quit"
        ? value
        : null;
}

function safeArtwork(value: unknown): string | null {
    const url = text(value);
    if (!url) return null;
    return /^https:\/\//i.test(url) || /^data:image\//i.test(url)
        ? url
        : null;
}

function normalizeEntry(value: unknown): QueueSessionEntry | null {
    if (!isRecord(value)) return null;
    const id = text(value.id);
    const title = text(value.title);
    const artist = text(value.artist);
    const requester = text(value.requester);
    const platform = value.platform;
    const acceptedAt = finite(value.acceptedAt);
    const outcome = value.outcome;
    if (
        !id ||
        !title ||
        !artist ||
        !requester ||
        (platform !== "kick" && platform !== "twitch") ||
        acceptedAt === null ||
        (outcome !== "played" && outcome !== "unplayed")
    ) {
        return null;
    }
    const playedAt = finite(value.playedAt);
    return {
        id,
        title,
        artist,
        requester,
        platform,
        acceptedAt,
        position:
            finite(value.position) ?? 1,
        artworkUrl: safeArtwork(value.artworkUrl),
        outcome,
        playedAt: outcome === "played" ? playedAt : null,
    };
}

function normalizeSession(value: unknown): QueueStreamSession | null {
    if (!isRecord(value)) return null;
    const id = text(value.id);
    const startedAt = finite(value.startedAt);
    if (!id || startedAt === null) return null;
    const rawEndedAt = value.endedAt;
    const endedAt =
        rawEndedAt === null ? null : finite(rawEndedAt);
    const rawProviders = isRecord(value.providers) ? value.providers : {};
    const entries = Array.isArray(value.entries)
        ? value.entries
              .map(normalizeEntry)
              .filter((entry): entry is QueueSessionEntry => !!entry)
              .slice(-MAX_ENTRIES)
        : [];
    return {
        id,
        startedAt,
        endedAt:
            endedAt !== null && endedAt >= startedAt
                ? endedAt
                : endedAt === null
                  ? null
                  : startedAt,
        endReason: endReason(value.endReason),
        providers: {
            kick: rawProviders.kick === true,
            twitch: rawProviders.twitch === true,
        },
        entries,
    };
}

function normalizeSessions(value: unknown): QueueStreamSession[] {
    const rawSessions = Array.isArray(value)
        ? value
        : isRecord(value) && Array.isArray(value.sessions)
          ? value.sessions
          : [];
    return rawSessions
        .map(normalizeSession)
        .filter((session): session is QueueStreamSession => !!session)
        .slice(-MAX_SESSIONS);
}

function retainRecent(
    sessions: QueueStreamSession[]
): QueueStreamSession[] {
    const cutoff = Date.now() - MAX_AGE_MS;
    return sessions
        .filter(
            (session) =>
                session.endedAt === null || session.startedAt >= cutoff
        )
        .slice(-MAX_SESSIONS);
}

export function createQueueHistoryPersistence(
    filePath: string = queueHistoryFilePath()
): QueueHistoryPersistence {
    return {
        load() {
            if (!fs.existsSync(filePath)) return [];
            try {
                const raw = fs.readFileSync(filePath, "utf8");
                return retainRecent(
                    normalizeSessions(JSON.parse(raw) as unknown)
                );
            } catch (error) {
                try {
                    fs.renameSync(
                        filePath,
                        `${filePath}.corrupt-${Date.now()}`
                    );
                } catch {
                    // The original file may be locked; reading still failed.
                }
                logWarn(
                    "Queue history was unreadable; starting a fresh history",
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    }
                );
                return [];
            }
        },
        save(sessions) {
            const dir = path.dirname(filePath);
            const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
            try {
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(
                    tempPath,
                    JSON.stringify(
                        {
                            version: 1,
                            sessions: retainRecent(
                                normalizeSessions(sessions)
                            ),
                        },
                        null,
                        2
                    ),
                    "utf8"
                );
                fs.renameSync(tempPath, filePath);
            } catch (error) {
                try {
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                } catch {
                    // The original write failure is the actionable one.
                }
                logError(error, "queueHistory:save");
            }
        },
    };
}
