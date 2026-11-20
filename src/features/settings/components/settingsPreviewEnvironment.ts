/* Development harness only: install a local mock bridge before product modules load. */
import { createHomeFixtureSnapshot } from "../../home/homeFixture";
import type { HomeSessionSnapshot } from "../../home/homeSessionTypes";

const calls: Array<{ channel: string; payload?: unknown }> = [];
const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
const params = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search
);
const scenario = params.get("scenario") || "not-set-up";
const connectMode = params.get("connect") || "success";
const homeScenario = params.get("home") || "populated";
const logsScenario = params.get("logs") || "empty";
const serviceIds = ["spotify", "kick", "twitch"] as const;
const hasStoredScenario = ["checking", "connected", "failed", "unavailable", "mixed"].includes(
    scenario
);
const clientIds = Object.fromEntries(
    serviceIds.map((id) => [
        id,
        hasStoredScenario ? `studio-example-${id}-id` : "",
    ])
);
const storedSecrets = Object.fromEntries(
    serviceIds.map((id) => [id, hasStoredScenario])
) as Record<(typeof serviceIds)[number], boolean>;
let config: Record<string, unknown> = {
    language: "en",
    defaultsLanguage: "en",
    autoFollowLanguageDefaults: true,
    startOnStartup: false,
    minimizeToTray: false,
    autoUpdateEnabled: true,
    spotifyClientId: clientIds.spotify,
    kickClientId: clientIds.kick,
    twitchClientId: clientIds.twitch,
    commands: { sr: { aliases: ["songrequest"] }, volume: { aliases: ["vol"] } },
    prefix: "!",
    canAnyonePlaySong: false,
    currentSongFormat: "{title} - {artist}",
    saveCurrentSongToFile: false,
    currentSongFilePath: "C:\\Users\\Example\\current-song.txt",
    rewardTitle: "Song Request",
    twitchRewardTitle: "Song Request",
    replyOnSongRequest: false,
    replyOnSongRequestError: false,
    globalCooldownEnabled: false,
    perUserCooldownEnabled: false,
    replyOnCooldown: false,
    songRequestReplyTemplate: "Added to queue: {title} by {artist}",
    songRequestErrorTemplate:
        "Song not found or unavailable. Try a different search.",
    globalCooldownSeconds: 30,
    perUserCooldownSeconds: 60,
    cooldownMessageTemplate:
        "Please wait {time} seconds before requesting another song.",
    replyOnVolumeChange: false,
    replyOnVolumeError: false,
    replyOnVolumeGet: false,
    volumeChangeReplyTemplate: "Volume changed to {volume}%",
    volumeErrorTemplate: "Failed to change volume",
    volumeGetReplyTemplate: "Current Spotify volume is {volume}%",
};
let commands: Array<Record<string, unknown>> = [
    { name: "sr", enabled: true, aliases: ["songrequest"] },
    { name: "volume", enabled: true, aliases: ["vol"] },
];
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/* Development gallery fixtures; never shipped in a packaged build. */
const homeFixture = createHomeFixtureSnapshot();
const homeEmpty: HomeSessionSnapshot = {
    ...homeFixture,
    revision: homeFixture.revision + 1,
    queue: [],
};
const now = Date.now();
const sampleLogs = [
    { level: "info", message: "Main process setup complete", timestamp: now - 420000, session: "preview-01" },
    { level: "debug", message: "kick:hasSecrets called", timestamp: now - 360000, session: "preview-01" },
    { level: "info", message: "Kick guest chat connected", timestamp: now - 300000, session: "preview-01" },
    { level: "warn", message: "Update check unavailable in preview", timestamp: now - 240000, session: "preview-01" },
    { level: "info", message: "Song request accepted: Midnight City", timestamp: now - 180000, session: "preview-01" },
    { level: "debug", message: "home:getSession served fixture", timestamp: now - 120000, session: "preview-01" },
    { level: "info", message: "Renderer loaded via webpack", timestamp: now - 60000, session: "preview-01" },
    { level: "error", message: "Example error row for the Logs preview", timestamp: now - 30000, session: "preview-01" },
];

