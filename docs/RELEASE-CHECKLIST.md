# Desktop release checklist

This checklist covers the Windows `v*.*.*` release path. The workflow is
`.github/workflows/build-and-publish.yml`.

> The wider launch surface — legal, brand, Electron runtime, support and
> distribution — is tracked in [RELEASE-READINESS.md](RELEASE-READINESS.md).

## One-time GitHub repository settings the owner must create

1. **Workflow permissions:** Settings → Actions → General → Workflow permissions
   → **Read repository contents and packages permissions**. The workflow also
   sets `contents: read` at the top level; only the publish job raises it.
2. **Protected `release` environment:** Settings → Environments → **New
   environment** → name it `release`.
   - Deployment branches and tags: **Selected tags**
   - Tag pattern: `v*.*.*`
   - **Do not add required reviewers.** Publication after the automated checks
     is intentional.
   - No environment secrets are required; the publish job uses `github.token`.
3. **Actions policy:** allow the pinned GitHub actions used by the workflow
   (`actions/checkout`, `actions/setup-node`, `actions/upload-artifact`, and
   `actions/download-artifact`).

## Before tagging

- Update the release version in `package.json`, `package-lock.json`, and
  `update.json`, and make the `update.json` Windows URL point at the new
  `v<version>/Quelody.Setup.exe` asset.
- Add `RELEASE-NOTES-v<version>.md`. The workflow uses it as the draft release
  body and fails if it is missing or empty.
- Run the local checks, including `npm run test:release`.
- Build and test the packaged app locally. The packaged-app smoke test is a
  **local pre-tag step in Windows Sandbox**:
  - No network and a temporary profile.
  - Verify the app opens, reports the expected version, and exits cleanly.
  - This is **not a GitHub-hosted job**. GitHub-hosted Windows runners do not
    provide Windows Sandbox; do not claim that boundary exists in CI.
- Inspect the expected Squirrel output under
  `out/make/squirrel.windows/x64/` before creating the tag.
- For 1.1.0, publish the hardened `basic-electron-updater` package as **1.1.0**
  and update the desktop dependency/lockfile before tagging.
- 1.1.0 ships **unsigned**; publish `SHA256SUMS.txt` and do not describe the
  installer as signed or as having verified publisher identity.

## Privacy / KVKK (before tagging)

- [ ] Controller identity, address, email and website filled in
      `docs/PRIVACY.tr.md` and `docs/PRIVACY.md`.
- [ ] Turkish KVKK legal review of `PRIVACY.tr.md` completed.
- [ ] `docs/KVKK.md` assessment current; VERBİS exemption recorded.
- [x] Secret-at-rest decision: Client Secrets and OAuth access/refresh tokens
      are encrypted with Electron `safeStorage` (Windows DPAPI) under the
      `enc:v1:` envelope. Manual QA completed 2026-11-10 in an isolated profile:
      plaintext migration, restart, token update, forced decrypt failure,
      ciphertext preservation and renderer projection. 1.1.0 release notes may
      claim credential encryption; downgrades are unsupported and no rollback
      path is provided.
- [ ] Privacy links present in README and release notes; add an in-app link when
      available.
- [ ] If a website or newsletter ships: cookie notice, consent and Art. 9
      transfer assessment.

## Tag gate

After owner approval, push a `v<version>` tag. The workflow then:

1. Builds in a read-only job with checkout credentials disabled.
2. Prepares `release-assets/` with `Quelody.Setup.exe`,
   `Quelody-<version>-full.nupkg`, `RELEASES`, `update.json`, `SHA256SUMS.txt`,
   a release manifest, and the release notes.
3. Uploads those files as a workflow artifact.
4. Downloads the artifact **as data only** into the protected `release`
   environment, then performs a **read-only checkout** of the triggering commit.
   The publish job does not install dependencies or execute verifier code from
   the artifact.
5. Runs `scripts/release-assets.cjs` from that checkout against the downloaded
   directory and verifies the tag/version match, expected files, non-zero sizes,
   SHA-256 hashes, `update.json` metadata, and release notes.
6. Creates or updates the draft release, uploads the expected Windows assets,
   and verifies the uploaded names and sizes.
7. Un-drafts the release only after every check passes.

If any check or upload fails, the release remains a draft for inspection. If
the failure happens before draft creation, no draft is created. Workflow logs
and the draft are the source of truth; do not publish the draft manually until
the failure is fixed and the workflow reruns successfully.

## Expected Windows release assets

- `Quelody.Setup.exe`
- `Quelody-<version>-full.nupkg`
- `RELEASES`
- `update.json`
- `SHA256SUMS.txt`

`release-manifest.json` and `release-notes.md` travel in the workflow artifact
but are not uploaded as release assets.
