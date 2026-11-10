import type { HomePlatform, HomeSessionSnapshot } from "./homeSessionTypes";

/**
 * Development-only visual fixture for Home review. It is compiled into the
 * development bundle but never enabled unless the isolated launch sets
 * MELODIFY_HOME_FIXTURE=1. It must not be used in a packaged build.
 */
export function homeFixtureEnabled(): boolean {
    return (
        process.env.NODE_ENV === "development" &&
        process.env.MELODIFY_HOME_FIXTURE === "1"
    );
}

interface FixtureQueueEntry {
    title: string;
    artist: string;
    requester: string;
    platform: HomePlatform;
}

function cover(label: string, from: string, to: string): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="96" height="96" rx="10" fill="url(#g)"/><circle cx="76" cy="20" r="22" fill="#fff" opacity=".12"/><text x="48" y="60" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#fff">${label}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function createHomeFixtureSnapshot(): HomeSessionSnapshot {
    const now = Date.now();
    const entries: FixtureQueueEntry[] = [
        { title: "Dreams", artist: "Fleetwood Mac", requester: "viewer_one", platform: "kick" },
        { title: "Blinding Lights", artist: "The Weeknd", requester: "nightowl", platform: "twitch" },
        { title: "Sunflower", artist: "Post Malone, Swae Lee", requester: "songfan", platform: "kick" },
        { title: "Levitating", artist: "Dua Lipa", requester: "starviewer", platform: "kick" },
        { title: "As It Was", artist: "Harry Styles", requester: "pixelfox", platform: "twitch" },
        { title: "Heat Waves", artist: "Glass Animals", requester: "moonlit", platform: "kick" },
        { title: "Save Your Tears", artist: "The Weeknd", requester: "aurora", platform: "twitch" },
        { title: "Stay", artist: "The Kid LAROI, Justin Bieber", requester: "chatcat", platform: "kick" },
        { title: "Good 4 U", artist: "Olivia Rodrigo", requester: "nightowl", platform: "twitch" },
        { title: "Peaches", artist: "Justin Bieber", requester: "songfan", platform: "kick" },
        { title: "Montero", artist: "Lil Nas X", requester: "viewer_one", platform: "twitch" },
        { title: "Kiss Me More", artist: "Doja Cat, SZA", requester: "starviewer", platform: "kick" },
        { title: "Electric Feel", artist: "MGMT", requester: "pixelfox", platform: "twitch" },
        { title: "Take On Me", artist: "a-ha", requester: "moonlit", platform: "kick" },
        { title: "Mr. Brightside", artist: "The Killers", requester: "aurora", platform: "twitch" },
        { title: "Somebody That I Used to Know", artist: "Gotye", requester: "chatcat", platform: "kick" },
        { title: "Feel It Still", artist: "Portugal. The Man", requester: "songfan", platform: "twitch" },
    ];

    return {
        revision: 1,
        current: {
            status: "playing",
            title: "Midnight City",
            artist: "M83",
            artworkUrl: cover("MC", "#563d7c", "#1f6f5c"),
            error: null,
        },
        queue: entries.map((entry, index) => ({
            ...entry,
            id: `fixture-queue-${index + 1}`,
            acceptedAt: now - (entries.length - index) * 45_000,
            position: index + 1,
            artworkUrl: cover(
                entry.title.slice(0, 1).toUpperCase(),
                index % 2 === 0 ? "#1f6f5c" : "#563d7c",
                index % 3 === 0 ? "#c084fc" : "#34d399"
            ),
        })),
        queueScope: "session",
    };
}
