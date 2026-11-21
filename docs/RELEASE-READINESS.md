# Melodify 1.1.0 — release readiness

Master checklist for publishing the Windows desktop app. The technical tag/publish
steps live in [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md); this file covers the
full launch surface.

**Last updated:** 2026-11-21
**Status:** release candidate prep — live QA and legal gates remain

## 0. Blockers

- [x] **Electron upgrade merged.** Electron **45.4.1** (Chromium 156, Node 24)
      builds, packages and smokes; the branch is merged locally into `master`.
- [ ] **Live provider QA** (Spotify/Kick/Twitch) has not run for 1.1.0.
- [x] **Updater 2.0.0** published on 2026-11-21 with signed provenance; desktop
      dependency and lockfile are pinned to `2.0.0` and require signed manifests.
- [x] **Version/metadata** set to 1.1.0 in `package.json`, `package-lock.json`
      and `update.json` with the v1.1.0 asset URL.
- [ ] **Protected GitHub `release` environment** still needs to exist.
- [ ] **KVKK controller identity and Turkish legal review** are pending.
- [ ] **Name clearance** for "Melodify Live" is pending.

## 1. Product and quality

- [x] Settings closeout, API Keys onboarding, toggle-gated fields and logs.
- [x] Silent auto-save; no success indicator; inline failure alert only.
- [x] Dusk look, motion polish and reduced-motion behavior.
- [x] Credential encryption at rest (DPAPI, `enc:v1:`) with migration.
- [x] Queue history retention, export, clear and field minimization.
- [x] Queue sessions resume after a crash or recent relaunch while live.
- [x] Optional live-only request gate.
- [x] Local data lifecycle and irreversible-action approval gate documented.
- [x] Real-window visual QA at 1200/640/480 in Graphite/Light/Dark.
- [x] Gallery state matrix for rare states (API failures, Home empty/error,
      filtered logs).
- [x] Focused contracts, security suite, i18n and translations.
- [x] **Electron upgrade assessment** (36 → 45): no native modules; only
      `openAsHidden` needed removal; Squirrel packaging and the updater work.
- [ ] **Dependency audit** (`npm audit`, license scan) and a packaged-app
      dependency review.
- [ ] **Uninstall / data lifecycle:** verify what remains in
      `%APPDATA%\melodify` after uninstall and document deletion.
- [ ] **Windows support matrix:** Windows 10/11, x64 only, minimum build, high-DPI.
- [ ] **Accessibility pass:** keyboard-only, screen reader, high contrast.
- [ ] **Turkish/English UI pass** at 100% and 125% scaling.

## 2. Security and trust

- [x] Credentials encrypted at rest; renderer never receives secrets.
- [ ] **safeStorage async migration** before Electron 46: the sync API is
      deprecated in 45 and removed in 46.
- [x] Log redaction, CSP preconditions, navigation guards.
- [x] Security policy and private vulnerability reporting.
- [x] Ed25519 update-manifest verification; public key pinned in the app,
      private key outside the repo, signing secret configured in GitHub Actions.
- [x] Signed `update-manifest.json` + `.sig` release assets.
- [x] Unsigned-release decision and SHA-256 checksum process.
- [ ] **Signing decision revisited** for public launch (unsigned means
      SmartScreen "unknown publisher" and possible Smart App Control blocks).
- [x] **SmartScreen/SAC guidance** in README and release notes. Smart App
      Control can block unsigned installers outright; checksums do not bypass it.
- [ ] **Third-party notices:** Electron, Chromium, Squirrel and npm dependencies
      (MIT app; attribution obligations still apply).
- [ ] **GitHub account security:** 2FA, branch protection, release environment,
      least-privilege workflow permissions.
- [ ] **Incident response:** advisory template, yank/rollback runbook, contact.

## 3. Legal and privacy

- [x] Privacy notice (EN/TR) and internal KVKK assessment drafted.
- [x] Credentials encryption reflected in the notices.
- [x] Downgrade position documented as unsupported.
- [ ] Controller name, address, email and website filled in.
- [ ] Turkish KVKK legal review.
- [ ] VERBİS exemption recorded by the controller.
- [ ] **Trademark clearance** for "Melodify Live" (TÜRKPATENT classes 9/41/42;
      EUIPO/USPTO if global).
- [ ] **MIT license and copyright holder** confirmed for the public repo.
- [ ] **Terms of use / EULA** decision (free direct download vs store vs paid).
- [ ] **GDPR/CCPA** review if distributed outside Turkey.
- [ ] **Website privacy/cookie notice** if a landing page or newsletter launches.

## 4. Brand and distribution

- [x] Domain owned: `melodifylive.app`.
- [ ] Display brand "Melodify Live" applied (in progress).
- [ ] Installer identity decision: keep `Melodify` for 1.1.0 upgrade safety;
      rename only with a migration plan.
- [ ] Logo/mark ownership and icon sizes (installer, shortcuts, window, store).
- [ ] **Website/download page** on `melodifylive.app`: requirements, checksums,
      privacy, SmartScreen note, changelog.
- [ ] GitHub repo metadata: description, topics, social preview, README
      screenshots.
- [ ] Issue templates, PR template and support policy.
- [ ] Optional package managers (winget/Scoop/Chocolatey) or Microsoft Store.

## 5. Release mechanics

- [x] Updater package 2.0.0 published; desktop dependency/lockfile pinned.
- [x] `package.json`, `package-lock.json` and `update.json` at 1.1.0 with the
      correct asset URL.
- [x] `RELEASE-NOTES-v1.1.0.md` complete (features, fixes, security, migration,
      unsigned warning, downgrade unsupported).
- [x] Production build and Squirrel output inspection (version 1.1.0).
- [ ] Clean `npm ci` from the lockfile on a fresh checkout.
- [ ] Install, launch, upgrade from 1.0.7, uninstall and reinstall.
- [ ] Windows Sandbox smoke test (no network, temporary profile).
- [x] Release assets prepared and verified; SHA-256 checksums match the
      manifest.
- [ ] `release` environment, tag, CI draft, asset verification, un-draft.
- [x] **Updater release provenance:** 2.0.0 was published from `v2.0.0`
      (`d6d0e2f`) with provenance; the older 1.1.0 tag mismatch is superseded.

## 6. Support and operations

- [ ] Support channel (GitHub issues or email) and response expectations.
- [ ] Bug report template with version/log guidance and privacy warning.
- [ ] Troubleshooting/FAQ: provider setup, OAuth redirect, logs, update failures.
- [ ] Data deletion instructions (profile, logs, song requests, credentials).
- [ ] Release cadence / supported-version policy.
- [ ] Post-release monitoring: update feed, adoption, issue triage.
- [ ] Incident runbook: security advisory, asset removal, fixed release.

## 7. After 1.1.0

- [ ] Installer identity rename to "Melodify Live" with migration.
- [ ] Website/landing and download page.
- [ ] Microsoft Store or winget packaging, if desired.
- [ ] Paid/open-core packaging, refunds and tax review, if monetizing.
- [ ] Electron upgrade if deferred (not recommended to defer).

## Decisions needed from the owner

1. **Electron:** resolved — 45.2.3→45.4.1 is merged; the 36 EOL risk is removed.
2. **Name:** proceed with "Melodify Live" and run clearance, or clear a new name?
3. **KVKK:** controller details and legal review owner.
4. **Distribution:** direct download only, or Microsoft Store/winget as well?
5. **Monetization:** free/open-core for 1.1.0, or paid features at launch?
