# Melodify Live — KVKK assessment (internal, draft)

**Status:** draft for owner and legal review
**Prepared:** 2026-11-10
**App:** Melodify Live 1.1.0, Windows desktop, local-first
**Controller identity:** [CONTROLLER NAME] — to be completed

This is an internal engineering/operations note, not legal advice. The public
texts are `PRIVACY.tr.md` (operative for KVKK) and `PRIVACY.md` (English).

## 1. Roles

- **Developer:** builds and distributes the app; does not operate a server or
  receive user profiles, credentials, chat or request data.
- **User / streamer:** runs the app on their machine and decides which platforms
  to connect. For their viewers' usernames, messages and requests, the streamer
  is the data controller.
- **No processor relationship:** because no personal data is sent to the
  developer, the developer is not a data processor for the streamer's data.

Consequence: the public notice must describe the app's local processing and make
clear that the developer does not receive the data. Streamers need their own
short notice for viewers.

## 2. Processing inventory

| Data | Where | Purpose | Basis | Retention | Recipients |
|---|---|---|---|---|---|
| Language, theme, window layout, templates, commands | `%APPDATA%\melodify\config.json` | App operation | Contract / legitimate interest | Until uninstall | None |
| Client ID/Secret, OAuth tokens | `config.json` | Platform API access | Contract | Until replaced / uninstall | Spotify, Kick, Twitch |
| Platform username/user ID/chatroom ID | `config.json` | Chat and requests | Contract | Until uninstall | Relevant platform |
| Song requests, requester username, title/artist | Local logs + `song-requests` | Request handling and diagnostics | Contract / legitimate interest | 30 days | None |
| Session logs, errors, event metadata | `%APPDATA%\melodify\logs` | Debugging, security | Legitimate interest | 30 days | None |
| Current-song file | User-chosen path | User-requested export | Contract | User-controlled | None |
| Support email | Owner mailbox | Support | Legitimate interest | Resolution + legal retention | None |
| Update checks (IP) | GitHub | Update delivery | Legitimate interest | GitHub policy | GitHub |

Secrets are redacted from logs (`redactSecrets` / `redactLogText`). The renderer
never receives credentials.

## 3. VERBİS

KVKK registration thresholds: 50+ employees or annual balance sheet above
₺25 million, and registration regardless of thresholds for special-category
data. A solo developer is likely **exempt**.

Action: record this assessment and re-check annually or when the project adds
accounts, analytics, a cloud queue, payments or staff. If the controller is
established outside Turkey, a local representative may be required; confirm
before publishing.

## 4. Cross-border transfers

The app calls Spotify, Kick, Twitch and GitHub directly. The developer does not
transfer data from a server. The public notice discloses the recipients and
that they may be outside Turkey.

Action: if a website, newsletter or cloud feature is added, perform a separate
Art. 9 assessment and use an appropriate transfer mechanism.

## 5. Security measures (credentials at rest resolved)

Implemented:

- credentials kept in the main process, never sent to the renderer,
- Client Secrets and OAuth access/refresh tokens encrypted at rest with
  Electron `safeStorage` (Windows DPAPI) under the stable `enc:v1:` envelope;
  Client IDs and non-secret settings remain readable JSON,
- deferred unlock after Electron is ready, with 1.0.7 plaintext config migrated
  once on first 1.1.0 launch,
- a decryption failure keeps existing ciphertext on disk, logs only the field
  name, and treats the credential as missing so it can be re-entered,
- a failed migration leaves the plaintext file intact and logs a warning,
- secret redaction in logs and exported logs, including `enc:v1:` envelopes,
- 30-day log and request-history cleanup,
- no telemetry, analytics or remote profile,
- checksum-published unsigned builds.

Caveats:

1. Downgrades are not supported. 1.0.7 cannot read encrypted values, and no
   rollback path is provided.
2. If DPAPI is unavailable, encrypted fields remain locked and legacy plaintext
   is left untouched; the app asks the user to re-enter missing credentials.
3. Manual QA on Windows DPAPI completed 2026-11-10 with a plaintext config →
   encrypted disk → restart/reload → token update → forced decrypt failure.
   Existing ciphertext was preserved and the renderer projection stayed clean.
4. Re-check this assessment if the storage format or supported platforms change.

## 6. Breach response

The developer holds no central user database, so most incidents are local to a
user's machine.

If a vulnerability or developer-side exposure is confirmed:

1. Contain and assess scope.
2. Notify affected users and publish a security advisory.
3. If developer-held personal data is involved, notify KVKK within **72 hours**
   and inform data subjects.
4. Provide a fix, checksum and upgrade path.

Contact: [EMAIL]. Security reports: GitHub private advisories (see
`SECURITY.md`).

## 7. Streamer guidance (viewer data)

Add to the docs/site:

- Tell viewers that chat commands and song requests are processed by the
  streamer's local Melodify Live instance.
- Do not publish logs containing usernames or request history.
- Keep the Windows account and platform credentials secure.
- Delete `%APPDATA%\melodify` when retiring the setup.
- Do not use the app to build a viewer database beyond the request workflow.

## 8. Release actions

- [ ] Fill controller name, address, email and website in both notices.
- [ ] Turkish legal review of `PRIVACY.tr.md`.
- [x] Secret encryption at rest implemented and manually QA'd on Windows DPAPI
      (2026-11-10): nine credential fields use `enc:v1:` with migration,
      fallback and an unsupported-downgrade note documented.
- [x] Link the privacy notice from README; in-app link pending.
- [x] VERBİS exemption assessment recorded in this document.
- [x] Privacy/KVKK line added to `docs/RELEASE-CHECKLIST.md`.
- [ ] If a website launches: cookie notice, consent, and Art. 9 assessment.
- [ ] Revisit when adding accounts, telemetry, cloud sync, payments or staff.
