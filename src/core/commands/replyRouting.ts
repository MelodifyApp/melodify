import type { CommandContext } from "./manager";

export type ReplyPlatform = "twitch" | "kick";

/**
 * Route chat replies only by the platform recorded on the context.
 * Guessing from raw event shape used to send replies to the wrong service
 * when the platform was missing; fail closed instead.
 */
export function resolveReplyPlatform(ctx: {
    platform?: CommandContext["platform"];
}): ReplyPlatform | null {
    return ctx.platform === "twitch" || ctx.platform === "kick"
        ? ctx.platform
        : null;
}
