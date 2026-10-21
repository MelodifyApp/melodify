import fs from "fs";
import path from "path";
import { app } from "electron";
import { logInfo, logError, logDebug, logWarn } from "@/core/logging";
import { redactSecrets } from "@/core/logging/utils";
import { resolveUserDataDirectory, previewOverrideIgnored } from "./userDataDirectory";

/**
 * Configuration management system with multi-language support
 * Handles secure storage of API credentials, user preferences, and translated default templates
 * Automatically merges user customizations with language-specific defaults
 */

/**
 * Complete application configuration interface
 * Includes API tokens, user preferences, and localized message templates
 */
interface CommandConfig {
    aliases?: string[];
    enabled?: boolean;
}

interface AppConfig {
    // Kick tokens
    kickAccessToken?: string;
    kickRefreshToken?: string;
    kickExpiresAt?: number;

    // Spotify tokens
    spotifyAccessToken?: string;
    spotifyRefreshToken?: string;
    spotifyExpiresAt?: number;

    // Twitch tokens
    twitchAccessToken?: string;
    twitchRefreshToken?: string;
    twitchExpiresAt?: number;

    // Common
    codeVerifier?: string;
    username?: string;
    userId?: string;
    chatroomId?: string;
    canAnyonePlaySong?: boolean;
    prefix?: string;
    rewardTitle?: string;
    twitchRewardTitle?: string;

    // Twitch Common
    twitchUsername?: string;
    twitchUserId?: string;
    twitchBotUserId?: string;

    // API secrets
    spotifyClientId?: string;
    spotifyClientSecret?: string;
    kickClientId?: string;
    kickClientSecret?: string;
    twitchClientId?: string;
    twitchClientSecret?: string;

    // Song reply message template
    currentSongFormat?: string;

    // Auto update preference
    autoUpdateEnabled?: boolean;

    // Startup preference
    startOnStartup?: boolean;

    // Window behavior
    minimizeToTray?: boolean;

    // Language setting
    language?: string;

    // Track which language defaults are currently being used (internal field)
    defaultsLanguage?: string;

    // Whether defaultsLanguage should automatically follow the app language
    autoFollowLanguageDefaults?: boolean;

    // Command reply toggles and templates
    replyOnSongRequest?: boolean;
    songRequestReplyTemplate?: string;
    replyOnSongRequestError?: boolean;
    songRequestErrorTemplate?: string;
    replyOnVolumeChange?: boolean;
    volumeChangeReplyTemplate?: string;
    replyOnVolumeError?: boolean;
    volumeErrorTemplate?: string;
    replyOnVolumeGet?: boolean;
    volumeGetReplyTemplate?: string;

    commands?: {
        [commandName: string]: CommandConfig;
    };

    allowedBadges?: string[];
    customModerators?: string[];
    saveCurrentSongToFile?: boolean;
    currentSongFilePath?: string;
    kickRedirectUri?: string;
    spotifyRedirectUri?: string;

    // Cooldown settings
    globalCooldownEnabled?: boolean;
    globalCooldownSeconds?: string;
    perUserCooldownEnabled?: boolean;
    perUserCooldownSeconds?: string;
    replyOnCooldown?: boolean;
    cooldownMessageTemplate?: string;
}

const userDataDirectory = resolveUserDataDirectory(
    app.getPath("userData"),
    process.env.MELODIFY_PREVIEW_USER_DATA,
    process.env.NODE_ENV === "development"
);

// Never silently fall back to the real profile when a preview was requested.
if (
    previewOverrideIgnored(
        app.getPath("userData"),
        process.env.MELODIFY_PREVIEW_USER_DATA,
        process.env.NODE_ENV === "development"
    )
) {
    logWarn(
        "MELODIFY_PREVIEW_USER_DATA ignored: preview isolation only applies to development builds",
        "config:userDataDirectory"
    );
}

/**
 * Returns language-specific default configuration values
 * Used when changing languages to provide appropriate default templates and aliases
 *
 * @param language - Target language code ('en', 'tr', etc.)
 * @returns Object containing translated defaults for templates and command aliases
 */
