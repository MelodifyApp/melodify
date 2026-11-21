# Quelody

Quelody is a Windows desktop app for streamers. It connects Spotify with Kick and Twitch so viewers can request songs through chat commands or channel-point rewards. Requests are added to the active Spotify playback queue; Quelody runs locally and does not require a Quelody account or cloud service.

**Current release:** Quelody 1.1.1 — [download](https://github.com/MelodifyApp/melodify/releases/tag/v1.1.1)

**Legacy:** Melodify 1.0.7. Windows installs of Melodify do not upgrade in place; install Quelody separately.

**Status:** free, local-only, unsigned Windows build. Live provider QA is still outstanding.

**Website:** `quelody.app` (planned).

**Branding:** Quelody is the public display and installer name. `package.json` uses the internal name `quelody`, the app id is `com.emirhanpisgin.quelody`, and the local profile is `%APPDATA%\quelody`. Existing `%APPDATA%\melodify` config and queue history are copied once on first launch.

## Features

- **Kick and Twitch chat requests** — viewers type `!sr <song name or Spotify URL>`.
- **Reward redemptions** — a configured Kick or Twitch reward title works as a request.
- **Spotify queue insertion** — searches Spotify (or resolves a track URL/URI) and adds the track to the active Spotify queue. A request counts as successful only after Spotify accepts it.
- **Configurable request rules** — permissions/badges, global and per-user cooldowns, reply templates, prefix, and optional current-song text file output.
- **Commands** — built-in `!sr` and moderator-only `!volume`, with editable aliases and moderators.
- **Local data** — credentials, settings, request logs and counters stay on the local machine. There is no Quelody API, account system, cloud sync, web dashboard or persistent server-side queue.
- **English and Turkish** UI.
- **GitHub Releases updater** — checks for stable updates; Quelody does not install one silently.

## Requirements

- Windows 10/11
- [Node.js](https://nodejs.org/) 22+ and npm (development only)
- Spotify Premium and an active Spotify playback device for queue additions
- Your own Spotify, Kick and (optional) Twitch developer-app credentials

Quelody does not ship shared API credentials. Create your own Spotify/Kick/Twitch applications and enter the Client ID/Secret values in **Settings → API Keys**. Secrets are stored locally in the Electron user-data `config.json`; treat that file as sensitive.

### Unsigned builds and Smart App Control

The 1.1.0 installer is unsigned. SmartScreen may show “Unknown publisher”; verify the SHA-256 checksums published with the release. On clean Windows 11 installs, Smart App Control can block unsigned apps that Windows cannot vouch for; checksums verify the download but do not bypass SAC. A signed build is the reliable fix.

## Getting started (development)

```sh
git clone https://github.com/MelodifyApp/melodify.git
cd melodify
npm ci
npm start
```

`npm start` launches Electron Forge in development mode.

### Build

```sh
npm run package   # unpacked app
npm run make      # platform installer/artifacts
```

### Verification

```sh
npx tsc --noEmit
npm run lint
npm run validate-translations
npm run test:config        # plus the other focused test:* scripts
```

The focused suites are defined under `scripts` in `package.json`: `test:kick`, `test:spotify`, `test:config`, `test:ui-states`, `test:twitch`, `test:permissions`, `test:logging`, `test:i18n`, `test:security`, `test:routing`, `test:release`. There is no aggregate `npm test` script and no `npm run build` script.

Release preparation and the local Windows Sandbox smoke-test boundary are documented in [docs/RELEASE-CHECKLIST.md](docs/RELEASE-CHECKLIST.md).

## How it works

1. Connect Spotify, Kick, and optionally Twitch in Settings.
2. Start the stream and open chat.
3. A viewer types `!sr <song>` or redeems the configured reward.
4. Quelody searches Spotify and adds the track to the active Spotify queue.
5. If enabled, Quelody posts a configurable reply in chat and records the accepted request locally.

A request is not a promise of playback order: Spotify controls the playback queue, and Quelody does not implement reordering, removal or Undo.

## Project structure

- `src/main/` — Electron main process, preload bridge, IPC, OAuth callback servers, updater
- `src/renderer/` — React renderer entry
- `src/core/` — config, commands, i18n, logging, IPC handlers
- `src/features/` — Spotify, Kick, Twitch and Settings features
- `src/ui/` — shared React UI components
- `src/shared/` — shared types and constants
- `src/assets/` — icons and static assets
- `test/` — focused `node:test` suites
- `scripts/` — translation validation and maintenance scripts

## Free and local

Quelody is free for private use and is provided **as-is, without
warranty**. The developer collects no data, runs no server and receives no
telemetry. Everything stays on the user's PC.

Each user supplies their own Spotify, Kick and Twitch developer credentials and
is responsible for following those platforms' terms. Quelody is **not
affiliated with or endorsed by Spotify, Kick or Twitch**; platform names are
used descriptively as plain text, and no platform logos are shipped.

## Privacy

Quelody is local-first: no account, no telemetry and no developer-operated
server. It stores its profile under `%APPDATA%\quelody` and keeps 30 days of
local logs. Credentials are encrypted with Windows DPAPI; this protects the
profile from other Windows accounts, not from malware or another process running
as the same Windows user.

- English notice: [docs/PRIVACY.md](docs/PRIVACY.md)
- KVKK aydınlatma metni: [docs/PRIVACY.tr.md](docs/PRIVACY.tr.md)
- Internal KVKK assessment: [docs/KVKK.md](docs/KVKK.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Report vulnerabilities privately using [SECURITY.md](SECURITY.md); do not open a public issue.

## License

[MIT](LICENSE)

Quelody is not affiliated with Kick, Twitch or Spotify. Use at your own risk.
