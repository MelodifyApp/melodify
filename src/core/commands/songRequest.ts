import Config from "@/core/config";
import { playSong } from "@/features/spotify/playback/player";
import { incrementSongRequestCount } from "@/core/ipc/handlers";
import { logDebug, logError, logSongRequest } from "@/core/logging";
import { type CommandContext, type CommandManager, isModerator } from "./manager";

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
}

export async function executeSongRequest(
    ctx: CommandContext,
    songQuery: string,
    commandManager?: CommandManager,
    options: ExecuteSongRequestOptions = {}
): Promise<boolean> {
    const { sendReply, skipPermissionCheck = false } = options;
    const query = songQuery.trim();

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
            if (Config.get("replyOnSongRequestError") && sendReply) {
                await sendReply(
                    `@${ctx.username} You don't have permission to request songs.`
                );
            }
            return false;
        }
    }

    let longestRemainingTime = 0;
    let isOnCooldown = false;

    if (commandManager && commandManager.checkGlobalCooldown()) {
        const globalRemainingTime = commandManager.getRemainingCooldownTime(
            commandManager.getGlobalCooldownEnd()
        );
        longestRemainingTime = Math.max(
            longestRemainingTime,
            globalRemainingTime
        );
        isOnCooldown = true;
    }

    if (commandManager && commandManager.checkUserCooldown(ctx.username)) {
        const userCooldownEnd = commandManager.getUserCooldownEnd(ctx.username);
        if (userCooldownEnd) {
            const userRemainingTime = commandManager.getRemainingCooldownTime(
                userCooldownEnd
            );
            longestRemainingTime = Math.max(
                longestRemainingTime,
                userRemainingTime
            );
            isOnCooldown = true;
        }
    }

    if (isOnCooldown) {
        if (Config.get("replyOnCooldown") && sendReply) {
            const cooldownMessage = formatTemplate(
                Config.get("cooldownMessageTemplate") ||
                    "Please wait {time} seconds before requesting another song.",
                { time: longestRemainingTime }
            );
            await sendReply(`@${ctx.username} ${cooldownMessage}`);
        }
        // Enforce the cooldown even when chat notifications are disabled/unavailable.
        return false;
    }

    if (!query) {
        if (Config.get("replyOnSongRequestError") && sendReply) {
            await sendReply(
                `@${ctx.username} Please provide a song name or Spotify URL.`
            );
        }
        return false;
    }

    let songInfo: { title: string; artist: string } | null = null;
    try {
        songInfo = await playSong(query, ctx.username);
    } catch (error) {
        logError(error, "songRequest:playSong");
        return false;
    }

    if (!songInfo) {
        if (Config.get("replyOnSongRequestError") && sendReply) {
            await sendReply(
                `@${ctx.username} ${
                    Config.get("songRequestErrorTemplate") ||
                    "Song not found or unavailable"
                }`
            );
        }
        return false;
    }

    if (commandManager) {
        commandManager.setGlobalCooldown();
        commandManager.setUserCooldown(ctx.username);
    }

    logSongRequest(songInfo.title, songInfo.artist, ctx.username);
    incrementSongRequestCount(songInfo);

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

    return true;
}
