# Full Studio parity checklist — 2026-10-30

Task: `ml-desktop-20261030-full-parity-04`

Reference: `design-previews/app-2026-10-27/index.html` (Studio concept), review evidence under `review/`.

## Titlebar and window shell

- [x] 38px Studio titlebar, 12px left padding, 24px original mark, 14.5px wordmark, separator.
- [x] Brand click returns Home; Settings gear toggles Settings.
- [x] Theme picker with eight presets, swatches, selected check, note, Escape/click-away/focus return.
- [x] Graphite, Midnight, Plum, Forest, Deep Sea, Ember, Light and Dark tokens applied to titlebar, Home, Settings, rail, dialogs, inputs, buttons, scrollbars and overlays.
- [x] Theme persisted in renderer storage and restored on next app open.
- [x] Minimize, maximize/restore and close controls with Studio geometry, hover, focus and labels.
- [x] Real Electron window actions; main window resizable/maximizable with 320px minimum width.
- [x] Development test-tube removed from the product titlebar; UI test window remains available from Debug.

## Home

- [x] Latest-request region: real accepted count, last song, artist and localized relative time.
- [x] Queue region in the accepted composition. No queue backend exists, so it shows the accepted empty state and states that limitation; no demo rows.
- [x] Connections rail with Music/Streaming groups, real provider status, status dots/chips. The former API-credential separation note is removed.
- [x] Manage connections dialog with compact service rows, real Connect/Disconnect/Reconnect/Refresh actions and a path to API Keys setup.
- [x] Real update/version footer, including checking/downloading/ready/available/error.
- [x] No fake provider states, credentials, queue rows or provider writes.

## Settings

- [x] Studio rail: 260px desktop, Home control, localized title and groups, uppercase group labels, active marker, compact horizontal rail at ≤700px.
- [x] One visible 28px page title; section-level duplicate headings hidden in the shell.
- [x] Content-only scrolling, 960px wrap, Studio surface/radial canvas treatment, always-visible save dock.
- [x] General: real update flow and Studio groups/controls.
- [x] API Keys: real Verified workflow, Studio service cards, icons, chips, fields, setup dialog and API dock.
- [x] Requests: real file path/reward behavior aligned to Studio groups, fields and conditional controls.
- [x] Commands: Studio cards, prefix/moderators, aliases, enable toggles, reply settings, performance line and empty state; draft Save/Discard preserved.
- [x] Logs: Studio search/filter/counts/list/export; real log behavior preserved; unfinished Clear action removed.
- [x] Debug: development-only Studio groups, system info, component states, performance table and actions; UI test window relocated here.

## Custom Studio dropdowns (follow-up)

- [x] Reusable accessible combobox/listbox in `src/ui/components/studio/Select.tsx` with logic split into `selectLogic.ts`.
- [x] General interface/default language, both Requests reward pickers and Logs level filter use the Studio dropdown.
- [x] Portaled fixed listbox, selected check, disabled/error/helper states, theme inheritance, draft-compatible values.
- [x] Keyboard open/move/wrap/Home/End/select/Escape/Tab behavior and outside-pointer focus handling.
- [x] No native `<select>` remains in `desktop/src` or the Studio app mockup; source/standalone hashes match.

## Overlays and details

- [x] Settings setup dialog: Studio scrim/dialog, close control, Escape, focus trap and focus return.
- [x] Home connections dialog: Studio scrim/dialog, compact rows, Escape, focus trap and focus return.
- [x] Update toast: Studio dialog surface, progress, actions and theme-aware states.
- [x] Theme popover: non-modal anchored Studio dialog with keyboard support.
- [x] Inputs keep the single animated Studio focus treatment, no native duplicate outline, spellcheck off.
- [x] Reduced motion, focus rings, hover/press states and themed scrollbars.
- [x] Responsive targets reviewed in source: 1200×800, 390×844, 320×700 and window maximize/restore.

## Verification

- [x] `npx tsc --noEmit`
- [x] Scoped ESLint for changed files (known alias baseline excluded)
- [x] Full-parity, Home, Settings continuity, credential, draft, preload and security tests
- [x] Custom dropdown and Studio primitives tests: focused 50/50 (root re-run)
- [x] `test:ui-states` 2/2, `test:i18n` 2/2, `validate-translations` PASSED
- [x] Provider suites: Spotify 70/70, Kick 48/48, Twitch 37/37, security 20/20

## Limitations / owner QA

- No browser/screenshot/static-server comparison was run, per instruction. Visual comparison must use the already-open Studio preview and the real app.
- The running app must be refreshed/restarted to load the custom-dropdown renderer changes before owner comparison.
- No live provider credentials or network calls were used in tests.
- The queue backend is absent; the queue area intentionally shows an empty state and says so.
- The old provider card components are no longer rendered by Home; connection management now uses compact Studio rows with real IPC actions.
