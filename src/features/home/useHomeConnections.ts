import { useCallback, useEffect, useRef, useState } from "react";
import {
    applyPresenceReads,
    deriveHomeConnections,
    emptyHomeConnectionFlags,
    loadHomeConnections,
    readHomePresence,
    type HomeConnectionsBridge,
    type HomeConnectionFlags,
} from "./homeConnections";

const PRESENCE_INTERVAL_MS = 10_000;

/**
 * Home rail status from the same real provider checks the cards use. Auth is
 * refreshed on mount/dialog close; the interval checks presence on every tick,
 * so a session that becomes inactive or unreachable stops looking ready.
 */
export function useHomeConnections(bridge?: HomeConnectionsBridge) {
    const [flags, setFlags] = useState<HomeConnectionFlags>(
        emptyHomeConnectionFlags
    );
    const alive = useRef(true);
    const flagsRef = useRef(flags);

    useEffect(() => {
        flagsRef.current = flags;
    }, [flags]);

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

    useEffect(() => {
        if (!bridge) return;
        void refreshAll();
        const interval = setInterval(() => {
            void refreshPresence();
        }, PRESENCE_INTERVAL_MS);

        const refreshOnChange = () => {
            void refreshAll();
        };
        const channels = [
            "spotify:authenticated",
            "kick:authenticated",
            "kick:chatConnected",
            "kick:chatDisconnected",
            "kick:authenticationFailed",
            "twitch:authenticated",
            "twitch:chatConnected",
            "twitch:chatDisconnected",
            "twitch:authenticationFailed",
        ];
        for (const channel of channels) {
            bridge.on?.(channel, refreshOnChange);
        }

        return () => {
            clearInterval(interval);
            for (const channel of channels) {
                bridge.removeListener?.(channel, refreshOnChange);
            }
        };
    }, [bridge, refreshAll, refreshPresence]);

    return {
        views: deriveHomeConnections(flags),
        refreshAll,
    };
}
