# Photo Wall Docker/LAN Operator Runbook
Last edited: 2026-06-10
Status: Active
Owner: Michael
Related files: `../../README.md`, `../system/photo-library-source-and-runtime.md`, `../product/photo-wall-experience.md`, `../../docker-compose.yml`, `../../.env.example`

Repeatable setup, startup, and troubleshooting procedure for running `photo-wall` on a trusted home LAN.

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

   - `PHOTO_WALL_HOST_LIBRARY_PATH` — host path to the source photo library
   - `PHOTO_WALL_HOST_DATA_PATH` — host path for writable app state
   - `PHOTO_WALL_PORT` — host/container port (default `3001`)

   Optional dev-only key:

   - `PHOTO_WALL_SCAN_TOP_LEVEL_YEARS_ONLY=true` — scan only top-level year folders like `2020/`, `2022/`, `2025/` and ignore loose root files plus non-year top-level folders such as `Lightroom/` or `Screenshots/`

2. Confirm the library path is the **source** library and the data path is a **separate writable** directory.

   Expected runtime discipline:

   - source library mount → `/photos` **read-only**
   - app data mount → `/data` **writable**

   Do not point the data path into the photo library tree.

3. Start the production-style stack:

   ```bash
   docker compose up --build
   ```

4. Watch the early startup logs. A healthy boot should include:

   - `photo-wall starting`
   - `startup summary`
   - `photo-wall listening`
   - `library scan completed` (either immediately or shortly after listen)

5. Validate localhost reachability:

   ```bash
   curl http://localhost:${PHOTO_WALL_PORT:-3001}/healthz
   ```

6. Validate LAN reachability from another device on the same network:

   ```text
   http://<host-lan-ip>:<PHOTO_WALL_PORT>
   ```

7. If the app opens with the wrong or missing root, use the in-app root editor:

   - open the wall UI
   - if the library is unavailable, use the root form shown on that state screen
   - otherwise open the circular controls menu and use the `Library root` form there
   - prefer entering the server-visible/container-visible path explicitly
   - use `Use local picker` only as a convenience prefill when the browser can reveal a compatible path

8. If the library contents changed and you need a fresh scan, restart the app:

   ```bash
   docker compose restart app
   ```

   Current MVP behavior: a scan is triggered on startup; there is no operator-facing manual rescan endpoint yet.

## Validation

A successful run should give you all of the following:

- `curl /healthz` returns success
- the browser loads the wall UI
- the server logs include a `startup summary` entry with:
  - resolved library root
  - resolved data root
  - cache dir
  - playlists dir
  - scan state
  - warm-load state
  - snapshot id when available
  - discovered photo count and warning count
- a later `library scan completed` log reports snapshot id, schema version, photo count, warning count, folder count, year count, and scan duration

## Rollback

If startup fails or the app points at the wrong paths:

1. Stop the stack:

   ```bash
   docker compose down
   ```

2. Fix `.env` or the host mount directories.
3. Start again with `docker compose up --build`.
4. If the writable app-data directory contains bad test state you want to discard, remove only the configured data path — never the source photo-library path.

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

## Related docs

- `../../README.md`
- `../system/photo-library-source-and-runtime.md`
- `../product/photo-wall-experience.md`
- `../../docker-compose.yml`
- `../../.env.example`

## Changelog

### 2026-06-10
- Added the operator-facing in-app library-root recovery step and clarified when the local picker is only a best-effort prefill helper.

### 2026-06-03
- Added the optional dev-only `PHOTO_WALL_SCAN_TOP_LEVEL_YEARS_ONLY` escape hatch for noisy local libraries.
- Added the operator runbook for Docker startup, LAN access, restart-driven rescans, and startup-diagnostics interpretation.
