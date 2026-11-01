import { useEffect, useState } from "react";
import type { HomeConnectionsBridge } from "./homeConnections";
import {
    normalizeHomeSessionSnapshot,
    type HomeSessionSnapshot,
} from "./homeSessionTypes";

export function subscribeHomeSessionUpdates(
    bridge: HomeConnectionsBridge,
    listener: (snapshot: HomeSessionSnapshot) => void
): () => void {
    const onUpdate = (payload: unknown) => {
        const snapshot = normalizeHomeSessionSnapshot(payload);
        if (snapshot) listener(snapshot);
    };
    bridge.on?.("home:sessionUpdated", onUpdate);
    return () => {
        bridge.removeListener?.("home:sessionUpdated", onUpdate);
    };
}

export async function loadHomeSession(
    bridge: HomeConnectionsBridge
): Promise<HomeSessionSnapshot | null> {
    const payload = await bridge.invoke("home:getSession");
    return normalizeHomeSessionSnapshot(payload);
}

export function useHomeSession(bridge?: HomeConnectionsBridge) {
    const [session, setSession] = useState<HomeSessionSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!bridge) {
            setLoading(false);
            return;
        }
        let alive = true;
        const apply = (next: HomeSessionSnapshot) => {
            if (!alive) return;
            setSession((current) =>
                current && current.revision > next.revision ? current : next
            );
            setError(false);
            setLoading(false);
        };
        const unsubscribe = subscribeHomeSessionUpdates(bridge, apply);
        loadHomeSession(bridge)
            .then((snapshot) => {
                if (!alive) return;
                if (snapshot) apply(snapshot);
                else {
                    setError(true);
                    setLoading(false);
                }
            })
            .catch(() => {
                if (!alive) return;
                setError(true);
                setLoading(false);
            });
        return () => {
            alive = false;
            unsubscribe();
        };
    }, [bridge]);

    return { session, loading, error };
}
