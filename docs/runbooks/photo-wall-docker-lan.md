# Photo Wall Docker/LAN Operator Runbook
Last edited: 2026-11-05
Status: Active
Owner: Michael
Related files: `../../README.md`, `../system/photo-library-source-and-runtime.md`, `../product/photo-wall-experience.md`, `../../compose.yaml`, `../../deploy/compose.portainer.yaml`, `../../.env.example`

Repeatable setup, startup, and troubleshooting procedure for running `photo-wall` on a trusted home LAN.

## Production

Production is the Portainer stack `photo-wall` on mmdebian: `http://mmdebian.local:8092/`. It deploys only when Michael pushes `main` from mmdebian. A post-push hook starts project-admin's `portfolio-deploy-sync@photo-wall`, which builds the exact pushed commit, checks a candidate container's `/healthz`, then updates the stack through homelab-admin's `portainer-control`. Never start, rebuild, recreate, or retag the production container by hand; policy is `~/Projects/Code/project-admin/docs/standards/app-deployment.md`.

`deploy/compose.portainer.yaml` is the reference copy of the stack. Production:

- mounts the library writable at `/photos`, so the curator can hide photos;
- keeps its own data root at `/home/michael/docker/photo-wall/data` (snapshot, thumbnail cache, playlists). It is separate from the native dev server's `.photo-wall-data` because the snapshot and the library-root override record the library path each server sees (`/photos` in the container, `/mnt/hateno/...` natively), so a shared data root would make each server rescan over the other's snapshot;
- shares curation with the native dev server by mounting the dev checkout's `.photo-wall-data/curation` at `/curation`;
- runs as uid 1000, so files it creates (including `_hidden` folders) stay owned by michael.

The native dev server managed by the LAN Services dashboard stays on `http://mmdebian.local:5176/`.

The steps below run a **local Docker preview** (`compose.yaml`: project `photo-wall-local`, image `photo-wall:local`, port 8093). Use it to debug a container-only problem before pushing; it never touches production.

## Purpose

Use this runbook when you need to:

- configure the host photo-library path and writable app-data path
- start the app with Docker Compose
- confirm the app is reachable on localhost and the LAN
- interpret startup diagnostics when mounts or permissions are wrong
- force a fresh library scan with the current MVP runtime

## Steps

