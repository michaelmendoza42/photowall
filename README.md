# photo-wall
Last edited: 2026-06-02

Minimal Docker-run web app for browsing a configured photo library on the home LAN as a large, gapless photo wall.

## Quick start

Local dev (Vite + Fastify with hot reload):

```bash
npm install
cp .env.example .env   # then edit PHOTO_WALL_HOST_LIBRARY_PATH
npm run dev            # client on :5173, server on :3001
```

Docker (production-style single image):

```bash
cp .env.example .env   # then edit PHOTO_WALL_HOST_LIBRARY_PATH and PHOTO_WALL_HOST_DATA_PATH
docker compose up --build
# health: curl http://localhost:3001/healthz
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
- support true two-axis trackpad panning using browser wheel deltas
- support mouse click-drag panning with click suppression after the drag threshold
- slightly enlarge a photo on hover without destabilizing layout
- open a clicked photo in a simple viewport-sized modal with an explicit `X` close control
- keep the default UI minimal: photos first, with a small circular menu button for filters and playlists
- support **year** and **folder** filters only for the MVP
- persist server-side saved-filter playlists under the writable app-data mount

Month filtering is out of MVP scope.

## Canonical docs

- `docs/product/photo-wall-experience.md` — approved baseline product behavior
- `docs/system/photo-library-source-and-runtime.md` — Docker runtime and library-discovery constraints
- `docs/glossary.md` — shared project language
- `docs/standards/documentation-model.md` — authority and documentation rules
- `AGENTS.md` — repo-wide agent instructions

## Current focus

- keep the interface photo-first and visually quiet
- preserve a gapless wall layout with dynamic loading
- run from Docker against a configurable photo-library root mounted from the host
- design discovery around recursive folder scanning and year / event organization
- support 2D trackpad panning and mouse click-drag panning rather than a vertical scroll model
- treat the MVP as trusted-LAN-only

## Follow-up

- choose the ingest, derivative-image, and rendering implementation that satisfies the Docker, LAN, and recursive-library assumptions
- add testing and validation notes once the first UI prototype exists
- refine saved-filter playlist authoring once the minimal menu UI is in place

## Changelog

### 2026-06-02
- Aligned the repo overview with the approved MVP contract: trusted-LAN-only runtime, year and folder filters only, server-side saved-filter playlists, two-axis trackpad and click-drag panning, slight hover enlarge, and a focused-photo modal with `X` close.
- Removed the diagonal-scroll motion model and month filtering from the repo overview.

### 2026-06-01
- Updated the repo overview with the Docker runtime assumption, configurable library-root scanning, and the linked system note.
- Replaced the starter scaffold README with the repo-specific photo-wall product overview and canonical doc links.
