# `src/client/`
Last edited: 2026-06-10
Status: Active
Related files: `../../README.md`, `../../docs/product/photo-wall-experience.md`, `../../docs/system/photo-library-source-and-runtime.md`

Current React + TypeScript + Vite frontend.

- `index.html` — Vite root document
- `src/main.tsx` — client entrypoint
- `src/App.tsx` — app shell wiring
- `src/app/` — React Query providers and shared app setup
- `src/api/` — HTTP client helpers for library, photo, and playlist routes
- `src/hooks/` — query hooks for library status/facets, photo pagination, and playlists
- `src/state/` — camera, filter, focused-photo, and layout state helpers
- `src/features/controls/` — filter and playlist controls UI
- `src/features/debug/` — dev-only overlay diagnostics
- `src/features/editor/` — the curator's light photo editor: Pixi preview scene, crop frame overlay and pure crop math
- `src/features/modal/` — focused-photo lightbox adapter and related tests
- `src/features/wall/` — wall shell orchestration, `SingleStreamWallView.tsx`, `GroupedWallView.tsx`, `activeAlbumAreaCount.ts`, layout/packing helpers, the Pixi surface, the DOM hit-target bridge, hover/signpost logic, and related tests
- `src/styles/` — global app and wall styling

## Changelog

### 2026-06-10
- Clarified that the wall feature area now centers on one Pixi-first wall path with `SingleStreamWallView`, `GroupedWallView`, and `activeAlbumAreaCount` discoverability points instead of renderer-selection seams.
- Added schema metadata, clarified that the modal feature area now centers on the focused-photo lightbox adapter, and renamed the wall feature note away from obsolete renderer-seam wording.
