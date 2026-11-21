import { useCallback, useEffect, useRef, useState } from "react";
import {
    applyPresenceReads,
    deriveHomeConnections,
    emptyHomeConnectionFlags,
    emptySpotifyAuthState,
    loadHomeConnections,
    readHomePresence,
    readSpotifyAuthState,
    type HomeConnectionsBridge,
    type HomeConnectionFlags,
    type SpotifyAuthViewState,
} from "./homeConnections";

const PRESENCE_INTERVAL_MS = 10_000;

/**
 * Main-process events that can change the credential/auth flags. Saved
 * credentials are included because Settings writes them while Home is hidden.
 */
export const HOME_CONNECTION_REFRESH_CHANNELS = Object.freeze([
    "spotify:authenticated",
    "kick:authenticated",
    "kick:chatConnected",
    "kick:chatDisconnected",
    "kick:authenticationFailed",
    "twitch:authenticated",
    "twitch:chatConnected",
    "twitch:chatDisconnected",
    "twitch:authenticationFailed",
    // Settings saves credentials in the main process; without this event
    // Home keeps the pre-save "needs setup" state until restart.
    "credentials:updated",
] as const);

/**
 * Home rail status from the same real provider checks the cards use. Auth is
 * refreshed on mount/dialog close; the interval checks presence on every tick,
 * so a session that becomes inactive or unreachable stops looking ready.
 */
export function useHomeConnections(bridge?: HomeConnectionsBridge) {
    const [flags, setFlags] = useState<HomeConnectionFlags>(
        emptyHomeConnectionFlags
    );
    const [spotifyAuth, setSpotifyAuth] = useState<SpotifyAuthViewState>(
        emptySpotifyAuthState
    );
    const alive = useRef(true);
    const flagsRef = useRef(flags);
    const spotifyAuthRef = useRef(spotifyAuth);

    useEffect(() => {
        flagsRef.current = flags;
    }, [flags]);

    useEffect(() => {
        spotifyAuthRef.current = spotifyAuth;
    }, [spotifyAuth]);

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
        };
    }, []);

    const refreshAll = useCallback(async () => {
        if (!bridge) return;
        const next = await loadHomeConnections(bridge);
        if (alive.current) setFlags(next);
    }, [bridge]);

    const refreshPresence = useCallback(async () => {
        if (!bridge) return;
        const reads = await readHomePresence(bridge, flagsRef.current);
        if (!alive.current) return;
        setFlags((current) => applyPresenceReads(current, reads));
    }, [bridge]);

    const beginSpotifyAuth = useCallback(() => {
        if (!bridge?.send) return;
        if (
            spotifyAuthRef.current.state === "starting" ||
            spotifyAuthRef.current.state === "pending"
        ) {
            return;
        }
        const starting: SpotifyAuthViewState = {
            state: "starting",
            reason: null,
            canRetry: false,
        };
        spotifyAuthRef.current = starting;
        setSpotifyAuth(starting);
        bridge.send("spotify:auth");
    }, [bridge]);

    useEffect(() => {
        if (!bridge) return;
        void refreshAll();
        const interval = setInterval(() => {
            void refreshPresence();
        }, PRESENCE_INTERVAL_MS);

        const refreshOnChange = () => {
            void refreshAll();
        };
        const onSpotifyAuthState = (payload: unknown) => {
            const next = readSpotifyAuthState(payload);
            spotifyAuthRef.current = next;
            setSpotifyAuth(next);
            if (
                next.state === "success" ||
                next.state === "failed" ||
                next.state === "bind-error" ||
                next.state === "timeout"
            ) {
                void refreshAll();
            }
        };
        bridge.on?.("spotify:authState", onSpotifyAuthState);
        for (const channel of HOME_CONNECTION_REFRESH_CHANNELS) {
            bridge.on?.(channel, refreshOnChange);
        }

        return () => {
            clearInterval(interval);
            bridge.removeListener?.("spotify:authState", onSpotifyAuthState);
            for (const channel of HOME_CONNECTION_REFRESH_CHANNELS) {
                bridge.removeListener?.(channel, refreshOnChange);
            }
        };
    }, [bridge, refreshAll, refreshPresence]);

    return {
        views: deriveHomeConnections(flags, spotifyAuth),
        refreshAll,
        beginSpotifyAuth,
    };
}
