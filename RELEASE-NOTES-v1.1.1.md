# Quelody 1.1.1

A Spotify setup and Now Playing fix. No new permissions or cloud services.

## Fixes

- **Settings no longer claims a Spotify account is connected.** API Keys now
  says “Credentials saved” because it stores the app's Client ID/Secret; the
  Spotify account connection is separate and lives on Home.
- **Saving Spotify credentials continues into OAuth.** The dialog button is
  “Save and connect”, so approving the Spotify login is no longer a hidden
  second step.
- **Home updates immediately after credentials are saved.** The connection rail
  re-reads the real provider flags instead of showing a stale “Needs setup”
  until restart, and refreshes again when you return from Settings.
- **Now Playing explains when Spotify is not ready.** The card now shows
  “Spotify isn't connected” with a **Connect** button, “Spotify isn't set up”
  with **Set up**, or a retry action after a failed connection, instead of
  claiming nothing is playing.

## Installation notes

- Windows 10/11, x64 only.
- This build is **unsigned**. SmartScreen may show “Unknown publisher”; verify
  the SHA-256 checksums published with the release before running it.
- Uninstalling does not delete `%APPDATA%\quelody`; delete that folder manually
  for a full reset.
