import { getSpotifyApi } from "@/features/spotify/playback/player";
import Config from "@/core/config";
import { sendKickMessage } from "@/features/kick/chat/listener";
import { sendTwitchMessage } from "@/features/twitch/chat/listener";
import { logDebug, logError, logWarn } from "@/core/logging";
import { Command, CommandContext } from "./manager";
import { executeSongRequest } from "./songRequest";
import { resolveReplyPlatform } from "./replyRouting";

function formatTemplate(
    template: string,
    vars: Record<string, string | number>
) {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
        return vars[key]?.toString() || match;
    });
}

async function sendChatReply(ctx: CommandContext, message: string) {
    try {
        const platform = resolveReplyPlatform(ctx);
        if (!platform) {
            logWarn(
                "Chat reply skipped: context has no known platform",
                "sendChatReply"
            );
            return;
        }

        if (platform === "twitch") {
            await sendTwitchMessage(message);
        } else {
            await sendKickMessage(message);
        }
    } catch (error) {
        logError(error, "sendChatReply");
    }
}

// Song Request Command
const SongRequestCommand: Command = {
    name: "sr",
    description: "Request a song to be played on Spotify",
    usage: "{prefix}sr <song name or URL>",
    enabled: true,
    handler: async (ctx, args, commandManager) => {
        logDebug("SongRequestCommand invoked", {
            username: ctx.username,
            args,
            badges: ctx.badges,
        });
        const songQuery = args.join(" ").trim();
        await executeSongRequest(ctx, songQuery, commandManager, {
            sendReply: (message) => sendChatReply(ctx, message),
            skipPermissionCheck: false,
        });
    },
};

// Volume Command
const VolumeCommand: Command = {
    name: "volume",
    description: "Get or change the Spotify playback volume (moderators only)",
    usage: "{prefix}volume [0-100]",
    enabled: true,
    modOnly: true,
    handler: async (ctx, args, commandManager) => {
        logDebug("VolumeCommand invoked", { username: ctx.username, args });
        const spotifyApi = getSpotifyApi();
        if (!spotifyApi) {
            logDebug("Spotify API not connected for volume command", {
                username: ctx.username,
            });
            if (Config.get("replyOnVolumeError")) {
                await sendChatReply(
                    ctx,
                    `@${ctx.username} Spotify is not connected. Please connect to Spotify first.`
                );
            }
            return;
        }

        // If no arguments provided, return current volume
        if (!args[0]) {
            try {
                const playbackState =
                    await spotifyApi.getMyCurrentPlaybackState();
                const currentVolume =
                    playbackState.body.device?.volume_percent || 0;
                logDebug("Fetched current Spotify volume", {
                    username: ctx.username,
                    currentVolume,
                });
                if (Config.get("replyOnVolumeGet")) {
                    await sendChatReply(
                        ctx,
                        `@${ctx.username} ` +
                            formatTemplate(
                                Config.get("volumeGetReplyTemplate") ||
                                    "Current Spotify volume is {volume}%",
                                { volume: currentVolume }
                            )
                    );
                }
            } catch (error) {
                logError(error, "volume:getCurrentVolume");
                if (Config.get("replyOnVolumeError")) {
                    await sendChatReply(
                        ctx,
                        `@${ctx.username} Something went wrong, please try again.`
                    );
                }
            }
            return;
        }

        // Validate volume argument
        if (isNaN(Number(args[0]))) {
            if (Config.get("replyOnVolumeError")) {
                await sendChatReply(
                    ctx,
                    `@${ctx.username} Please enter a volume between 0 and 100.`
                );
            }
            return;
        }

        const vol = Math.max(0, Math.min(100, Number(args[0])));

        try {
            logDebug("Setting Spotify volume", { username: ctx.username, vol });
            await spotifyApi.setVolume(vol);
            logDebug("Spotify volume set successfully", { username: ctx.username, vol });
            if (Config.get("replyOnVolumeChange")) {
                await sendChatReply(
                    ctx,
                    `@${ctx.username} ` +
                        formatTemplate(
                            Config.get("volumeChangeReplyTemplate") ||
                                "Spotify volume changed to {volume}%",
                            { volume: vol }
                        )
                );
            }
        } catch (error) {
            logError(error, "volume:setVolume");
            if (Config.get("replyOnVolumeError")) {
                await sendChatReply(
                    ctx,
                    `@${ctx.username} Something went wrong, please try again.`
                );
            }
        }
    },
};

/**
 * Registers all core commands to the provided CommandManager instance.
 * @param commandManager The CommandManager instance to register commands to.
 */
export function registerAllCommands(
    commandManager: import("./manager").CommandManager
) {
    commandManager.register(SongRequestCommand);
    commandManager.register(VolumeCommand);
}
