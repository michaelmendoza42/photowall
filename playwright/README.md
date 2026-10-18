# Playwright browser tests
Last edited: 2026-10-02
Status: Active
Related files: `../docs/product/photo-wall-experience.md`, `../docs/system/photo-library-source-and-runtime.md`, `../src/client/README.md`

Browser regression coverage for the wall interaction contract lives here.

## What this harness does

- regenerates the committed smoke fixtures before boot
- builds the client and server once per run
- starts the production-style Fastify app on `http://127.0.0.1:5176`
- points the app at `fixtures/library-smoke`
- uses an isolated temporary data directory for each run
- saves screenshots on failure and retains traces on failure

## First-time setup

```bash
npx playwright install chromium
```

## Run the suite

```bash
npm run test:browser
```

## Artifacts

- HTML report: `playwright-report/`
- failure screenshots and traces: `test-results/playwright/`

## Protected browser contracts

- `wall-layout-modes.spec.ts` — protects the single-stream versus grouped wall-mode contract and the album-area diagnostics the shell exposes for that distinction
- `single-stream-wrap-continuity.spec.ts` — protects seamless wrap travel and verifies that the Pixi wall does not reinitialize during full-period travel
- `hover-cursor-pan.spec.ts` — protects the desktop hover slide: a partly off-screen (or larger-than-viewport) photo glides once until the cursor is at its center, not again while moving within it; fully visible photos never slide
- `wall-hover-modal.spec.ts` — protects the hover pop (slight in-place lift with drop shadow), click-vs-drag suppression, and focused-photo return behavior
- `grouped-signposts.spec.ts` — protects grouped signpost reveal, glide, modal suppression, and grouped-selection persistence
- `zoom-detail-tiers.spec.ts` — protects zoom-aware derivative tiers: thumbnails at overview, then screen-resolution tiers (at 2× DPR) for on-screen photos when zoomed in, plus the focused view
- `media-diagnostics.spec.ts` — proves the real wall advances through browser texture stages, the server observes media outcomes, and neither diagnostic snapshot exposes media identifiers
- `mobile-wall-gestures.spec.ts` — protects mobile drag/fling: velocity-responsive glide, prompt slow-release stop, pause/reduced-motion/catch cancellation, no backward jitter while a fling settles, and tap-to-open
- `mobile-pinch-zoom.spec.ts` — protects touch pinch and zoom buttons, and that touch pinch and trackpad (ctrl/⌘-wheel) zoom pivot on the pinch point or cursor rather than the screen corner

## Changelog

### 2026-10-02
- Removed the Mosaic Lab entry-seam spec with the feature and corrected the harness port to `5176`.

### 2026-07-30
- Generalized the protected-contract index to include the Mosaic Lab browser seam alongside wall behavior.

### 2026-07-29

- Added the media-diagnostics browser proof to the protected-contract index.

### 2026-06-26

- Added the Mosaic Lab entry-seam spec to the protected browser-contract index.
- Clarified that browser coverage should preserve the wall-first Mosaic Lab framing rather than an old dashboard-first metaphor.

### 2026-06-10
- Converted this README to the repository documentation schema.
- Added a protected-contract index so future maintainers can find the Playwright specs that guard the Pixi-first wall and grouped-versus-single mode behavior.
