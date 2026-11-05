# Photo Library Source and Runtime
Last edited: 2026-10-22
Status: Active
Scope: Docker runtime, configurable photo-library root, trusted-LAN deployment model, and filesystem discovery assumptions
Related files: `../../README.md`, `../product/photo-wall-experience.md`, `../glossary.md`

This note records the current technical shape the project should preserve while implementation is still being designed.

## Context

The intended runtime is Docker. The app operates against one configured host photo library exposed to the container as a read-only mount, unless the curator is allowed to hide photos (see below); the current operator deployment points at `/mnt/sigma/Files/users/michael/Projects/Photography`. Mutable application state (snapshots and derivative image cache) belongs on a separate writable mount, not on the photo library mount. Curation state (album display settings, the default view, the photo-move log, light-edit recipes and share links) lives in its own curation folder, by default `<data root>/curation`.

The MVP is explicitly a trusted-LAN-only app: it is intended to run on the operator's home network without accounts or internet exposure. The one auth boundary is the curator PIN.

## Structure or constraints

- The intended deployment and local runtime model is Docker / Docker Compose.
- The container mounts the source photo library as a read-only path (e.g. `/photos:ro`) and a writable application-data path (e.g. `/data`) for snapshots and derivative image cache.
- Curation is on once a curator PIN exists: chosen on `/curate` (stored scrypt-hashed as `curator-pin` in the curation folder) or, overriding that, set as `PHOTO_WALL_CURATOR_PIN`. Choosing it in the browser needs the one-time `setup-code`, which the server writes to the curation folder and prints in its startup log while no PIN exists. To start over, delete `curator-pin` and restart. Its state lives in the curation folder (`PHOTO_WALL_CURATION_ROOT`, default `<data root>/curation`), which must stay outside the library root. Unlike the snapshot and cache, it can't be rebuilt, so clearing the data root must keep it. Servers that share it (native dev and Docker use the same folder by default) re-read `albums.json` when it changes and before every change, so neither undoes the other's edits.
- The app writes inside the library only to hide or restore a photo, and only when the library mount is writable (checked at startup) and `PHOTO_WALL_LIBRARY_WRITES` isn't set to `false`. A move is a plain rename between an album and its `_hidden` folder, together with the photo's companion files; the app never deletes, copies-then-deletes, or overwrites a file, refuses a move that would cross disks (`EXDEV`), and appends every move to `moves.log` in the curation folder. A move updates the snapshot in place instead of needing a rescan.
- Configuration should point at one photo-library root rather than requiring many per-folder source entries.
- The active library root may be updated from the app at runtime, but the entered path must still be meaningful from the server/container's filesystem perspective rather than the browser client's local path namespace.
- The system should scan that configured root recursively to discover subfolders and photos.
- A likely initial library organization is `<library-root>/<year>/<event>/<photos>`.
- The year → event → photo shape should inform defaults and testing, but discovery should remain folder-driven rather than dependent on a hardcoded catalog.
- Folder filters should be derived from the discovered directory structure beneath the configured root.
- Year-oriented browsing should work naturally with top-level year folders when that structure exists.
- The MVP supports **year** and **folder** filters only; month filtering is intentionally out of scope.
- Share links are persisted server-side in the curation folder, not on the source photo mount. Saved playlists were removed on 2026-10-22; old `playlists/` files in the data root are left alone and unused.
- The wall renderer may consume multiple derivative tiers (for example thumb, wall, and near-view derivatives) so the client can show a broad overview quickly and refine detail as zoom increases.
- There is one supported wall implementation path: a Pixi-first wall used for both single-stream and grouped browsing.
- Single-stream versus grouped browsing is a layout-mode distinction derived from the active album-area count, not a user-facing renderer choice.
- Do not reintroduce a query-param, operator-facing toggle, or silent fallback that swaps the wall onto an older renderer path.
- All filesystem access must stay bounded to the configured library root; arbitrary or traversed path access must be rejected.
- The only auth boundary is the curator PIN: a correct PIN sets an HttpOnly, SameSite=Strict session cookie signed with a secret kept in the curation folder. Changing the PIN signs every curator out. Viewers need no login. The runtime still assumes a trusted home-LAN network.
- Curation is enforced on the server: the photo query, library facets and media route only serve what the visitor may see. Viewers never get photos in storage or in `_hidden` folders, even by asking for them directly.

