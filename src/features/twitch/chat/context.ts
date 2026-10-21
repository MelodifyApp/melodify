import type { CommandContext } from "@/core/commands/manager";

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

/**
 * Legacy chat transports used IRC-style text flags. Accept the values that
 * genuinely mean "true" and reject "false"/"0"/other text instead of trusting
 * JavaScript truthiness. Real EventSub payloads use badges[].set_id instead.
 */
function legacyFlag(value: unknown): boolean {
    if (value === true) return true;
    if (typeof value !== "string") return false;
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true";
}

/** Decode platform metadata, never infer permissions from message text or badge versions. */
export function decodeTwitchChatContext(event: unknown): CommandContext | null {
    const data = record(event);
    const username = data.chatter_user_login;
    const message = record(data.message).text;
    if (typeof username !== "string" || !username.trim() ||
        typeof message !== "string" || !message.trim()) return null;

    const badges = new Set<string>();
    const roles = ["broadcaster", "moderator", "subscriber", "vip"];
    if (Array.isArray(data.badges)) {
        for (const badge of data.badges) {
            const role = record(badge).set_id;
            if (typeof role === "string" && roles.includes(role)) badges.add(role);
        }
    }
    if (typeof data.chatter_user_id === "string" && data.chatter_user_id.trim() &&
        data.chatter_user_id === data.broadcaster_user_id) badges.add("broadcaster");

    if (legacyFlag(data.is_broadcaster) || legacyFlag(data.chatter_is_broadcaster) ||
        data.user_type === "broadcaster") badges.add("broadcaster");
    if (legacyFlag(data.is_mod) || legacyFlag(data.is_moderator) ||
        legacyFlag(data.chatter_is_mod) ||
        data.user_type === "mod" || data.user_type === "moderator") badges.add("moderator");
    const tags = record(data.tags);
    if (legacyFlag(data.is_subscriber) || legacyFlag(data.is_sub) ||
        legacyFlag(tags.subscriber)) badges.add("subscriber");
    if (legacyFlag(data.is_vip) || legacyFlag(tags.vip)) badges.add("vip");

    return { username, message, badges: [...badges], raw: data, platform: "twitch" };
}
