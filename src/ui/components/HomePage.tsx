// HomePage.tsx
// Main home page component displaying Kick and Spotify authentication cards.

import { useState, useEffect } from "react";
import KickCard from "@/features/kick/components/KickCard";
import SpotifyCard from "@/features/spotify/components/SpotifyCard";
import {
    Headphones,
    LoaderCircleIcon,
    RotateCcwIcon,
    Clock,
} from "lucide-react";
import { useUpdateStatus } from "@/ui/hooks/useUpdateStatus";
import { useTranslation } from "react-i18next";
import TwitchCard from "@/features/twitch/components/TwitchCard";

/**
 * HomePage component displays the main interface with authentication cards.
 * Shows Kick and Spotify integration cards for user authentication.
 */
export default function HomePage() {
    const { t } = useTranslation();
    const [songRequestCount, setSongRequestCount] = useState(0);
    const [lastRequestTime, setLastRequestTime] = useState<Date | null>(null);
    const [lastRequestedSong, setLastRequestedSong] = useState<{
        title: string;
        artist: string;
    } | null>(null);
    const [timeAgo, setTimeAgo] = useState<string>("");
    const { status, progress } = useUpdateStatus();
    const [version, setVersion] = useState<string>("");

    // Function to format time ago
    const formatTimeAgo = (date: Date) => {
        const now = new Date();
        const diffInMs = now.getTime() - date.getTime();
        const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
        const diffInHours = Math.floor(diffInMinutes / 60);
        const diffInDays = Math.floor(diffInHours / 24);

        if (diffInDays > 0) {
            return `${diffInDays}d`;
        } else if (diffInHours > 0) {
            return `${diffInHours}h`;
        } else if (diffInMinutes > 0) {
            return `${diffInMinutes}m`;
        } else {
            return "now";
        }
    };

    useEffect(() => {
        // Update time ago every minute
        const interval = setInterval(() => {
            if (lastRequestTime) {
                setTimeAgo(formatTimeAgo(lastRequestTime));
            }
        }, 60000); // Update every minute

        return () => clearInterval(interval);
    }, [lastRequestTime]);

    useEffect(() => {
        // Fetch the app version from the main process
        window.electronAPI.getAppVersion?.().then(setVersion);

        // Listen for song request events to update the count
        window.electronAPI.on(
            "songRequest:completed",
            (data: { title?: string; artist?: string } = {}) => {
                setSongRequestCount((prev) => prev + 1);
                const now = new Date();
                setLastRequestTime(now);
                setTimeAgo(formatTimeAgo(now));
                if (data.title && data.artist) {
                    setLastRequestedSong({
                        title: data.title,
                        artist: data.artist,
                    });
                }
            }
        );

        // Get initial song request count if available
        window.electronAPI
            .invoke("songRequest:getCount")
            .then(
                (data: {
                    count: number;
                    lastRequestTime: string | null;
                    lastSong?: { title: string; artist: string };
                }) => {
                    setSongRequestCount(data.count || 0);
                    if (data.lastRequestTime) {
                        const lastTime = new Date(data.lastRequestTime);
                        setLastRequestTime(lastTime);
                        setTimeAgo(formatTimeAgo(lastTime));
                    }
                    if (data.lastSong) {
                        setLastRequestedSong(data.lastSong);
                    }
                }
            )
            .catch(() => {
                // If not implemented yet, start from 0
                setSongRequestCount(0);
                setLastRequestTime(null);
                setLastRequestedSong(null);
            });

        // Cleanup event listeners
        return () => {
            window.electronAPI.removeAllListeners("songRequest:completed");
        };
    }, []);

    // Determine update status text and icon
    let updateStatus = "";
    let updateIcon = null;

    if (status === "checking") {
        updateStatus = t("home.checkingUpdates");
        updateIcon = (
            <LoaderCircleIcon className="w-4 h-4 text-blue-400 animate-spin" />
        );
    } else if (status === "downloading") {
        updateStatus = t("home.downloadingUpdate", {
            percent: progress?.percent ? Math.round(progress.percent) : 0,
        });
        updateIcon = (
            <LoaderCircleIcon className="w-4 h-4 text-blue-400 animate-spin" />
        );
    } else if (status === "downloaded") {
        updateStatus = t("home.updateReady");
        updateIcon = <RotateCcwIcon className="w-4 h-4 text-green-400" />;
    } else if (status === "error") {
        updateStatus = t("home.updateError");
        updateIcon = <RotateCcwIcon className="w-4 h-4 text-red-400" />;
    } else {
        updateStatus = t("home.upToDate");
    }

    return (
        <div className="flex-1 flex flex-col bg-zinc-900 overflow-hidden">
            <div className="px-6 py-3 border-b border-zinc-700/60">
                <div className="bg-zinc-800/50 rounded-md p-3 border border-zinc-700/60 border-l-2 border-l-melodify-primary">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-melodify-primary/10 rounded-md flex items-center justify-center">
                                <Headphones className="w-4 h-4 text-melodify-primary" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-white">
                                    {t("home.songRequests")}
                                </h3>
                                <p className="text-xs text-zinc-400">
                                    {t("home.totalToday")}
                                </p>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-2xl font-semibold text-melodify-primary">
                                {songRequestCount}
                            </div>
                        </div>
                    </div>

                    {lastRequestedSong && songRequestCount > 0 && (
                        <div className="mt-2 pt-2 border-t border-zinc-700/60">
                            <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-white font-medium truncate">
                                        {lastRequestedSong.title}
                                    </p>
                                    <p className="text-xs text-zinc-400 truncate">
                                        {t("home.byArtist", {
                                            artist: lastRequestedSong.artist,
                                        })}
                                    </p>
                                </div>
                                {lastRequestTime && (
                                    <div className="flex items-center gap-1 text-zinc-400 ml-2">
                                        <Clock className="w-3 h-3" />
                                        <span className="text-xs">
                                            {timeAgo}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 p-6">
                <div className="h-full flex gap-5">
                    <div className="flex-1 grid grid-cols-3 gap-5">
                        <div className="bg-zinc-800/40 rounded-lg border border-zinc-700/70 overflow-hidden">
                            <SpotifyCard />
                        </div>
                        <div className="bg-zinc-800/40 rounded-lg border border-zinc-700/70 overflow-hidden">
                            <KickCard />
                        </div>
                        <div className="bg-zinc-800/40 rounded-lg border border-zinc-700/70 overflow-hidden">
                            <TwitchCard />
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-6 py-3 border-t border-zinc-700/60">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                    <div className="flex items-center gap-2">
                        <span>v{version}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {updateIcon}
                        <span>{updateStatus}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
