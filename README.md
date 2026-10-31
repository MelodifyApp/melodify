# Melodify

Melodify is a Windows desktop app for streamers. It connects Spotify with Kick and Twitch so viewers can request songs through chat commands or channel-point rewards. Requests are added to the active Spotify playback queue; Melodify runs locally and does not require a Melodify account or cloud service.

**Stable release:** 1.0.7 — [download the latest installer](https://github.com/MelodifyApp/melodify/releases/latest)

## Features

- **Kick and Twitch chat requests** — viewers type `!sr <song name or Spotify URL>`.
- **Reward redemptions** — a configured Kick or Twitch reward title works as a request.
- **Spotify queue insertion** — searches Spotify (or resolves a track URL/URI) and adds the track to the active Spotify queue. A request counts as successful only after Spotify accepts it.
- **Configurable request rules** — permissions/badges, global and per-user cooldowns, reply templates, prefix, and optional current-song text file output.
- **Commands** — built-in `!sr` and moderator-only `!volume`, with editable aliases and moderators.
- **Local data** — credentials, settings, request logs and counters stay on the local machine. There is no Melodify API, account system, cloud sync, web dashboard or persistent server-side queue.
- **English and Turkish** UI.
- **GitHub Releases updater** — checks for stable updates; Melodify does not install one silently.

## Requirements

- Windows 10/11
- [Node.js](https://nodejs.org/) 22+ and npm (development only)
- Spotify Premium and an active Spotify playback device for queue additions
- Your own Spotify, Kick and (optional) Twitch developer-app credentials

Melodify does not ship shared API credentials. Create your own Spotify/Kick/Twitch applications and enter the Client ID/Secret values in **Settings → API Keys**. Secrets are stored locally in the Electron user-data `config.json`; treat that file as sensitive.

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
4. Melodify searches Spotify and adds the track to the active Spotify queue.
5. If enabled, Melodify posts a configurable reply in chat and records the accepted request locally.

A request is not a promise of playback order: Spotify controls the playback queue, and Melodify does not implement reordering, removal or Undo.

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)

Melodify is not affiliated with Kick, Twitch or Spotify. Use at your own risk.
