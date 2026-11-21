# Quelody — Privacy Notice

**Last updated:** [LAST UPDATED]
**App version:** 1.1.0
**Data controller:** [CONTROLLER NAME]
**Address:** [ADDRESS]
**Email:** [EMAIL]
**Website:** [WEBSITE]

This notice explains how Quelody handles personal data. The **Turkish version
(`PRIVACY.tr.md`) is the operative text for KVKK**; this English version is a
translation for international users.

## 1. Scope and model

Quelody is a Windows desktop application that runs on the user's own machine.
It does not create accounts, send data to a developer-operated server, include
telemetry, analytics or advertising, or upload a profile to the cloud.

Data is stored locally in the user's Windows profile. The developer cannot
access it unless explicitly stated otherwise.

## 2. Data processed

| Category | Examples | Source | Purpose |
|---|---|---|---|
| Configuration | language, theme, window layout, templates, commands, cooldowns | User | App operation |
| Platform credentials | Spotify/Kick/Twitch Client ID and Secret, OAuth access/refresh tokens | User | Platform connection and API calls |
| Platform identity | username, user ID, chatroom ID | Platform | Chat and request handling |
| Chat and requests | commands, song title/artist, requesting username, timestamps | Platform chat | Song request and reply handling |
| Logs | session entries, errors, event metadata | App | Debugging and security |
| Support | email address and correspondence | User | Support request |
| Update checks | IP address and client information | GitHub | Update check |

Chat messages are processed in memory to execute commands. The app does not keep
a full chat archive; only selected events (for example a song request or an
error) may be written to local logs.

## 3. Purposes and legal bases

Under KVKK Art. 5:

- **Performance of a contract (5/2-c):** core app functions, platform
  connection, song requests and command handling.
- **Legitimate interest (5/2-f):** security, debugging, abuse prevention and
  improvement, balanced against the user's rights.
- **Legal obligation (5/2-a):** retention required by applicable law.
- **Explicit consent (5/1):** only for future optional features such as
  marketing. The current release has no marketing processing.

No special-category data is targeted.

## 4. Recipients and cross-border transfers

The app sends requests directly to:

- Spotify AB — authentication, playback and queue operations
- Kick — chat, authentication and reward operations
- Twitch — chat, authentication and reward operations
- GitHub — update checks and release downloads

These providers may be located outside Turkey and are governed by their own
privacy policies. Transfers occur when the user connects a platform and uses the
app. The developer does not separately collect, store or sell this data.

Support correspondence is used only to answer the request.

## 5. Retention

| Data | Retention |
|---|---|
| Configuration and preferences | Until deleted or uninstalled |
| Client Secret and OAuth tokens | Until replaced or uninstalled |
| Logs | 30 days; old files are deleted at startup |
| Song request history | 30 days; old files are deleted at startup |
| Support correspondence | Reasonable period after resolution plus legal retention |

Data is deleted, destroyed or anonymised when the period ends.

## 6. Security measures

- Data is stored in the Windows user profile under operating-system account
  access controls.
- Client Secrets and OAuth access/refresh tokens are encrypted at rest with
  Windows DPAPI through Electron `safeStorage`; encrypted values use the
  `enc:v1:` envelope in `config.json`. Client IDs and non-secret preferences
  remain readable JSON. This protects the profile from other Windows accounts;
  it does not protect against malware or another process running as the same
  Windows user.
- Tokens, passwords and secret-like values are redacted from logs, including
  encrypted envelopes.
- Credentials are not exposed to the renderer process; they stay in the main
  process.
- No telemetry, remote monitoring or advertising.
- Releases publish SHA-256 checksums; official 1.1.0 builds are unsigned.

If Windows DPAPI cannot unlock the existing ciphertext (for example after
moving the profile to a different Windows user or machine), the app keeps the
ciphertext on disk, treats the affected credentials as missing, and asks the
user to re-enter them. Downgrading to 1.0.7 after 1.1.0 is not supported. Users
remain responsible for protecting their Windows account, platform passwords and
device.

## 7. Your rights (KVKK Art. 11)

You may:

- learn whether your data is processed and request information,
- learn the purpose and whether it is used accordingly,
- know the third parties to whom data is transferred domestically or abroad,
- request correction of incomplete or inaccurate data,
- request deletion or destruction,
- request notification of correction/deletion to recipients,
- object to a result against you produced by automated analysis,
- claim compensation for damage caused by unlawful processing.

Requests can be sent in writing to **[EMAIL]**. Responses are provided within
30 days. Complaints can be filed with the Turkish KVKK (www.kvkk.gov.tr).

Local data can also be deleted by removing the app profile:
`%APPDATA%\quelody`.

## 8. Cookies and website

The desktop app uses no cookies. If a website is launched, it will have a
separate cookie notice and, where required, consent.

## 9. Children

The app is not directed at children and does not knowingly collect their data.
Users must follow the age requirements of the platforms they connect.

## 10. Changes

This notice is updated when the app or its processing changes. Material changes
are announced in release notes. The current version is published here.

## 11. Contact

[CONTROLLER NAME]
[ADDRESS]
[EMAIL]
[WEBSITE]