function verificationResult(serviceId: (typeof serviceIds)[number]) {
    if (scenario === "checking") return new Promise(() => undefined);
    if (scenario === "failed") {
        return { success: false, code: "invalid_credentials" };
    }
    if (scenario === "unavailable") {
        return { success: false, code: "verification_unavailable" };
    }
    if (scenario === "mixed") {
        if (serviceId === "kick") {
            return { success: false, code: "invalid_credentials" };
        }
        if (serviceId === "twitch") {
            return { success: false, code: "verification_unavailable" };
        }
    }
    return { success: true };
}

function connectFailure() {
    if (connectMode === "invalid") {
        return { success: false, code: "invalid_credentials" };
    }
    if (connectMode === "unavailable") {
        return { success: false, code: "verification_unavailable" };
    }
    if (connectMode === "persistence") {
        return { success: false, code: "persistence_failed" };
    }
    return null;
}

const api = {
    invoke: async (channel: string, payload?: unknown) => {
        calls.push({ channel, payload });
        if (channel === "config:get") return clone(config);
        if (channel === "config:save") {
            const patch =
                payload && typeof payload === "object"
                    ? (payload as Record<string, unknown>)
                    : {};
            config = { ...config, ...patch };
            return { ok: true, config: clone(config) };
        }
        if (channel === "commands:getAll") return clone(commands);
        if (channel === "log:getAll") return logsScenario === "populated" ? clone(sampleLogs) : [];
        if (channel === "home:getSession") {
            if (homeScenario === "loading") return new Promise(() => undefined);
            if (homeScenario === "error") return null;
            if (homeScenario === "empty") return clone(homeEmpty);
            return clone(homeFixture);
        }
        if (channel === "commands:getPerformanceStats") return [];
        if (channel === "config:updateTranslatedDefaults") return { success: true };
        const hasSecretsMatch = channel.match(
            /^(spotify|kick|twitch):hasSecrets$/
        );
        if (hasSecretsMatch) {
            return storedSecrets[
                hasSecretsMatch[1] as (typeof serviceIds)[number]
            ];
        }
        const verifyMatch = channel.match(
            /^(spotify|kick|twitch):verifySecrets$/
        );
        if (verifyMatch) {
            return verificationResult(
                verifyMatch[1] as (typeof serviceIds)[number]
            );
        }
        const setSecretsMatch = channel.match(
            /^(spotify|kick|twitch):setSecrets$/
        );
        if (setSecretsMatch) {
            return connectFailure() ?? { success: true };
        }
        if (channel === "spotify:checkAuth") {
            return { authenticated: false, hasSession: false };
        }
        if (channel === "kick:checkAuth" || channel === "twitch:checkAuth") {
            return { authenticated: false };
        }
        if (
            channel === "kick:isListeningToChat" ||
            channel === "twitch:isListeningToChat" ||
            channel === "spotify:hasSession"
        ) {
            return false;
        }
        return null;
    },
    send: (channel: string, payload?: unknown) => {
        calls.push({ channel, payload });
        if (channel === "config:set" && payload && typeof payload === "object") {
            config = { ...config, ...(payload as Record<string, unknown>) };
        }
        if (channel === "commands:setEnabled" && payload && typeof payload === "object") {
            const data = payload as { name?: string; enabled?: boolean };
            commands = commands.map((command) => command.name === data.name ? { ...command, enabled: data.enabled } : command);
        }
    },
    on: (channel: string, handler: (...args: unknown[]) => void) => {
        (listeners[channel] ||= []).push(handler);
    },
    removeListener: (channel: string, handler: (...args: unknown[]) => void) => {
        listeners[channel] = (listeners[channel] || []).filter((item) => item !== handler);
    },
    getAppVersion: async () => "1.0.7",
    checkForUpdates: () => { calls.push({ channel: "update:check" }); },
    getStartupStatus: async () => false,
    setStartupStatus: (enabled: boolean) => { calls.push({ channel: "startup:setStatus", payload: enabled }); },
    getAutoUpdate: async () => true,
    setAutoUpdate: (enabled: boolean) => { calls.push({ channel: "update:setAuto", payload: enabled }); },
    openUITestWindow: (): void => undefined,
};
if (typeof window !== "undefined") {
    (window as unknown as { electronAPI: unknown }).electronAPI = api;
    (window as unknown as { __settingsPreview: unknown }).__settingsPreview = {
        calls,
        scenario,
        connectMode,
        getConfig: () => clone(config),
        getCommands: () => clone(commands),
        emitUpdate: (status: string, data?: unknown) => {
            for (const handler of listeners["update:status"] || []) handler(status, data);
        },
    };
}
export {};
