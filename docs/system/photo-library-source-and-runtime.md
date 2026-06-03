# Photo Library Source and Runtime
Last edited: 2026-06-03
Status: Active
Scope: Docker runtime, configurable photo-library root, trusted-LAN deployment model, and filesystem discovery assumptions
Related files: `../../README.md`, `../product/photo-wall-experience.md`, `../glossary.md`, `README.md`

This note records the current technical shape the project should preserve while implementation is still being designed.

## Context

The intended runtime is Docker. The app should operate against a host photo library exposed to the container as a read-only mount, with configuration pointing at a single library root path. Mutable application state (snapshots, saved-filter playlists, and derivative image cache) belongs on a separate writable mount, not on the photo library mount.

The MVP is explicitly a trusted-LAN-only app: it is intended to run on the operator's home network without auth, accounts, or internet exposure.

## Structure or constraints

- The intended deployment and local runtime model is Docker / Docker Compose.
- The container mounts the source photo library as a read-only path (e.g. `/photos:ro`) and a writable application-data path (e.g. `/data`) for snapshots, saved-filter playlists, and derivative image cache.
- Configuration should point at one photo-library root rather than requiring many per-folder source entries.
- The system should scan that configured root recursively to discover subfolders and photos.
- A likely initial library organization is `<library-root>/<year>/<event>/<photos>`.
- The year → event → photo shape should inform defaults and testing, but discovery should remain folder-driven rather than dependent on a hardcoded catalog.
- Folder filters should be derived from the discovered directory structure beneath the configured root.
- Year-oriented browsing should work naturally with top-level year folders when that structure exists.
- The MVP supports **year** and **folder** filters only; month filtering is intentionally out of scope.
- Saved-filter playlists are persisted server-side under the writable `/data` mount, not on the source photo mount.
- All filesystem access must stay bounded to the configured library root; arbitrary or traversed path access must be rejected.
- The MVP does not include an auth boundary; the runtime assumes a trusted home-LAN network.

## Implications

- The Docker setup should make the host photo-library mount path explicit and easy to change, and should keep the photo mount read-only.
- The Docker setup should also expose an explicit writable mount for app state so derivative caches and saved-filter playlists survive container restarts without polluting the photo library.
- Early implementations should avoid requiring manual registration of every event folder.
- Scan and filtering logic should stay flexible enough to tolerate real-world variation around the likely year/event layout and ignore hidden, unsupported, symlinked, or otherwise unsafe entries.
- The source-of-truth assumption is still a configured filesystem root; future system design can add indexing, snapshot warm-loads, or background rescans, but the configured root remains canonical.
- The trusted-LAN assumption shapes which threats are in scope (e.g. unsafe path access, broken mounts, missing permissions) versus which are out of scope (e.g. hostile internet exposure, multi-user auth).
- Startup diagnostics should make broken mounts, overlapping source/data paths, and unreadable or unwritable roots obvious in operator logs.
- The current MVP scan model is restart-driven from the operator perspective: startup may warm-load a prior snapshot, then runs a fresh scan in the background.

## Related docs

- `../../README.md`
- `../product/photo-wall-experience.md`
- `../glossary.md`
- `README.md`

## Changelog

### 2026-06-03
- Added startup-diagnostics and restart-driven rescan expectations to the runtime note.
- Clarified that source and data roots must stay separate so the writable app-state path does not overlap the photo-library mount.

### 2026-06-02
- Recorded the trusted-LAN-only deployment assumption.
- Added the writable `/data` mount alongside the read-only photo-library mount for snapshots, saved-filter playlists, and derivative image cache.
- Narrowed the documented MVP filter set to **year** and **folder** only and noted that month filtering is intentionally out of scope.
- Added explicit path-safety expectation that filesystem access stays bounded to the configured library root.

### 2026-06-01
- Added the canonical system note for Docker runtime, configured library-root scanning, and the likely year → event → photo source layout.
