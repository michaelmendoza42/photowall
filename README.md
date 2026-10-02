# photo-wall

Last edited: 2026-07-31

Minimal Docker-run web app for browsing a configured photo library on the home LAN as a large, gapless photo wall.

## Quick start

Local dev (Vite + Fastify with hot reload):

```bash
npm install
cp .env.example .env   # then edit PHOTO_WALL_HOST_LIBRARY_PATH
npm run dev            # client on :5176, server on :3001
```

Docker (production-style single image):

```bash
cp .env.example .env   # then edit PHOTO_WALL_HOST_LIBRARY_PATH and PHOTO_WALL_HOST_DATA_PATH
docker compose up --build
# health: curl http://localhost:3001/healthz
# LAN access: http://<your-lan-ip>:3001
```

The container expects:

- `/photos` — read-only bind of the host photo-library root
- `/data` — writable bind for snapshots, derivative cache, and saved-filter playlists

Repo layout (single-app TypeScript workspace):

```text
src/client/   React + Vite frontend
src/server/   Fastify backend
src/shared/   types + API contracts shared across client/server
fixtures/     scanner fixtures (library-smoke, library-edge, manifest.json)
playwright/   browser-driven acceptance tests (later phases)
```

## Overview

`photo-wall` should:

- run via Docker against one configured host photo-library root mounted into the container
- operate as a trusted-LAN-only app with no auth boundary and no internet exposure
- recursively discover photos under that root, including likely `year/event/photo` shapes
- render photos large in a tightly packed, gapless wall
- dynamically load more photos as the user keeps browsing the wall
- keep the initial wall crisp with centrally configurable 512px long-edge thumbnails
- support dynamic zoom in/out with a near-instant broad overview and progressively better image detail as the user moves closer
- support true two-axis trackpad panning using browser wheel deltas with a subtle inertial tail
- support single-finger mobile drag panning with restrained release momentum
- support mouse click-drag panning with click suppression after the drag threshold
- show an anchored hover preview on desktop fine pointers at about the midpoint between the current tile size and the eventual full-photo modal size without destabilizing layout
- reliably open a tapped or clicked photo in a simple viewport-sized modal with an explicit `X` close control
- keep the default UI minimal: photos first, with a small circular menu button for filters and playlists
- support **year** and **folder** filters only for the MVP
- persist server-side saved-filter playlists under the writable app-data mount

Month filtering is out of MVP scope.

## Docs

- `docs/product/photo-wall-experience.md` — approved baseline product behavior
- `docs/system/photo-library-source-and-runtime.md` — Docker runtime and library-discovery constraints
- `docs/runbooks/photo-wall-docker-lan.md` — operator setup, startup diagnostics, and troubleshooting flow
- `docs/glossary.md` — shared project language
- `AGENTS.md` — agent rules; `CLAUDE.md` — commands and architecture

## Current focus

- keep the interface photo-first and visually quiet
- preserve a gapless wall layout with dynamic loading
- run from Docker against a configurable photo-library root mounted from the host
- design discovery around recursive folder scanning and year / event organization
- support 2D trackpad panning and mouse click-drag panning rather than a vertical scroll model
- treat the MVP as trusted-LAN-only

## Troubleshooting shortcuts

- `startup failed: library root invalid` usually means `PHOTO_WALL_HOST_LIBRARY_PATH` points at a missing path, a file instead of a directory, or a mount the container cannot read.
- `startup failed: data root invalid` usually means `PHOTO_WALL_HOST_DATA_PATH` points at a non-directory path, an unwritable location, or a path that overlaps the photo-library root instead of staying on a separate writable mount.
- `startup summary` in the server logs reports the resolved library root, data root, cache dir, playlists dir, scan state, warm-load state, snapshot id, and discovered photo count.
- Dev-only escape hatch: set `PHOTO_WALL_SCAN_TOP_LEVEL_YEARS_ONLY=true` to scan only top-level year folders and ignore loose root files plus non-year top-level folders.
- A fresh scan is triggered on startup. Today, the operator-facing way to force a rescan is to restart the container after changing the library contents.

## Follow-up

- choose the ingest, derivative-image, and rendering implementation that satisfies the Docker, LAN, and recursive-library assumptions
- add testing and validation notes once the first UI prototype exists
- refine saved-filter playlist authoring once the minimal menu UI is in place

## Changelog

### 2026-07-31

- Documented subtle two-axis wheel/mobile-drag momentum, reliable tap-to-focus behavior, and the centrally configurable 512px overview-thumbnail target.

### 2026-07-30

- Aligned local Vite onboarding with the repository's stable port `5176` and LAN binding contract.

### 2026-06-10

- Added a discoverability link for the canonical user-intent maintenance rule from the root README.

### 2026-06-03

- Added the optional dev-only `PHOTO_WALL_SCAN_TOP_LEVEL_YEARS_ONLY` escape hatch for noisy local libraries.
- Added operator-facing troubleshooting shortcuts for startup diagnostics, LAN access, and restart-driven rescans.
- Linked the Docker/LAN operator runbook from the canonical docs list.

### 2026-06-02

- Aligned the repo overview with the approved MVP contract: trusted-LAN-only runtime, year and folder filters only, server-side saved-filter playlists, two-axis trackpad and click-drag panning, slight hover enlarge, and a focused-photo modal with `X` close.
- Removed the diagonal-scroll motion model and month filtering from the repo overview.

### 2026-06-01

- Updated the repo overview with the Docker runtime assumption, configurable library-root scanning, and the linked system note.
- Replaced the starter scaffold README with the repo-specific photo-wall product overview and canonical doc links.