function getTranslatedDefaults(language = "en") {
    const translations = {
        en: {
            songRequestReplyTemplate: "✅ Added to queue: {title} by {artist}",
            songRequestErrorTemplate: "❌ Song not found or unavailable",
            volumeChangeReplyTemplate: "🔊 Volume changed to {volume}%",
            volumeErrorTemplate: "❌ Failed to change volume",
            volumeGetReplyTemplate: "Current Spotify volume is {volume}%",
            cooldownMessageTemplate:
                "Please wait {time} seconds before requesting another song.",
            currentSongFormat: "{title} - {artist}",
            // Command aliases for English
            commands: {
                sr: { aliases: ["song", "request"], enabled: true },
                volume: { aliases: ["vol"], enabled: true },
            },
        },
        tr: {
            songRequestReplyTemplate: "✅ Sıraya eklendi: {title} - {artist}",
            songRequestErrorTemplate: "❌ Şarkı bulunamadı veya erişilemiyor",
            volumeChangeReplyTemplate:
                "🔊 Ses seviyesi {volume}% olarak ayarlandı",
            volumeErrorTemplate: "❌ Ses seviyesi ayarlanamadı",
            volumeGetReplyTemplate: "Mevcut Spotify ses seviyesi {volume}%",
            cooldownMessageTemplate:
                "Başka bir şarkı istemek için {time} saniye bekleyin.",
            currentSongFormat: "{title} - {artist}",
            // Command aliases for Turkish
            commands: {
                sr: { aliases: ["songrequest"], enabled: true },
                volume: { aliases: ["vol"], enabled: true },
            },
        },
    };

    return (
        translations[language as keyof typeof translations] || translations.en
    );
}

const defaultConfig: AppConfig = {
    canAnyonePlaySong: false,
    prefix: "!",
    language: "en",
    autoUpdateEnabled: true,
    minimizeToTray: false,
    replyOnSongRequest: true,
    replyOnSongRequestError: false,
    replyOnCooldown: true,
    replyOnVolumeChange: true,
    replyOnVolumeError: false,
    replyOnVolumeGet: true,
    twitchRewardTitle: "Song Request",
    allowedBadges: ["og", "vip", "subscriber"],
    customModerators: [],
    saveCurrentSongToFile: false,
    currentSongFilePath: path.join(userDataDirectory, "current-song.txt"),
    kickRedirectUri: "http://localhost:8889/callback",
    spotifyRedirectUri: "http://127.0.0.1:8888/callback",

    // Cooldown settings
    globalCooldownEnabled: true,
    globalCooldownSeconds: "30",
    perUserCooldownEnabled: true,
    perUserCooldownSeconds: "60",

    // Track which language defaults are currently being used
    defaultsLanguage: "en",

    // Auto-follow app language for defaults (enabled by default)
    autoFollowLanguageDefaults: true,

    // Default translated message templates and commands (will be set based on language)
    ...getTranslatedDefaults("en"),
};

const storePath = path.join(userDataDirectory, "config.json");

let cache: AppConfig = { ...defaultConfig };

function load(): void {
    try {
        if (fs.existsSync(storePath)) {
            const raw = fs.readFileSync(storePath, "utf-8");
            const savedConfig = JSON.parse(raw);
            cache = { ...defaultConfig, ...savedConfig };

            // Check if we need to update translated defaults for the current language
            const currentLanguage = cache.language || "en";
            const defaultsLanguage = cache.defaultsLanguage || "en";
            const autoFollow = cache.autoFollowLanguageDefaults !== false; // Default to true

            if (autoFollow && currentLanguage !== defaultsLanguage) {
                logInfo(
                    `Language changed from ${defaultsLanguage} to ${currentLanguage}, updating translated defaults (auto-follow enabled)`
                );
                updateTranslatedDefaults();
            } else if (!autoFollow) {
                logInfo(
                    `Language is ${currentLanguage} but defaults language is ${defaultsLanguage} (auto-follow disabled)`
                );
                save();
            } else {
                // Safety check: if user has non-English language but defaultsLanguage is not set correctly,
                // or if they have mismatched defaults, fix it (only if auto-follow is enabled)
                if (
                    autoFollow &&
                    currentLanguage !== "en" &&
                    (!cache.defaultsLanguage || cache.defaultsLanguage === "en")
                ) {
                    logInfo(
                        `Detected language mismatch (language: ${currentLanguage}, defaultsLanguage: ${cache.defaultsLanguage}), fixing defaults`
                    );
                    cache.defaultsLanguage = currentLanguage;
                    updateTranslatedDefaults();
                } else {
                    save();
                }
            }

            logInfo("Loaded config from disk", redactSecrets(cache));
        } else {
            // First time setup - detect system language and apply appropriate defaults
            logInfo(
                "No config file found, creating new configuration with system language defaults"
            );

            // Try to detect system language (simplified detection)
            const systemLanguage = detectSystemLanguage();

            // Create a fresh config with the detected language's defaults
            cache = {
                ...defaultConfig,
                language: systemLanguage,
                defaultsLanguage: systemLanguage,
                ...getTranslatedDefaults(systemLanguage),
            };

            logInfo(`Applied ${systemLanguage} defaults for first-time setup`);

            save();
        }
    } catch (err) {
        logError(err, "config:load");
        cache = { ...defaultConfig };
    }
}

