/**
 * Authoritative IPC channel allowlists for the preload bridge.
 *
 * The preload script used to forward any channel name a renderer passed to
 * `send`/`invoke`/`on`, which turned every main-process handler into a
 * reachable endpoint for a compromised renderer. These lists mirror the actual
 * `ipcMain.on` (send), `ipcMain.handle` (invoke) registrations and the events
 * the main process emits (listen). Keep them in sync with the registrations —
 * `test/preload-channel-boundary.test.cjs` fails if a registration is missing.
 */

/** Renderer -> main, fire-and-forget (`ipcMain.on`). */
export const SEND_CHANNELS: readonly string[] = Object.freeze([
    // Window / app control
    "window:minimize",
    "window:close",
    "window:test",
    "tray:test-create",
    "app:restart",
    // Updates
    "update:check",
    "update:download",
    "update:install",
    "update:setAuto",
    // Startup / config / external links
    "startup:setStatus",
    "config:set",
    "open-external",
    // Renderer logging
    "log:info",
    "log:warn",
    "log:error",
    "log:debug",
    // Commands
    "commands:setEnabled",
    "commands:updateAliases",
    "commands:resetPerformanceStats",
    "commands:resetCommandPerformanceStats",
    // Platform auth / chat
    "spotify:auth",
    "spotify:logout",
    "kick:auth",
    "kick:authComplete",
    "kick:sendMessage",
    "kick:logout",
    "kick:setSecrets",
    "kick:stopListening",
    "twitch:auth",
    "twitch:authComplete",
    "twitch:sendMessage",
    "twitch:logout",
    "twitch:setSecrets",
    "twitch:stopListening",
]);

/** Renderer -> main, request/response (`ipcMain.handle`). */
export const INVOKE_CHANNELS: readonly string[] = Object.freeze([
    // Window / app
    "open-ui-test-window",
    "app:getVersion",
    // Config / startup / updates
    "config:get",
    "config:updateTranslatedDefaults",
    "startup:getStatus",
    "update:getAuto",
    // Commands
    "commands:getAll",
    "commands:getPerformanceStats",
    "commands:getCommandPerformanceStats",
    // Files / logs / song requests
    "file:selectSongFilePath",
    "log:getAll",
    "songRequest:getCount",
    // Spotify
    "spotify:getUserData",
    "spotify:checkAuth",
    "spotify:isRunning",
    "spotify:hasSecrets",
    "spotify:setSecrets",
    "spotify:hasSession",
    // Kick
    "kick:getUserData",
    "kick:findChatroom",
    "kick:checkAuth",
    "kick:retryChat",
    "kick:hasSecrets",
    "kick:isListeningToChat",
    // Twitch
    "twitch:getUserData",
    "twitch:checkAuth",
    "twitch:hasSecrets",
    "twitch:isListeningToChat",
]);

/** Main -> renderer events the renderer may subscribe to. */
export const LISTEN_CHANNELS: readonly string[] = Object.freeze([
    // App-level UI intents
    "open-settings",
    "show-update-dialog",
    "toast",
    // Updates / logs / song requests
    "update:status",
    "log:entry",
    "songRequest:completed",
    "tray:debug",
    // Spotify
    "spotify:authenticated",
    // Kick
    "kick:authenticated",
    "kick:chatConnected",
    "kick:chatDisconnected",
    "kick:authenticationFailed",
    // Twitch
    "twitch:authenticated",
    "twitch:chatConnected",
    "twitch:chatDisconnected",
    "twitch:authenticationFailed",
    "twitch:sendMessageError",
]);
