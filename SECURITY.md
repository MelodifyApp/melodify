# Security policy

## Supported versions

- **1.0.x:** latest stable release receives security fixes.
- **1.1.x:** supported after the 1.1.0 release.
- Pre-release, WIP and locally built versions are not supported.

## Reporting a vulnerability

Do **not** open a public GitHub issue for a security vulnerability.

Use GitHub private vulnerability reporting:

<https://github.com/MelodifyApp/melodify/security/advisories/new>

Include:

- affected version
- Windows version
- a minimal reproduction
- impact and any known workaround

Do not include credentials, tokens, real chat contents, personal data or other people's account details. Use dummy values in screenshots and logs.

## What to expect

Reports are reviewed on a best-effort basis. There is no paid bug bounty. Confirmed issues will be fixed in a supported release and disclosed after a fix is available, with credit only if requested.

## Scope

This policy covers the Melodify desktop application and its updater integration.

Spotify, Kick and Twitch services, accounts, developer applications, OAuth provider behavior and third-party platform policy are outside this repository's control. Report those issues to the relevant provider.

## Code signing

Official 1.1.0 Windows builds are currently unsigned. Verify downloads against the SHA-256 checksums published with the release; do not rely on the absence of a Windows warning as proof of authenticity.
