export type PlaySongFailureReason =
    | "not-found"
    | "unplayable"
    | "queue-rejected"
    | "auth-error"
    | "provider-error"
    | "cancelled";

export type SongRequestFailureReason =
    | PlaySongFailureReason
    | "permission"
    | "cooldown"
    | "empty-query"
    | "unknown";

export type SongRequestSource = "command" | "reward";

export interface SongInfo {
    title: string;
    artist: string;
}

export type PlaySongOutcome =
    | { status: "success"; song: SongInfo }
    | { status: "failure"; reason: PlaySongFailureReason; error: string };

export type SongRequestOutcome =
    | {
          status: "success";
          source: SongRequestSource;
          title: string;
          artist: string;
          message: string;
          manualReconciliationRequired: false;
          platform: "kick" | "twitch";
          requestedBy: string;
      }
    | {
          status: "rejected";
          source: SongRequestSource;
          reason: SongRequestFailureReason;
          message: string;
          manualReconciliationRequired: boolean;
          platform: "kick" | "twitch";
          requestedBy: string;
      };

const FAILURE_MESSAGES: Record<SongRequestFailureReason, string> = {
    "not-found": "No matching track found.",
    unplayable: "Track is unavailable.",
    "queue-rejected": "Spotify rejected the queue request.",
    "auth-error": "Spotify authentication is unavailable.",
    "provider-error": "Spotify is temporarily unavailable.",
    cancelled: "Spotify request was cancelled.",
    permission: "Permission to request songs is unavailable.",
    cooldown: "Please wait before requesting another song.",
    "empty-query": "Please provide a song name or Spotify URL.",
    unknown: "Request failed for an unknown reason.",
};

/** Stable user-facing text; never include provider response bodies. */
export function songRequestErrorMessage(
    reason: SongRequestFailureReason
): string {
    return FAILURE_MESSAGES[reason];
}