## Implications

- The Docker setup should make the host photo-library mount path explicit and easy to change, and should keep the photo mount read-only unless the operator turns on hiding photos.
- Any runtime root-change UI should persist its chosen root under the writable data mount, not in ephemeral browser-only state.
- A browser directory picker can only be a best-effort prefill helper because many trusted-LAN deployments do not share the same filesystem namespace between the browser device and the backend runtime.
- The Docker setup should also expose an explicit writable mount for app state so derivative caches survive container restarts without polluting the photo library, and may mount the curation folder separately so it can be backed up and shared between servers that read the same library.
- Early implementations should avoid requiring manual registration of every event folder.
- Scan and filtering logic should stay flexible enough to tolerate real-world variation around the likely year/event layout and ignore hidden, unsupported, symlinked, or otherwise unsafe entries.
- The source-of-truth assumption is still a configured filesystem root; future system design can add indexing, snapshot warm-loads, or background rescans, but the configured root remains canonical.
- The active wall renderer is a Pixi-first wall scene for both single-stream and grouped browsing, using zoom-aware derivative selection instead of a pure DOM image wall or a full deep-zoom tile-pyramid viewer.
- Future wall changes should preserve that one-path model and extend layout modes or interaction layers in place rather than reviving a renderer-selection seam.
- The trusted-LAN assumption shapes which threats are in scope (e.g. unsafe path access, broken mounts, missing permissions) versus which are out of scope (e.g. hostile internet exposure, multi-user auth).
- Startup diagnostics should make broken mounts, overlapping source/data paths, and unreadable or unwritable roots obvious in operator logs.
- Media diagnostics are bounded, in-memory aggregates split across the server media pipeline and the browser texture pipeline. They use fixed dimensions and must not retain photo IDs, filesystem paths, media URLs, or arbitrary error text.
- The server exposes the current aggregate snapshot at `/api/diagnostics/media`; the browser exposes its page-lifetime texture snapshot as `photoWallMediaDiagnostics.snapshot()` in DevTools. These are diagnostic probes, not durable analytics or production monitoring.
- The current MVP scan model is restart-driven from the operator perspective: startup warm-loads the prior snapshot and the wall serves it straight away while a fresh scan runs in the background. The rescan reuses recorded dimensions for files whose size and modified time are unchanged, so it is mostly a directory walk; when it finds nothing new it keeps the snapshot and its id, so open walls keep their layout. A wall that opened from the saved snapshot reloads its photos only when the rescan produced a new snapshot.

## Related docs

- `../../README.md`
- `../product/photo-wall-experience.md`
- `../glossary.md`

## Changelog

### 2026-11-01 (light editing)
- Light edits are stored as recipes (`edits.json`, logged in `edits.log`) in the curation folder and applied when the server renders derivatives; edited derivatives get their own cache keys, unedited ones keep theirs. Editing never writes to the library.

### 2026-11-01
- The wall no longer waits for the background rescan after a restart; rescans reuse unchanged files' metadata and keep the snapshot when nothing changed.
- The curator PIN can be chosen in the browser with a logged one-time setup code; library writes now default on and depend on the mount being writable.

### 2026-10-22
- Added curation: the curator PIN, the curation folder, server-side visibility enforcement, and the opt-in library writes for hiding photos (rename-only, logged, no overwrites, no cross-disk moves). Replaced saved-filter playlists with share links stored in the curation folder.

### 2026-07-30
- Clarified that the recorded operator library path is a deployment value, while the repository contract remains configurable.

### 2026-07-29
- Added the bounded server/browser media-diagnostics boundary and its privacy constraints.

### 2026-07-16
- Recorded `/mnt/sigma/Files/users/michael/Projects/Photography` as the current operator deployment's host photo-library root.

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
