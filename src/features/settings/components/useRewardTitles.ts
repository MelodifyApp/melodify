import { useCallback, useEffect, useRef, useState } from "react";
import {
    toRewardPickerState,
    type RewardPickerState,
    type RewardPlatform,
} from "../rewardPicker";

const CHANNELS: Record<RewardPlatform, string> = {
    kick: "kick:listRewardTitles",
    twitch: "twitch:listRewardTitles",
};

const LOADING: RewardPickerState = {
    status: "loading",
    rewards: [],
    titles: [],
};

/**
 * Reads one platform's reward titles through the main process. The two
 * platforms are independent: a failed Kick read cannot hide Twitch options.
 */
export function useRewardTitles(platform: RewardPlatform) {
    const [state, setState] = useState<RewardPickerState>(LOADING);
    const requestId = useRef(0);

    const reload = useCallback(async () => {
        const id = ++requestId.current;
        setState((current) => ({
            status: "loading",
            rewards: current.rewards,
            titles: current.titles,
        }));
        try {
            const result = await window.electronAPI.invoke(CHANNELS[platform]);
            if (id === requestId.current) setState(toRewardPickerState(result));
        } catch {
            if (id === requestId.current) {
                setState({
                    status: "unavailable",
                    rewards: [],
                    titles: [],
                    reason: "provider-error",
                });
            }
        }
    }, [platform]);

    useEffect(() => {
        void reload();
        return () => {
            requestId.current += 1;
        };
    }, [reload]);

    return { ...state, reload };
}
