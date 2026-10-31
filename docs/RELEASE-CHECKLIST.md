# Desktop release checklist

This checklist covers the Windows `v*.*.*` release path. The workflow is
`.github/workflows/build-and-publish.yml`.

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
  `v<version>/Melodify.Setup.exe` asset.
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
- For 1.1.0, publish the hardened `basic-electron-updater` version above 1.0.6
  and update the desktop dependency before tagging.

## Tag gate

After owner approval, push a `v<version>` tag. The workflow then:

1. Builds in a read-only job with checkout credentials disabled.
2. Prepares `release-assets/` with `Melodify.Setup.exe`,
   `Melodify-<version>-full.nupkg`, `RELEASES`, `update.json`, `SHA256SUMS.txt`,
   a release manifest, and the release notes.
3. Uploads those files as a workflow artifact.
4. Downloads them into the protected `release` environment without installing
   dependencies.
5. Verifies the tag/version match, expected files, non-zero sizes, SHA-256
   hashes, `update.json` metadata, and release notes.
6. Creates or updates the draft release, uploads the expected Windows assets,
   and verifies the uploaded names and sizes.
7. Un-drafts the release only after every check passes.

If any check or upload fails, the release remains a draft for inspection. If
the failure happens before draft creation, no draft is created. Workflow logs
and the draft are the source of truth; do not publish the draft manually until
the failure is fixed and the workflow reruns successfully.

## Expected Windows release assets

- `Melodify.Setup.exe`
- `Melodify-<version>-full.nupkg`
- `RELEASES`
- `update.json`
- `SHA256SUMS.txt`

`release-manifest.json` and `release-notes.md` travel in the workflow artifact
but are not uploaded as release assets.
