export const UI_TEST_ROUTES = [
    { id: "home", label: "Home" },
    { id: "settings", label: "Settings" },
] as const;

export const UI_TEST_SETTINGS_SECTIONS = [
    "general",
    "secrets",
    "requests",
    "commands",
    "logs",
    "debug",
] as const;

export const UI_TEST_CONNECTION_STATES = {
    spotify: [
        "loading",
        "no-secrets",
        "credentials-only",
        "auth-in-progress",
        "auth-error",
        "connected-no-device",
        "active-local",
        "active-remote",
    ],
    kick: [
        "loading",
        "no-secrets",
        "credentials-only",
        "auth-in-progress",
        "oauth-failed-reader-active",
        "chat-connecting",
        "chat-connected",
        "chat-disconnected",
    ],
    twitch: [
        "loading",
        "no-secrets",
        "credentials-only",
        "auth-in-progress",
        "listener-started-unverified",
        "chat-connected",
        "subscription-error",
        "auth-expired",
    ],
} as const;

export const UI_TEST_UPDATE_STATES = [
    "idle",
    "checking",
    "available",
    "downloading",
    "downloaded",
    "error",
] as const;

export const UI_TEST_CREDENTIAL_FORM_STATES = [
    "empty",
    "validation-error",
    "saving",
    "server-error",
] as const;

export function advanceMockDownloadProgress(
    currentPercent: number,
    step = 20
): { percent: number; complete: boolean } {
    const current = Number.isFinite(currentPercent)
        ? Math.max(0, Math.min(100, currentPercent))
        : 0;
    const increment = Number.isFinite(step) ? Math.max(0, step) : 20;
    const percent = Math.min(100, current + increment);
    return { percent, complete: percent >= 100 };
}

export const UI_TEST_SETTINGS_STATES = {
    general: ["defaults", "custom-language", "update-available", "update-error"],
    secrets: ["empty", "configured", "validation-error"],
    requests: ["defaults", "everyone-allowed", "custom-rewards", "file-output"],
    commands: ["enabled", "disabled", "replies-off", "aliases-expanded"],
    logs: ["empty", "populated", "filtered-empty", "error"],
    debug: ["healthy", "warning", "loading"],
} as const;

export const UI_TEST_PRESETS = [
    {
        id: "first-run",
        label: "First run",
        spotify: "no-secrets",
        kick: "no-secrets",
        twitch: "no-secrets",
        requestCount: 0,
        lastRequest: false,
    },
    {
        id: "ready-to-stream",
        label: "Ready to stream",
        spotify: "active-local",
        kick: "chat-connected",
        twitch: "no-secrets",
        requestCount: 14,
        lastRequest: true,
    },
    {
        id: "spotify-remote",
        label: "Spotify on another device",
        spotify: "active-remote",
        kick: "chat-connected",
        twitch: "no-secrets",
        requestCount: 3,
        lastRequest: true,
    },
    {
        id: "kick-partial",
        label: "Kick reader, no OAuth",
        spotify: "active-local",
        kick: "oauth-failed-reader-active",
        twitch: "no-secrets",
        requestCount: 8,
        lastRequest: true,
    },
    {
        id: "twitch-unverified",
        label: "Twitch listener unverified",
        spotify: "active-local",
        kick: "no-secrets",
        twitch: "listener-started-unverified",
        requestCount: 5,
        lastRequest: true,
    },
    {
        id: "service-errors",
        label: "Service errors",
        spotify: "auth-error",
        kick: "chat-disconnected",
        twitch: "subscription-error",
        requestCount: 0,
        lastRequest: false,
    },
] as const;
