# Local data lifecycle

Melodify Live is local-only. There is **no telemetry, analytics, crash upload,
account or Melodify server**. Data leaves the machine only through provider
APIs, the GitHub update check, artwork CDNs, or an export the user explicitly
chooses.

See [IRREVERSIBLE.md](IRREVERSIBLE.md) for actions that need owner approval.

## What is stored

| Location (under `%APPDATA%\melodify`) | Contents | Retention | Sensitivity |
| --- | --- | --- | --- |
| `config.json` | Settings and credentials (`enc:v1:` via DPAPI) | Until reset | High: encrypted credentials |
| `config.corrupt-*.json` | Quarantined unreadable config copies | Kept until the user deletes them | High: may contain credentials |
| `queue-history.json.corrupt-*`, `*.tmp-*` | Corrupt history copies and transient atomic-write files | Corrupt copies kept until deleted; temp files removed on failure | Medium/Low |
| `queue-history.json` | Queue sessions: start/end, providers, track title/artist, requester display name, platform, timestamps, outcome | 90 days or 50 sessions; active session kept | Medium: viewer display names and music choices |
| `song-requests/*.json` | Per-session and daily request records | 30 days, cleaned on startup | Medium: requester and request data |
| `logs/*.log` | Session logs; secrets redacted | 30 days, cleaned on startup | Medium: may contain requester/command text |
| `current-song.txt` | Current track title | Overwritten | Low |
| Chromium profile (`Cache`, `Local Storage`, cookies) | Renderer/session state and OAuth-related browser state | Managed by Electron; removed with the profile | Medium |

Queue history deliberately does **not** store artwork URLs, chat message
bodies, provider user IDs, IP addresses or tokens. Requester names are stored
only because the history is meant to be readable by the streamer.

## Retention

- Logs and song-request files: **30 days**, pruned on application startup.
  Pruning runs only at startup; an app left running for weeks does not prune
  until the next launch.
- Queue history: **90 days or 50 sessions**, whichever comes first; the active
  session is never pruned automatically. Clearing history does not delete
  quarantined `config.corrupt-*` or history `.corrupt-*` copies.
- The active session’s pending entries are reused to restore the queue after a
  crash or a recent relaunch while the stream is still live. No extra fields
  are stored for this.
- Credentials: until the user resets or clears them. No plaintext credential
  backup is kept; 1.0.7 recovery is unsupported, so lost credentials are
  re-entered in Settings → API Keys.

## User controls

- **Queue history → Export** writes a JSON file to a location the user chooses.
  No secrets, no upload.
- **Queue history → Clear history** removes past sessions and keeps the current
  live session. The user is asked to confirm; export first if the data is
  wanted.
- **Full deletion:** quit Melodify and delete `%APPDATA%\melodify`. Uninstalling
  the app does **not** currently remove this folder.
- **Credentials:** reset or replace them in Settings → API Keys.

## Encryption scope

Windows DPAPI protects the profile from other Windows accounts. It does not
protect against malware, a debugger, or another process running as the same
Windows user.

## Outbound network

- Spotify, Kick and Twitch APIs for auth, playback and chat.
- GitHub Releases for update checks.
- Spotify/Kick/Twitch artwork CDNs when artwork is displayed.
- No request goes to a Melodify-operated server. There is no Melodify API,
  dashboard or telemetry endpoint.

## Support bundles

Exports are user-initiated. Redact requester names, tokens, client secrets,
OAuth codes and chat contents before sharing. The app does not upload logs or
history automatically.
