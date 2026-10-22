/**
 * Runtime validators for renderer-to-main IPC payloads.
 *
 * The preload bridge exposes a generic `send`/`invoke`, so every handler must
 * treat its payload as untrusted. These helpers are pure and never throw; they
 * return `undefined`/`null` when a value is not acceptable so handlers can
 * ignore malformed input instead of crashing the main process or persisting
 * junk into config.
 */

const COMMAND_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,50}$/;
const RESERVED_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Upper bound for a chat message composed from templates plus song details. */
export const CHAT_MESSAGE_MAX_LENGTH = 2000;

/** Upper bound for a single forwarded renderer log message. */
export const LOG_MESSAGE_MAX_LENGTH = 2000;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Returns the value only when it is a real boolean. */
export function readBoolean(value: unknown): boolean | undefined {
    return typeof value === "boolean" ? value : undefined;
}

/** Returns a trimmed non-empty string within the length limit, else undefined. */
export function readBoundedString(
    value: unknown,
    maxLength: number
): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > maxLength) return undefined;
    return trimmed;
}

/** Validates a chat message before it reaches a platform API call. */
export function readChatMessage(value: unknown): string | undefined {
    return readBoundedString(value, CHAT_MESSAGE_MAX_LENGTH);
}

/**
 * Validates a command identifier: bounded, safe characters, and never a
 * prototype-sensitive key (command config is persisted as a plain object).
 */
export function readCommandName(value: unknown): string | undefined {
    const name = readBoundedString(value, 50);
    if (!name) return undefined;
    if (!COMMAND_NAME_PATTERN.test(name)) return undefined;
    if (RESERVED_OBJECT_KEYS.has(name)) return undefined;
    return name;
}

/** Validates a command alias list: at most 10 aliases of up to 20 characters. */
export function readCommandAliases(value: unknown): string[] | undefined {
    if (!Array.isArray(value) || value.length > 10) return undefined;
    const aliases: string[] = [];
    for (const alias of value) {
        if (typeof alias !== "string") return undefined;
        const trimmed = alias.trim();
        if (trimmed.length === 0 || trimmed.length > 20) return undefined;
        aliases.push(trimmed);
    }
    return aliases;
}

/**
 * Normalizes a forwarded renderer log payload. Returns null when the payload
 * is not an object with a string message; long messages are truncated.
 */
export function readRendererLogPayload(
    value: unknown
): { message: string; meta: unknown } | null {
    if (!isPlainObject(value)) return null;
    if (typeof value.message !== "string") return null;
    return {
        message: value.message.slice(0, LOG_MESSAGE_MAX_LENGTH),
        meta: value.meta,
    };
}
