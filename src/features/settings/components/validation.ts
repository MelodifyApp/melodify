/**
 * Command validation and real-time field validation system
 * Provides centralized validation for all settings inputs with user-friendly
 * error messages. The optional translator keeps the renderer localized while
 * preserving the existing English fallback for isolated callers/tests.
 */

export type ValidationTranslator = (
    key: string,
    options?: Record<string, unknown>
) => string;

function message(
    t: ValidationTranslator | undefined,
    key: string,
    fallback: string,
    options?: Record<string, unknown>
): string {
    return t ? t(key, options) : fallback;
}

// Validation functions
export const validateUrl = (
    url: string,
    t?: ValidationTranslator
): string | null => {
    if (!url.trim()) return message(t, "validation.urlRequired", "Please enter a URL");
    try {
        new URL(url);
        return null;
    } catch {
        return message(
            t,
            "validation.urlInvalid",
            "Please enter a valid URL (e.g., http://example.com)"
        );
    }
};

export const validateClientId = (
    id: string,
    t?: ValidationTranslator
): string | null => {
    if (!id.trim())
        return message(t, "validation.clientIdRequired", "Please enter a Client ID");
    if (id.length < 10)
        return message(
            t,
            "validation.clientIdTooShort",
            "Client ID appears to be too short"
        );
    if (id.length > 100)
        return message(
            t,
            "validation.clientIdTooLong",
            "Client ID appears to be too long"
        );
    if (!/^[a-zA-Z0-9_-]+$/.test(id))
        return message(
            t,
            "validation.clientIdInvalid",
            "Client ID can only contain letters, numbers, hyphens, and underscores"
        );
    return null;
};

export const validateClientSecret = (
    secret: string,
    t?: ValidationTranslator
): string | null => {
    if (!secret.trim())
        return message(
            t,
            "validation.clientSecretRequired",
            "Please enter a Client Secret"
        );
    if (secret.length < 20)
        return message(
            t,
            "validation.clientSecretTooShort",
            "Client Secret appears to be too short"
        );
    if (secret.length > 200)
        return message(
            t,
            "validation.clientSecretTooLong",
            "Client Secret appears to be too long"
        );
    return null;
};

export const validateCommandAlias = (
    alias: string,
    existingAliases: string[],
    commandName: string,
    t?: ValidationTranslator
): string | null => {
    if (!alias.trim())
        return message(
            t,
            "validation.aliasRequired",
            "Please enter an alternative command name"
        );
    if (alias.length < 1)
        return message(
            t,
            "validation.aliasTooShort",
            "Alternative name must be at least 1 character"
        );
    if (alias.length > 20)
        return message(
            t,
            "validation.aliasTooLong",
            "Alternative name must be no more than 20 characters"
        );
    if (!/^[a-zA-Z0-9_-]+$/.test(alias))
        return message(
            t,
            "validation.aliasInvalid",
            "Alternative name can only contain letters, numbers, hyphens, and underscores"
        );
    if (alias === commandName)
        return message(
            t,
            "validation.aliasSame",
            "Alternative name cannot be the same as the main command"
        );
    if (existingAliases.includes(alias))
        return message(
            t,
            "validation.aliasInUse",
            "This alternative name is already in use"
        );
    return null;
};

/**
 * Advanced template validation with variable checking.
 *
 * @param template - The template string to validate (e.g., "Song: {title} by {artist}")
 * @param allowedVars - Array of valid variable names that can be used in the template
 * @param t - Optional renderer translator
 * @returns Validation error message or null if valid
 */
export const validateTemplate = (
    template: string,
    allowedVars: string[],
    t?: ValidationTranslator
): string | null => {
    if (!template.trim())
        return message(t, "validation.messageRequired", "Please enter a message");
    if (template.length > 500)
        return message(
            t,
            "validation.messageTooLong",
            "Message must be no more than 500 characters"
        );

    // Check for valid variables
    const variableRegex = /\{([^}]+)\}/g;
    const matches = template.match(variableRegex);
    if (matches) {
        for (const match of matches) {
            const varName = match.slice(1, -1);
            if (!allowedVars.includes(varName)) {
                return message(
                    t,
                    "validation.unknownVariable",
                    `Unknown variable: {${varName}}. Available variables: ${allowedVars.join(", ")}`,
                    {
                        variable: varName,
                        available: allowedVars.join(", "),
                    }
                );
            }
        }
    }
    return null;
};

