import Config from "@/core/config";
import { playSong } from "@/features/spotify/playback/player";
import { incrementSongRequestCount } from "@/core/ipc/handlers";
import { recordSongRequestOutcome } from "../songRequestHistory";
import { logDebug, logError, logWarn, logSongRequest } from "@/core/logging";
import {
    songRequestErrorMessage,
    type SongRequestFailureReason,
    type SongRequestOutcome,
} from "../../shared/songRequestOutcome";
import {
    type CommandContext,
    type CommandManager,
    type SongRequestAdmission,
    isModerator,
} from "./manager";

function formatTemplate(
    template: string,
    vars: Record<string, string | number>
) {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
        return vars[key]?.toString() || match;
    });
}

type ReplySender = (message: string) => Promise<void>;

interface ExecuteSongRequestOptions {
    sendReply?: ReplySender;
    skipPermissionCheck?: boolean;
    onOutcome?: (outcome: SongRequestOutcome) => void;
}

export async function executeSongRequest(
    ctx: CommandContext,
    songQuery: string,
    commandManager?: CommandManager,
    options: ExecuteSongRequestOptions = {}
): Promise<boolean> {
    const { sendReply, skipPermissionCheck = false, onOutcome } = options;
    const query = songQuery.trim();
    const source = skipPermissionCheck ? "reward" : "command";
    const finish = (outcome: SongRequestOutcome): boolean => {
        recordSongRequestOutcome(outcome);
        onOutcome?.(outcome);
        if (outcome.status === "rejected") {
            logWarn(
                `Song request rejected (${outcome.reason}, ${outcome.source}): ${outcome.message}`,
                "songRequest"
            );
        }
        return outcome.status === "success";
    };
    const reject = (
        reason: SongRequestFailureReason,
        message = songRequestErrorMessage(reason)
    ): boolean =>
        finish({
            status: "rejected",
            source,
            reason,
            message,
            manualReconciliationRequired: source === "reward",
            platform: ctx.platform,
            requestedBy: ctx.username,
        });

    logDebug("executeSongRequest called", {
        username: ctx.username,
        platform: ctx.platform,
        query,
        skipPermissionCheck,
    });

    if (!skipPermissionCheck) {
        const canAnyonePlaySong = Config.get("canAnyonePlaySong") === true;
        const configuredRoles = Config.get("allowedBadges");
        const userRoles = Array.isArray(configuredRoles)
            ? configuredRoles.filter((role): role is string => typeof role === "string")
            : configuredRoles === undefined
              ? ["og", "vip", "subscriber"]
              : [];
        const badges = Array.isArray(ctx.badges) ? ctx.badges : [];
        const allowedRoles = [...userRoles, "broadcaster", "moderator"];
        if (
            !canAnyonePlaySong &&
            !isModerator(badges, ctx.username) &&
            !badges.some((badge) => allowedRoles.includes(badge))
        ) {
            const result = reject("permission");
            if (Config.get("replyOnSongRequestError") && sendReply) {
                await sendReply(
                    `@${ctx.username} You don't have permission to request songs.`
                );
            }
            return result;
        }
    }

    let admission: SongRequestAdmission | undefined;
    if (commandManager) {
        admission = commandManager.reserveSongRequestAdmission(ctx.username);
        if (!admission.admitted) {
            let cooldownMessage = songRequestErrorMessage("cooldown");
            if (Config.get("replyOnCooldown") && sendReply) {
                cooldownMessage = formatTemplate(
                    Config.get("cooldownMessageTemplate") ||
                        "Please wait {time} seconds before requesting another song.",
                    { time: admission.remainingTime }
                );
            }
            // Enforce and record the cooldown even when chat notifications are
            // disabled/unavailable or the reply transport fails.
            const result = reject("cooldown", cooldownMessage);
            if (Config.get("replyOnCooldown") && sendReply) {
                await sendReply(`@${ctx.username} ${cooldownMessage}`);
            }
            return result;
        }
    }

    if (!query) {
        admission?.release();
        const result = reject("empty-query");
        if (Config.get("replyOnSongRequestError") && sendReply) {
            await sendReply(
                `@${ctx.username} Please provide a song name or Spotify URL.`
            );
        }
        return result;
    }

    let playbackOutcome;
    try {
        playbackOutcome = await playSong(query, ctx.username);
    } catch (error) {
        logError(error, "songRequest:playSong");
        admission?.release();
        playbackOutcome = {
            status: "failure" as const,
            reason: "unknown" as const,
            error: songRequestErrorMessage("unknown"),
        };
    }

    if (playbackOutcome.status === "failure") {
        admission?.release();
        const result = reject(
            playbackOutcome.reason,
            playbackOutcome.error
        );
        if (Config.get("replyOnSongRequestError") && sendReply) {
            const errorReply = formatTemplate(
                Config.get("songRequestErrorTemplate") ||
                    "Song not found or unavailable",
                { error: playbackOutcome.error }
            );
            await sendReply(`@${ctx.username} ${errorReply}`);
        }
        return result;
    }

    const songInfo = playbackOutcome.song;

    admission?.commit();
    logSongRequest(songInfo.title, songInfo.artist, ctx.username);
    incrementSongRequestCount(songInfo);

    // Queue insertion is confirmed at this point; record the success before a
    // chat reply can fail, so status history remains truthful.
    const result = finish({
        status: "success",
        source,
        title: songInfo.title,
        artist: songInfo.artist,
        message: "Added to queue.",
        manualReconciliationRequired: false,
        platform: ctx.platform,
        requestedBy: ctx.username,
    });

    if (Config.get("replyOnSongRequest") && sendReply) {
        await sendReply(
            `@${ctx.username} ` +
                formatTemplate(
                    Config.get("songRequestReplyTemplate") ||
                        "Added to queue: {title} by {artist}",
                    { title: songInfo.title, artist: songInfo.artist }
                )
        );
    }

    return result;
}
