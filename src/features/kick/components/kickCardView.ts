/**
 * Pure connection/auth state derivation for the Kick card.
 *
 * The anonymous guest reader is independent of the OAuth session, so an OAuth
 * failure (rejected refresh, Kick API error) must not make the card look
 * logged out and disconnected while reading continues. The disconnect control
 * stays available whenever the reader is running so it can always be stopped
 * explicitly.
 */

export interface KickCardConnectionState {
    hasSecrets: boolean | null;
    authenticated: boolean;
    listeningToChat: boolean;
}

export type KickConnectionBadge =
    | "listening"
    | "chat-unavailable"
    | "ready"
    | "setup";

export interface KickCardView {
    badge: KickConnectionBadge;
    /** True while either the OAuth session or the guest reader is active. */
    showDisconnect: boolean;
    showLogin: boolean;
    showConfigure: boolean;
}

export function getKickCardView(state: KickCardConnectionState): KickCardView {
    const listening = state.listeningToChat === true;
    const authenticated = state.authenticated === true;
    const showDisconnect = listening || authenticated;
    const showConfigure = !showDisconnect && state.hasSecrets === false;
    return {
        badge: listening
            ? "listening"
            : authenticated
              ? "chat-unavailable"
              : state.hasSecrets === true
                ? "ready"
                : "setup",
        showConfigure,
        showDisconnect,
        showLogin: !showConfigure && !showDisconnect,
    };
}
