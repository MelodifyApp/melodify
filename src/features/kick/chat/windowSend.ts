// Back-compat entry point: the guard is shared by all destabilized-window
// notification paths (Kick, Twitch, Spotify, logging).
export { sendToWindowIfAlive } from "../../../shared/utils/windowSend";
