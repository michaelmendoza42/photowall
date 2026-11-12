# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev                # Fastify (tsx watch, :3001) + Vite client (:5176, proxies /api and /healthz to :3001)
npm run typecheck          # tsc -b across client/server/shared/test tsconfigs
npm test                   # vitest unit tests (src/**/*.test.ts, node env)
npx vitest run src/client/src/features/wall/__tests__/dragMomentum.test.ts   # one file
npx vitest run -t "name substring"                                            # by test name
npm run test:browser       # Playwright; webServer runs fixtures:generate + build + start on :5176
npx playwright test playwright/wheel-momentum.spec.ts --project=chromium-desktop   # one spec
npm run build && npm start # production build (dist/client + dist/server) and run
npm run curation:reconcile # after moving library folders on disk: re-key stars/private/edits/albums/shares (dry run; add -- --apply)
```

- Playwright boots the real production server against `fixtures/library-smoke/` with a temp data dir. Set `PLAYWRIGHT_REUSE_EXISTING_SERVER=true` to reuse a running one. Mobile specs only run under the `chromium-mobile` project when they're listed in its `testMatch` in `playwright.config.ts`, so add new mobile specs there.
- `playwright/README.md` indexes which spec protects which behavior contract.
- Env config lives in `.env` (see `.env.example`). The key vars are `PHOTO_WALL_LIBRARY_ROOT`, `PHOTO_WALL_DATA_ROOT`, `PHOTO_WALL_PORT` and `PHOTO_WALL_SCAN_TOP_LEVEL_YEARS_ONLY`. They're validated in `src/server/config/env.ts`.

## Architecture

Single-package TypeScript app: `src/server` (Fastify), `src/client` (React + Vite, root `src/client`), and `src/shared` (zod schemas, types and API path constants with no side effects, imported by both sides). ESM throughout: relative imports use `.js` extensions, even from `.ts`/`.tsx` files.

**Server** (`src/server/index.ts` wires everything):
- `LibraryService` (`snapshots/`) validates the read-only library root and the writable data root, which must not overlap. It runs a recursive scan (`scanner/`) on startup and persists a snapshot under the data root. A rescan means a restart.
- `query/` applies year/folder filters and cursor pagination over the snapshot for `routes/photos.ts`.
- `DerivativeService` (`media/`) generates sharp-resized thumbnails in size tiers and caches them on disk under the data root. `routes/media.ts` serves them. The client asks for higher tiers as zoom increases.
- `PlaylistService` (`playlists/`) stores saved-filter playlists as files under the data root.
- In production, `services/static-client.ts` serves `dist/client`.

**Client wall** (`src/client/src/features/wall/`) is where most of the complexity lives:
- `WallShell` orchestrates the wall. It picks between `SingleStreamWallView` (a looping/wrapping single stream) and `GroupedWallView` (album areas with signposts), and hosts the controls, debug overlay and `FocusedPhotoLightbox` modal.
- Rendering is Pixi-first. `PixiWallSurface`/`pixiScene.ts` draw the tiles and `WallCanvas` handles input. A DOM hit-target bridge keeps hover/click/tap working. `textureScheduler.ts` and `mediaSourceResolver.ts` pick derivative tiers.
- Layout is pure and unit-tested: `packer.ts`/`groupedPacker.ts` build the gapless packing, `virtualization.ts`/`singleStreamRenderWindow.ts` handle windowing, and `dynamicLoading.ts`/`groupedLoading.ts` decide when to fetch the next page.
- Input and motion have hooks and pure math kept separate: `dragGesture.ts`, `dragMomentum.ts` + `usePanMomentum.ts` (wheel/drag inertia), `useTouchPinchZoom.ts` and `useRafCameraPublisher.ts`. Camera state lives in `src/client/src/state/camera.ts`.

Server data access goes through React Query hooks in `src/client/src/hooks/`, which wrap `src/client/src/api/`.

## Docs

- `docs/product/photo-wall-experience.md` is the behavior contract. Its full-viewport looping mosaic rules (adjoining album regions, bounded zoom-out) were approved on 2026-09-19 but aren't implemented yet; the plan is in commit `15f7ab7` under `specs/epics/e02-full-coverage-looping-mosaic/`.
- `docs/system/photo-library-source-and-runtime.md` covers the runtime and library-discovery constraints, `docs/runbooks/photo-wall-docker-lan.md` covers Docker/LAN operation, and `docs/glossary.md` defines the project's terms.
