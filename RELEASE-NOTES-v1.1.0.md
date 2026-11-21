# Quelody 1.1.0

Quelody lets viewers request songs from Kick and Twitch chat and plays
them through Spotify. Everything stays on your machine: no accounts, no
telemetry, no cloud sync and no Quelody server.

## Highlights

- **Queue sessions follow the live stream.** A session starts when a configured
  provider is confirmed live, survives chat outages, and ends only after every
  configured provider has been offline for two minutes. The queue resets per
  stream instead of resetting whenever chat reconnects.
- **Queue history.** Past sessions are grouped by stream, with played and
  unplayed requests. History can be exported to JSON or cleared from Settings;
  clearing keeps the active live session.
- **Sessions survive a restart.** Relaunching or auto-updating while the stream
  is still live resumes the same session and its pending queue instead of
  splitting the stream.
- **Optional live-only requests.** A Settings toggle can reject song requests
  when no stream session is active.
- **Dusk look.** Refreshed titlebar, mark, installer/tray icon rim, consistent
  Home and Settings rails, and slower, calmer motion.
- **Runtime.** Electron 45.4.1 (Chromium 156, Node 24) and the Quelody updater
  1.1.0.

## Security and privacy

- Updates are authenticated by an Ed25519-signed manifest pinned to the
  Quelody publisher key. Unsigned, expired or mismatched updates are refused.
- Credentials are encrypted at rest on Windows with Electron `safeStorage`
  (DPAPI). Client Secrets and OAuth tokens use the `enc:v1:` envelope in
  `config.json`; the renderer never receives secrets.
- No telemetry, analytics, crash uploads or background Quelody calls. Network
  traffic is limited to Spotify/Kick/Twitch APIs, the GitHub update check,
  artwork CDNs and exports you start yourself.
- Queue history stores track title/artist, requester display name, platform,
  timestamps and outcome. It does **not** store artwork URLs, chat message
  bodies, provider user IDs, IP addresses or tokens.
- Logs and song-request files are pruned after 30 days. Queue history is pruned
  after 90 days or 50 sessions; the active session is never pruned.
- “Clear history” removes past sessions only. The full local profile can be
  deleted from `%APPDATA%\quelody` after quitting the app.

## Upgrade and migration

- Quelody uses the installer identity `Quelody`, the app id
  `com.emirhanpisgin.quelody`, and the profile `%APPDATA%\quelody`. Melodify
  1.0.7 cannot upgrade in place; install Quelody separately and remove the old
  Melodify install when ready.
- On first launch, existing `%APPDATA%\melodify` config and queue history are
  copied to `%APPDATA%\quelody` if the new profile does not exist. The old
  profile is left untouched.
- A 1.0.7 plaintext config is encrypted automatically on the first 1.1.0
  launch. No plaintext pre-encryption backup is kept.
- **Downgrade is unsupported.** 1.0.7 cannot read `enc:v1:` values. If
  decryption is unavailable, affected credentials are treated as missing and
  must be re-entered in Settings → API Keys.

## Fixes carried from 1.0.x

- 1.0.4 replaced the incompatible Kick chat reader with Kick's negotiated
  anonymous transport.
- 1.0.5 prevented Kick notifications from targeting windows destroyed during
  shutdown.
- 1.0.6 refreshed the cached Spotify client after credential changes.
- 1.0.7 shipped the maintenance/security work and restored the approved
  titlebar mark, Twitch credentials in Settings → API Keys, and the English
  Home back-link.

## Installation notes

- Windows 10/11, x64 only.
- This build is **unsigned**. SmartScreen may show “Unknown publisher”; verify
  the SHA-256 checksums published with the release before running it.
- On clean Windows 11 installs, **Smart App Control** can block unsigned apps
  that Windows cannot vouch for. Checksums verify the download but do not bypass
  SAC; a signed build is the reliable fix.
- Uninstalling does not delete `%APPDATA%\quelody`; delete that folder
  manually for a full reset.
- Keep a full installer available for recovery. Automatic downgrade to 1.0.7 is
  not supported.
