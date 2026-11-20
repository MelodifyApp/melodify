# Irreversible actions — approval gate

Some actions cannot be undone, or can only be undone partially. This is a
process gate, not a feature list. Treat public, remote and write-once actions
as if they were listed even when they are not.

**Rule:** no action marked *owner approval* without explicit owner approval.
Record the approval in the release issue and, for data changes, test on a copy
first.

| Action | Why it is hard to undo | Before doing it | Mitigation |
| --- | --- | --- | --- |
| Public GitHub release, tag or asset upload | Assets and tags are cloned, cached and mirrored; deleting them is incomplete | Owner approval, release checklist, clean build, checksums | Stage as draft, verify assets, publish deliberately |
| `npm publish` | Published versions cannot be reused; unpublish is time-limited and leaves traces | Owner approval, package verification, provenance | Stage/dry-run first; deprecate rather than delete |
| Profile migration (encryption or schema) | Older builds cannot read the new format; a bad write can strand credentials or history | Owner approval, restore test on a profile copy | No plaintext credential backup is kept; 1.0.7 recovery is unsupported, credentials are re-entered in 1.1.0 |
| Clearing or deleting local data | The data is gone unless the user exported it | Explicit confirmation; offer export first | Queue-history export; full-profile backup; document deletion |
| Sending an export or support bundle | Once received, it cannot be recalled | User-initiated, previewed and redacted | No automatic upload; preview before sharing; never include secrets |
| Public name, brand, legal or platform commitment | Public use creates rights/conflicts and user expectations | Name clearance, legal review, owner approval | Owner-only release until cleared; keep installer identity `Melodify` in 1.1.0 |
| Installer identity or signing change | Upgrades, shortcuts and trust are anchored to the identity | Migration plan and a transition release | Keep `Melodify` for 1.1.0; plan any rename explicitly |
| Auto-update rollout | Users install the build; a bad build cannot be pulled back from them | Signed manifest, staged rollout, update-deferral while live | Keep a full-installer recovery link; defer updates during sessions |

## Already irreversible / already done

- **`basic-electron-updater@1.1.0` is published to npm.** It contains code, not
  user data. Deprecating is possible; deleting the version is not.
- **The real `%APPDATA%\melodify` profile was encrypted by a packaged WIP build
  during QA.** Stable 1.0.7 cannot read `enc:v1:` and 1.0.7 recovery is not
  supported. Credentials are re-entered in 1.1.0; no plaintext backup is kept.
- **No Melodify 1.1.0 desktop release, public tag or download exists yet.**

## Not irreversible

- Local commits and branches (not pushed).
- Local test files and preview artefacts.
- The queue-history file (can be exported/cleared).
- Documentation and templates (not published).
- Local builds in `out/` (can be rebuilt).
