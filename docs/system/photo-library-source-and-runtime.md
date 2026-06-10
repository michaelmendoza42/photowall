# Photo Library Source and Runtime
Last edited: 2026-06-10
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
- The active library root may be updated from the app at runtime, but the entered path must still be meaningful from the server/container's filesystem perspective rather than the browser client's local path namespace.
- The system should scan that configured root recursively to discover subfolders and photos.
- A likely initial library organization is `<library-root>/<year>/<event>/<photos>`.
- The year → event → photo shape should inform defaults and testing, but discovery should remain folder-driven rather than dependent on a hardcoded catalog.
- Folder filters should be derived from the discovered directory structure beneath the configured root.
- Year-oriented browsing should work naturally with top-level year folders when that structure exists.
- The MVP supports **year** and **folder** filters only; month filtering is intentionally out of scope.
- Saved-filter playlists are persisted server-side under the writable `/data` mount, not on the source photo mount.
- The wall renderer may consume multiple derivative tiers (for example thumb, wall, and near-view derivatives) so the client can show a broad overview quickly and refine detail as zoom increases.
- There is one supported wall implementation path: a Pixi-first wall used for both single-stream and grouped browsing.
- Single-stream versus grouped browsing is a layout-mode distinction derived from the active album-area count, not a user-facing renderer choice.
- Do not reintroduce a query-param, operator-facing toggle, or silent fallback that swaps the wall onto an older renderer path.
- All filesystem access must stay bounded to the configured library root; arbitrary or traversed path access must be rejected.
- The MVP does not include an auth boundary; the runtime assumes a trusted home-LAN network.

## Implications

- The Docker setup should make the host photo-library mount path explicit and easy to change, and should keep the photo mount read-only.
- Any runtime root-change UI should persist its chosen root under the writable data mount, not in ephemeral browser-only state.
- A browser directory picker can only be a best-effort prefill helper because many trusted-LAN deployments do not share the same filesystem namespace between the browser device and the backend runtime.
- The Docker setup should also expose an explicit writable mount for app state so derivative caches and saved-filter playlists survive container restarts without polluting the photo library.
- Early implementations should avoid requiring manual registration of every event folder.
- Scan and filtering logic should stay flexible enough to tolerate real-world variation around the likely year/event layout and ignore hidden, unsupported, symlinked, or otherwise unsafe entries.
- The source-of-truth assumption is still a configured filesystem root; future system design can add indexing, snapshot warm-loads, or background rescans, but the configured root remains canonical.
- The active wall renderer is a Pixi-first wall scene for both single-stream and grouped browsing, using zoom-aware derivative selection instead of a pure DOM image wall or a full deep-zoom tile-pyramid viewer.
- Future wall changes should preserve that one-path model and extend layout modes or interaction layers in place rather than reviving a renderer-selection seam.
- The trusted-LAN assumption shapes which threats are in scope (e.g. unsafe path access, broken mounts, missing permissions) versus which are out of scope (e.g. hostile internet exposure, multi-user auth).
- Startup diagnostics should make broken mounts, overlapping source/data paths, and unreadable or unwritable roots obvious in operator logs.
- The current MVP scan model is restart-driven from the operator perspective: startup may warm-load a prior snapshot, then runs a fresh scan in the background.

## Related docs

- `../../README.md`
- `../product/photo-wall-experience.md`
- `../glossary.md`
- `README.md`

## Changelog

### 2026-06-10
- Clarified that the Pixi-first wall is now the only supported wall implementation path, with single-stream and grouped browsing treated as layout modes rather than renderer choices.
- Explicitly retired query-param and fallback-style renderer switching from the supported runtime model.
- Updated the renderer note to record that the active Pixi-first wall now covers both single-stream and grouped browsing.

### 2026-06-07
- Added the zoom-aware derivative-tier expectation for the wall renderer.
- Recorded the current system direction as a Pixi-based wall scene rather than a pure DOM wall.


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