function save(): void {
    try {
        fs.writeFileSync(storePath, JSON.stringify(cache, null, 2), "utf-8");
        logInfo("Saved config to disk", redactSecrets(cache));
    } catch (err) {
        logError(err, "config:save");
    }
}

/**
 * Updates the configuration with translated default templates based on the current language
 * This is useful when the language is changed to update default message templates
 *
 * Key behavior:
 * - Updates templates that are using any language's default values (prevents overriding user customizations)
 * - Compares current values against all supported language defaults to detect user modifications
 * - Preserves user-customized content while updating language-specific defaults
 * - Uses a tracking field to know which language defaults are currently active
 */
function updateTranslatedDefaults(): void {
    // Determine which language to use for defaults
    // If auto-follow is disabled, use the manually set defaultsLanguage
    // If auto-follow is enabled, use the app language
    const autoFollow = cache.autoFollowLanguageDefaults !== false;
    const targetLanguage = autoFollow
        ? cache.language || "en"
        : cache.defaultsLanguage || cache.language || "en";

    const translatedDefaults = getTranslatedDefaults(targetLanguage);

    // Get the language that the current defaults are from (or assume English if not set)
    const previousDefaultsLanguage = cache.defaultsLanguage || "en";
    const previousDefaults = getTranslatedDefaults(previousDefaultsLanguage);

    logInfo(
        `Updating translated defaults from ${previousDefaultsLanguage} to ${targetLanguage} (auto-follow: ${autoFollow})`
    );

    // Get all supported languages to check against all possible defaults
    const supportedLanguages = ["en", "tr"]; // Add more as supported
    const allDefaults = supportedLanguages.map((lang) => ({
        language: lang,
        defaults: getTranslatedDefaults(lang),
    }));

    Object.keys(translatedDefaults).forEach((key) => {
        const configKey = key as keyof typeof translatedDefaults;
        const currentValue = cache[configKey];

        // Check if current value matches any language's default (indicating it hasn't been customized)
        const isDefaultValue =
            !currentValue ||
            allDefaults.some(
                ({ defaults }) => currentValue === defaults[configKey]
            );

        // Update if the current value is a default value from any language
        if (isDefaultValue) {
            const newValue = translatedDefaults[configKey];
            (cache as any)[configKey] = newValue;
            logDebug(
                `Updated ${configKey}: "${currentValue}" -> "${newValue}" (${previousDefaultsLanguage} -> ${targetLanguage})`
            );
        } else {
            logDebug(
                `Preserved custom value for ${configKey}: "${currentValue}"`
            );
        }
    });

    // Track which language defaults we're now using
    cache.defaultsLanguage = targetLanguage;
    save();
}

load();

function get(): AppConfig;
function get<K extends keyof AppConfig>(key: K): AppConfig[K];
function get(key?: keyof AppConfig) {
    return typeof key === "undefined" ? { ...cache } : cache[key];
}

const Config = {
    get,
    getMany<K extends keyof AppConfig>(keys: K[]): Pick<AppConfig, K> {
        const result = keys.reduce(
            (acc, key) => {
                acc[key] = cache[key];
                return acc;
            },
            {} as Pick<AppConfig, K>
        );
        logDebug("Config.getMany called", redactSecrets(result));
        return result;
    },
    set(data: Partial<AppConfig>): void {
        logInfo("Config.set called", redactSecrets(data));

        // Check if language is being changed
        if (
            data.language &&
            data.language !== cache.language &&
            !isUpdatingLanguage
        ) {
            isUpdatingLanguage = true;
            const newLanguage = data.language;

            // Update cache
            cache = { ...cache, ...data };

            // Update translated defaults for the new language
            updateTranslatedDefaults();
            save();

            // Update i18n to match
            if (typeof window !== "undefined") {
                import("@/core/i18n")
                    .then(({ default: i18n }) => {
                        i18n.changeLanguage(newLanguage);
                        isUpdatingLanguage = false;
                    })
                    .catch(() => {
                        isUpdatingLanguage = false;
                    });
            } else {
                isUpdatingLanguage = false;
            }
        }
        // Check if autoFollowLanguageDefaults is being enabled
        else if (
            data.autoFollowLanguageDefaults === true &&
            cache.autoFollowLanguageDefaults !== true
        ) {
            logInfo(
                "Auto-follow defaults enabled, syncing defaults language to app language"
            );

            // Update cache with the new setting and sync defaults language
            cache = { ...cache, ...data, defaultsLanguage: cache.language };

            // Update translated defaults for the current language
            updateTranslatedDefaults();
            save();
        }
        // Check if defaultsLanguage is being manually changed
        else if (
            data.defaultsLanguage &&
            data.defaultsLanguage !== cache.defaultsLanguage
        ) {
            logInfo("Defaults language manually changed", {
                from: cache.defaultsLanguage,
                to: data.defaultsLanguage,
            });

            // Update cache and disable auto-follow since user is manually setting defaults language
            cache = { ...cache, ...data, autoFollowLanguageDefaults: false };

            // Update translated defaults for the new defaults language
            updateTranslatedDefaults();
            save();
        } else {
            // Normal config update
            cache = { ...cache, ...data };
            save();
        }
    },
    setMany<K extends keyof AppConfig>(entries: [K, AppConfig[K]][]): void {
        logInfo(
            "Config.setMany called",
            redactSecrets(Object.fromEntries(entries))
        );
        for (const [key, value] of entries) {
            cache[key] = value;
        }
        save();
    },
    reset(): void {
        logInfo("Config.reset called");
        cache = { ...defaultConfig };
        save();
    },
    updateTranslatedDefaults(): void {
        updateTranslatedDefaults();
    },
    /**
     * Manually sets the defaults language, disabling auto-follow
     */
    setDefaultsLanguage(language: string): void {
        logInfo("Config.setDefaultsLanguage called", {
            language,
            autoFollow: false,
        });
        this.set({
            defaultsLanguage: language,
            autoFollowLanguageDefaults: false,
        });
    },
    /**
     * Enables auto-follow and sets defaults language to match app language
     */
    enableAutoFollowDefaults(): void {
        logInfo("Config.enableAutoFollowDefaults called");
        this.set({
            autoFollowLanguageDefaults: true,
            defaultsLanguage: cache.language,
        });
    },
    /**
     * Gets the current auto-follow setting for defaults language
     */
    isAutoFollowDefaultsEnabled(): boolean {
        return cache.autoFollowLanguageDefaults !== false;
    },
    getPath(): string {
        return storePath;
    },
};

