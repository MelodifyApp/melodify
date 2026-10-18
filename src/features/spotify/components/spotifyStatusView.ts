export function isSpotifyAppAvailable(
    spotifyRunning: boolean | null,
    spotifyHasSession: boolean | null
): boolean {
    return spotifyRunning === true || spotifyHasSession === true;
}
