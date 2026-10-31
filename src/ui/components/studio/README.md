# Studio primitives

Production React controls for the approved Studio Settings direction. This area is additive and intentionally **not wired to a renderer entry point or existing product components yet**.

## Components

Import from `src/ui/components/studio`:

- `StudioTheme` — scoped `graphite` / `light` / `dark` token boundary.
- `Button` — `primary`, `secondary`, `ghost`, `small`, `iconOnly`, `loading`; native button props/ref/type retained. Icon-only requires `aria-label`.
- `IconButton` — labelled square icon control.
- `Field` — render-prop label/helper/error association; `Input`, `Select`, `Textarea` — native controls with generated or caller IDs and merged `aria-describedby`.
- `Toggle` — controlled native switch with associated label/helper.
- `StatusChip` — Verified, Unverified, Verifying, Verification failed, Needs credentials, API draft pending. Presentation only; `verified` must only be supplied after the caller's successful check. `announce={false}` avoids duplicate live announcements.
- `SettingCard` / `SettingGroup` — quiet Studio surfaces and semantic headings.
- `SaveDock` — ordinary `dirty` Saved/Unsaved dock with Save/Discard; `mode="api"` note-only dock with reserved API-draft status slot. No persistence or overlay behavior.
- `SectionNav` — Home control, grouped navigation, `aria-current` active row.
- `ServiceCard` — real Spotify/Kick/Twitch icon tiles, caller-owned status and actions. No credentials, verification, persistence or provider calls.
- Shared `tokens.css`, `studio.css`, `motion.css`; motion timings/easing exist only in `motion.css` and reduced motion removes nonessential effects.

Ordinary config saves use **Saved**, never **Verified**. Status props are caller-owned presentation state.

## Development preview

`preview/StudioPreview.tsx` is development-only (`process.env.NODE_ENV === "production"` returns `null`) and is not exported from the barrel. Generate a local component harness:

```powershell
node scripts/studio-preview.cjs --out C:\Users\Kryp\AppData\Local\Temp\opencode\studio-primitives-preview\index.html
```

Open the resulting `file:///.../index.html` (optionally `?theme=light` or `?theme=dark`). The script transpiles the **actual TSX** with installed TypeScript and loads installed React CommonJS in the browser; it is not an application build, dev server, alternate static sheet, or Electron launch. Its allowlist rejects non-Studio/app dependencies.

## Verification

- `npx tsc --noEmit`
- `node node_modules/eslint/bin/eslint.js src/ui/components/studio --ext .ts,.tsx`
- `node --require ts-node/register/transpile-only --test test/studio-primitives.test.cjs`
- `npm run test:ui-states`
- Headless browser harness: `/scripts` is not linted by the app's TS-only config; syntax is checked with `node --check`.
- Full `npm run lint` still reports the repository's existing alias-resolution errors; compare against the 161 errors/101 warnings baseline and the clean scoped component lint.