1. Copy the env template and set host paths:

   ```bash
   cp .env.example .env
   ```

   Required keys:

   - `PHOTO_WALL_HOST_LIBRARY_PATH` — host path to the source photo library (the current operator host uses `/mnt/sigma/Files/users/michael/Projects/Photography`)
   - `PHOTO_WALL_LOCAL_DATA_PATH` — host path for the preview's writable app state (default `./.photo-wall-data-local`; create it first so it's owned by you)
   - `PHOTO_WALL_LOCAL_PORT` — preview host port (default `8093`)

   Optional dev-only key:

   - `PHOTO_WALL_SCAN_TOP_LEVEL_YEARS_ONLY=true` — scan only top-level year folders like `2020/`, `2022/`, `2025/` and ignore loose root files plus non-year top-level folders such as `Lightroom/` or `Screenshots/`

   Optional curation keys (see [Curation](#curation)):

   - `PHOTO_WALL_CURATOR_PIN` — sets the curator PIN instead of choosing it on `/curate`
   - `PHOTO_WALL_HOST_CURATION_PATH` — host folder for curation state, mounted at `/curation` (default: dev's `./.photo-wall-data/curation`)
   - `PHOTO_WALL_LIBRARY_READ_ONLY=false` — mounts the library writable so the curator can hide photos

2. Confirm the library path is the **source** library and the data path is a **separate writable** directory.

   Expected runtime discipline:

   - source library mount → `/photos` **read-only**
   - app data mount → `/data` **writable**

   Do not point the data path into the photo library tree.

3. Start the preview:

   ```bash
   mkdir -p .photo-wall-data-local
   docker compose up -d --build
   ```

4. Watch the early startup logs. A healthy boot should include:

   - `photo-wall starting`
   - `startup summary`
   - `photo-wall listening`
   - `library scan completed` (either immediately or shortly after listen)

5. Validate localhost reachability:

   ```bash
   curl http://localhost:${PHOTO_WALL_LOCAL_PORT:-8093}/healthz
   ```

6. Validate LAN reachability from another device on the same network:

   ```text
   http://mmdebian.local:8093/
   ```

   Production is on `8092` and the native dev server on `5176`. The bare hostname (`http://mmdebian.local/`) is a different service on port 80.

7. If the app opens with the wrong or missing root, use the in-app root editor:

   - open the wall UI
   - if the library is unavailable, use the root form shown on that state screen
   - otherwise open the circular controls menu and use the `Library root` form there
   - prefer entering the server-visible/container-visible path explicitly
   - use `Use local picker` only as a convenience prefill when the browser can reveal a compatible path

8. If the library contents changed and you need a fresh scan, use **Rescan library** in the curator section of the menu, or restart the app:

   ```bash
   docker compose restart app   # preview only; production restarts through Portainer
   ```

   A scan runs on startup; the curator can also start one from the menu.

## Curation

Curation is off until a curator PIN exists. To choose one:

1. Find the setup code: the startup log line `curation is off until a curator PIN is chosen` shows it, and it's saved as `setup-code` in the curation folder (`docker compose logs app | grep setup` or `cat <curation folder>/setup-code`).
2. Open `http://<host>:<port>/curate`, enter the setup code and a PIN, and click **Set PIN**.

To start over (forgotten PIN), delete `curator-pin` from the curation folder and restart; a new setup code is printed. `PHOTO_WALL_CURATOR_PIN` in `.env` still works and overrides the chosen PIN.

With curation on:

- every album starts **in storage**; viewers see nothing until the curator unlocks the menu with the PIN and puts albums on display
- the curator's settings, the photo-move log (`moves.log`) and share links live in `/curation`; this folder can't be rebuilt, so include it in backups and never delete it when clearing `/data`
- changing the PIN signs the curator out everywhere

To let the curator **hide photos**, which moves each one into a `_hidden` folder inside its album and never deletes anything:

1. Set `PHOTO_WALL_LIBRARY_READ_ONLY=false` in `.env`.
2. `docker compose up -d` so the preview's library is remounted writable. Production already mounts it writable.

Hide appears for the curator whenever the library is writable. Set `PHOTO_WALL_LIBRARY_WRITES=false` to forbid it anyway.

The container runs as uid 1000 (michael), so `_hidden` folders it creates are owned by michael on the host. Hidden photos keep their owner and dates. To put a photo back by hand, move it out of `_hidden` and rescan; `moves.log` lists every move the app made.

Production and the preview both mount `./.photo-wall-data/curation`, the same folder the native dev server uses, so dev and prod on this machine share curation with no setting. Each server notices the other's changes within a second, and a change always starts from the latest saved settings, so curating on both never undoes the other's work. To move the folder, set `PHOTO_WALL_CURATION_ROOT` (native) and `PHOTO_WALL_HOST_CURATION_PATH` (Docker) to the same path outside the library.

## Validation

A successful run should give you all of the following:

- `curl /healthz` returns success
- the browser loads the wall UI
- the server logs include a `startup summary` entry with:
  - resolved library root
  - resolved data root
  - cache dir
  - curation root, whether curation is on, and whether library writes are on
  - scan state
  - warm-load state
  - snapshot id when available
  - discovered photo count and warning count
- a later `library scan completed` log reports snapshot id, schema version, photo count, warning count, folder count, year count, and scan duration

## Rollback

For production, roll back by pushing a fix or revert to `main`, or follow project-admin's `docs/runbooks/on-host-deployment.md` rollback; never recreate the container by hand.

If the preview fails to start or points at the wrong paths:

1. Stop the preview:

   ```bash
   docker compose down
   ```

2. Fix `.env` or the host mount directories.
3. Start again with `docker compose up -d --build`.
4. If the writable app-data directory contains bad test state you want to discard, remove only the configured data path — never the source photo-library path, and never the curation folder (by default `<data root>/curation` for native runs).

## Common failure modes

### `startup failed: library root invalid`

Typical causes:

- `PHOTO_WALL_HOST_LIBRARY_PATH` does not exist
- the path points at a file instead of a directory
- Docker can mount it, but the app cannot read it inside the container

Checks:

```bash
ls -ld "$PHOTO_WALL_HOST_LIBRARY_PATH"
```

### `startup failed: data root invalid`

Typical causes:

- `PHOTO_WALL_HOST_DATA_PATH` points at a file instead of a directory
- the directory is not writable
- the data path overlaps the library path instead of staying separate

Checks:

```bash
ls -ld "$PHOTO_WALL_HOST_DATA_PATH"
test -w "$PHOTO_WALL_HOST_DATA_PATH" && echo writable
```

### App starts but the wall is empty

Check the `startup summary` and `library scan completed` logs first:

- `photoCount: 0` means the configured source root did not yield supported photos
- non-zero `warningCount` means the scan completed but skipped some entries
- `warmLoaded: true` means the app initially served a prior snapshot before the new scan finished
- if the root shown in the UI is wrong, change it from the in-app `Library root` form before rebuilding containers or editing hidden state

Then inspect the bounded media diagnostics:

```bash
curl -s http://localhost:8092/api/diagnostics/media   # production; 8093 for the preview | jq
```

Interpret the evidence in this order:

- `library_not_ready`, `library_scan_failed`, or `no_photos_discovered` means the problem precedes image requests; inspect the library status and scan logs.
- `no_media_requests_seen` with a non-empty library means the browser has metadata but has not reached the server media route; inspect browser console/network state.
- `source_resolution_failures` points to stale snapshot entries, unreadable source files, or root-containment rejection.
- `derivative_delivery_failures` means a Sharp generation or response-stream failure was last observed within the previous five minutes. Its `cumulativeCount` is process-lifetime context, not a five-minute-window count.
- `derivative_backpressure` means cold derivative work is queued; it may explain slow appearance without implying permanent failure.
- A high `success_rendered` count followed by `success_cache_hit` counts means completed responses have been observed from the server media path; if the wall is still blank, inspect the browser texture stages next.

In the browser DevTools console, run:

```js
photoWallMediaDiagnostics.snapshot()
```

The browser snapshot separates `requested`, `image_ready`, `texture_created`, and `sprite_applied` stages. `load_failed` indicates browser/network image loading failed, `texture_create_failed` indicates Pixi could not create a texture, `decode_fallback` records recovery through the native image load event, and `superseded` is normally expected when a tile or zoom tier changes before an earlier request completes.

Both snapshots are process/page-lifetime aggregates and contain no photo IDs, filesystem paths, or media URLs. Browser refresh and server restart reset them.

## Related docs

- `../../README.md`
- `../system/photo-library-source-and-runtime.md`
- `../product/photo-wall-experience.md`
- `../../compose.yaml`
- `../../deploy/compose.portainer.yaml`
- `../../.env.example`

## Changelog

### 2026-11-05
- Production is the Portainer stack `photo-wall` on port 8092, deployed by pushing `main`; `compose.yaml` became the isolated local preview on 8093 with its own data folder; containers run as uid 1000.

### 2026-11-01
- The curator PIN is chosen on `/curate` with the logged setup code; hiding photos only needs a writable library mount.

### 2026-10-22
- Added the curation settings, the `/curation` mount, and the steps to let the curator hide photos; the curator can now start a rescan from the menu.

### 2026-07-30
- Clarified the current operator library path and the managed LAN route without turning either into a portable repository default.

### 2026-07-29
- Added the server and browser media-diagnostics commands plus an ordered interpretation guide for empty or non-loading pictures.

### 2026-07-17
- Recorded the current deployment route `http://mmdebian.local:5176/` while preserving the configured/default Compose-port procedure, and clarified that the bare hostname is not Photo Wall.

### 2026-07-16
- Recorded `/mnt/sigma/Files/users/michael/Projects/Photography` as the current operator host library path.

### 2026-06-10
- Added the operator-facing in-app library-root recovery step and clarified when the local picker is only a best-effort prefill helper.

### 2026-06-03
- Added the optional dev-only `PHOTO_WALL_SCAN_TOP_LEVEL_YEARS_ONLY` escape hatch for noisy local libraries.
- Added the operator runbook for Docker startup, LAN access, restart-driven rescans, and startup-diagnostics interpretation.
