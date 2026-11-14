# Playwright browser tests
Last edited: 2026-10-22
Status: Active
Related files: `../docs/product/photo-wall-experience.md`, `../docs/system/photo-library-source-and-runtime.md`, `../src/client/README.md`

Browser regression coverage for the wall interaction contract lives here.

## What this harness does

- regenerates the committed smoke fixtures before boot
- builds the client and server once per run
- starts the production-style Fastify app on `http://127.0.0.1:5176`
- points the app at `fixtures/library-wall` (the smoke library's albums with 160 photos, so the wall is several screens across)
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
- `focused-lightbox.spec.ts` — protects focused-photo open/close return and next/previous: each step shows a different photo, glides the wall until it is centered, and stepping reaches every photo once before returning to the start; clicking outside the photo closes it, clicking the photo does not; a sideways trackpad swipe steps once per swipe, also mid-tail, and pans instead while zoomed in; a reload comes back to the same wall spot and reopens the focused photo
- `curation.spec.ts` — protects curation: albums start in storage, viewers' menus show no curator login, the curator unlocks with the PIN on the unlisted `/curate` page and puts albums on display, viewers see only those, hiding a photo moves it into its album's `_hidden` folder with undo, a light edit (square crop with a frame that stays put, brightness) shows on the photo while the file stays byte-identical and undo reverts it, perspective and lens correction (Auto loads its detector and reports what it did, the sliders save into the recipe, and the server serves the corrected photo with the file untouched), a share link reopens the same albums centered on the shared photo, starred photos form a Favorites album viewers can pick, a photo opened from Favorites names its source album and unstarring it there takes it off the wall with undo, private photos stay in place but never reach guests, the curator features one photo per album in a chosen frame (replacing one asks first, previewing it) and it shows framed at about 90% of the screen on the wall, the curator sets the default wall spacing (frames) and photo-view frames that guests start from, picks a photo's frame and mat, a framed photo pops on hover to half the photo view's size, and a guest switching spacing fades to black and back and is remembered until Use defaults, fancy frames are a separate group in the picker (Random fancy hangs a photo in one) and the curator's Random frames setting switches unpicked photos to them, and the curator can preview the wall as a guest while keeping curator tools. Runs its own server on port 5186 against a temp copy of the wall fixtures (reusing the build).
- `wall-hover-modal.spec.ts` — protects the hover pop (slight in-place lift with drop shadow, animating in for each photo while the previous settles back), click-vs-drag suppression, suppression while scrolling, and focused-photo return behavior
- `album-picker.spec.ts` — protects the album-picker tree: one album at a time with no checkboxes until "Select multiple" is on, nested folders under top-level folders, a top-level pick selecting everything inside, the partial indicator after deselecting a nested folder (surviving reload), and no year chips or root editor in the menu
- `grouped-signposts.spec.ts` — protects grouped signpost reveal, glide, modal suppression, and grouped-selection persistence
- `zoom-detail-tiers.spec.ts` — protects zoom-aware derivative tiers: thumbnails at overview, then screen-resolution tiers (at 2× DPR) for on-screen photos when zoomed in, plus the focused view
- `media-diagnostics.spec.ts` — proves the real wall advances through browser texture stages, the server observes media outcomes, and neither diagnostic snapshot exposes media identifiers
- `mobile-wall-gestures.spec.ts` — protects tap-outside-to-close, swipe next/previous and pinch zoom/pan on the focused photo, mobile drag/fling: velocity-responsive glide, prompt slow-release stop, pause/reduced-motion/catch cancellation, no backward jitter while a fling settles, and tap-to-open
- `mobile-pinch-zoom.spec.ts` — protects touch pinch and zoom buttons, and that touch pinch and trackpad (ctrl/⌘-wheel) zoom pivot on the pinch point or cursor rather than the screen corner

## Changelog

### 2026-10-20
- The hover hand-off spec zooms out first so two photos fit fully on screen with the larger fixture tiles.
- Specs now run against `fixtures/library-wall` (160 photos in the smoke library's albums) so the radial wall is several screens across. Grouped completeness checks read the wall's laid-out photo count (`data-packed-photo-count`) because off-screen tiles are no longer mounted; the zoom-tier check accepts any on-screen photo reaching the sharp tier, since narrow tiles can rightly stay on thumbnails.

### 2026-10-19
- Added `album-picker.spec.ts`. Grouped specs now pick the `2024` top-level folder (which expands into child album areas) instead of the removed year chip, and expand it before picking nested folders.

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