/**
 * Dynamic field validation dispatcher.
 *
 * @param key - Configuration field name (determines validation rules)
 * @param value - Value to validate (can be string, array, or other types)
 * @param t - Optional renderer translator
 */
export const validateField = (
    key: string,
    value: any,
    t?: ValidationTranslator
): string | null => {
    // Complex regex for prefix validation - ensures only special characters are used
    // This prevents conflicts with normal chat messages and ensures clear command distinction
    switch (key) {
        case "prefix":
            if (typeof value === "string") {
                if (!value || value.length < 1)
                    return message(
                        t,
                        "validation.prefixEmpty",
                        "Prefix cannot be empty"
                    );
                if (value.length > 10)
                    return message(
                        t,
                        "validation.prefixTooLong",
                        "Prefix too long (max 10 characters)"
                    );
                // Regex ensures prefix uses special characters to avoid confusion with regular text
                if (!/^[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]+$/.test(value)) {
                    return message(
                        t,
                        "validation.prefixInvalid",
                        "Prefix should be a special character (e.g., !, @, #, $)"
                    );
                }
            }
            break;
        case "kickRedirectUri":
        case "spotifyRedirectUri":
            if (typeof value === "string" && value) {
                return validateUrl(value, t);
            }
            break;
        case "spotifyClientId":
        case "kickClientId":
        case "twitchClientId":
            if (typeof value === "string" && value) {
                return validateClientId(value, t);
            }
            break;
        case "spotifyClientSecret":
        case "kickClientSecret":
        case "twitchClientSecret":
            if (typeof value === "string" && value) {
                return validateClientSecret(value, t);
            }
            break;
        case "songRequestReplyTemplate":
            if (typeof value === "string" && value) {
                return validateTemplate(value, ["title", "artist"], t);
            }
            break;
        case "rewardTitle":
        case "twitchRewardTitle":
            if (typeof value === "string" && value) {
                return null;
            }
            break;
        case "currentSongFormat":
            if (typeof value === "string" && value) {
                return validateTemplate(value, ["title", "artist"], t);
            }
            break;
        case "songRequestErrorTemplate":
        case "volumeErrorTemplate":
            if (typeof value === "string" && value) {
                return validateTemplate(value, ["error"], t);
            }
            break;
        case "volumeChangeReplyTemplate":
        case "volumeGetReplyTemplate":
            if (typeof value === "string" && value) {
                return validateTemplate(value, ["volume"], t);
            }
            break;
        case "customModerators":
            if (Array.isArray(value)) {
                const seenModerators = new Set<string>();
                for (const moderator of value) {
                    if (!moderator || typeof moderator !== "string") {
                        return message(
                            t,
                            "validation.moderatorInvalid",
                            "All moderator usernames must be valid strings"
                        );
                    }
                    if (moderator.length < 1) {
                        return message(
                            t,
                            "validation.moderatorEmpty",
                            "Moderator usernames cannot be empty"
                        );
                    }
                    if (moderator.length > 50) {
                        return message(
                            t,
                            "validation.moderatorTooLong",
                            "Moderator usernames must be no more than 50 characters"
                        );
                    }
                    if (!/^[a-zA-Z0-9_-]+$/.test(moderator)) {
                        return message(
                            t,
                            "validation.moderatorInvalidChars",
                            "Moderator usernames can only contain letters, numbers, hyphens, and underscores"
                        );
                    }
                    if (seenModerators.has(moderator.toLowerCase())) {
                        return message(
                            t,
                            "validation.moderatorDuplicate",
                            `Duplicate moderator username: ${moderator}`,
                            { name: moderator }
                        );
                    }
                    seenModerators.add(moderator.toLowerCase());
                }
            }
            break;
        case "currentSongFilePath":
            if (typeof value === "string" && value) {
                if (value.length > 500) {
                    return message(
                        t,
                        "validation.pathTooLong",
                        "File path too long (max 500 characters)"
                    );
                }
                // Basic path validation - check for invalid characters
                // Allow colons for Windows drive letters (e.g., C:)
                if (/[<>"|?*]/.test(value)) {
                    return message(
                        t,
                        "validation.pathInvalid",
                        "File path contains invalid characters"
                    );
                }
            }
            break;
    }
    return null;
};