/**
 * Detects the user's system language and returns a supported language code
 * Falls back to English if the system language is not supported
 *
 * @returns Supported language code ('en', 'tr', etc.)
 */
function detectSystemLanguage(): string {
    try {
        // Try to get system language from various sources
        const systemLang =
            process.env.LANG || // Linux/Mac
            process.env.LC_ALL || // Linux/Mac
            process.env.LC_MESSAGES || // Linux/Mac
            app.getSystemLocale() || // Electron
            "en-US"; // Fallback

        logDebug(`Raw system locale detected: ${systemLang}`);

        // Extract language code (e.g., 'tr' from 'tr-TR' or 'tr_TR')
        const langCode = systemLang.split(/[-_]/)[0].toLowerCase();

        // Check if we support this language
        const supportedLanguages = ["en", "tr"];
        if (supportedLanguages.includes(langCode)) {
            logInfo(
                `Detected and using system language: ${langCode} (from ${systemLang})`
            );
            return langCode;
        }

        logInfo(
            `Unsupported system language ${langCode} (from ${systemLang}), falling back to English`
        );
        return "en";
    } catch (error) {
        logError(error, "detectSystemLanguage");
        return "en";
    }
}

let isUpdatingLanguage = false; // Prevent infinite loops

/**
 * Set up bidirectional synchronization between i18n and config
 * This ensures that language changes in the UI are automatically saved to config
 * and that config updates trigger appropriate i18n updates
 */
function setupLanguageSync() {
    // Only set up in renderer process where i18n is available
    if (typeof window !== "undefined") {
        try {
            // Import i18n dynamically to avoid circular dependencies
            import("@/core/i18n")
                .then(({ default: i18n }) => {
                    // Listen for i18n language changes and sync to config
                    i18n.on("languageChanged", (language: string) => {
                        if (isUpdatingLanguage) return; // Prevent loops

                        const currentConfig = get();
                        if (currentConfig.language !== language) {
                            isUpdatingLanguage = true;
                            logInfo(
                                `i18n language changed to ${language}, updating config`
                            );

                            // Update language
                            cache.language = language;

                            // Only update translated defaults if auto-follow is enabled
                            const autoFollow =
                                cache.autoFollowLanguageDefaults !== false;
                            if (autoFollow) {
                                logDebug(
                                    "Auto-follow enabled, updating translated defaults"
                                );
                                updateTranslatedDefaults(); // This will update defaultsLanguage internally
                            } else {
                                logDebug(
                                    "Auto-follow disabled, keeping current defaults language"
                                );
                            }

                            save();
                            isUpdatingLanguage = false;
                        }
                    });

                    logDebug(
                        "Language synchronization set up between i18n and config"
                    );
                })
                .catch((error) => {
                    logWarn("Failed to set up language sync:", error);
                });
        } catch (error) {
            logWarn("Language sync not available in this environment:", error);
        }
    }
}

// Set up language synchronization
setupLanguageSync();

export default Config;
