# Working-tree ownership — e01 and media diagnostics

- Status: Ready for hunk-level staging
- Recorded: 2026-07-29
- Branch: `mission/phase1-task1-docs-alignment`

## e01 Large Album Performance

Primary ownership:

- `specs/epics/e01-large-album-performance/`
- `specs/requirements/LARGE_ALBUM_PERFORMANCE.yaml`
- `specs/verifications/e01s*-verify.yaml`
- `specs/verifications/AUDIT-e01-e01s04.md`
- `src/server/media/derivative-service.ts` and its tests
- `src/server/media/cache-key.ts` and its tests
- `src/server/media/source-resolver.ts` and its tests
- `src/shared/api/media.ts` and `src/shared/api/media.test.ts`
- wall layout/culling/camera/scheduler modules and their tests
- `playwright/mobile-pinch-zoom.spec.ts`
- `playwright/single-stream-wrap-continuity.spec.ts`
- `playwright/zoom-detail-tiers.spec.ts`
- mobile-project and assigned-port changes in `playwright.config.ts`

## Media diagnostics

Primary ownership:

- `src/server/media/media-diagnostics.ts` and its tests
- `src/server/routes/media-diagnostics.ts`
- diagnostics instrumentation hunks in `src/server/routes/media.ts`
- `src/client/src/features/wall/mediaLoadDiagnostics.ts` and its tests
- `playwright/media-diagnostics.spec.ts`
- diagnostics sections in `docs/system/photo-library-source-and-runtime.md`
- diagnostics workflow in `docs/runbooks/photo-wall-docker-lan.md`
- `Media diagnostics` entry in `docs/glossary.md`

The `.pi-subagents/artifacts/outputs/db5ded4b/plan.md` proposal is an ephemeral review artifact, not approved canonical scope. Its POST telemetry/batching design is intentionally not part of the implemented contract.

## Shared seams

These files contain both concerns and require hunk-aware staging or one explicitly combined logical commit:

- `src/client/src/features/wall/PixiWallSurface.tsx`
  - e01: priority scheduling, displayed-texture retention, finite cache eviction, Pixi source-lifecycle fixes
  - diagnostics: fixed event recording and image-stage observation
- `src/server/routes/media.ts`
  - e01: versioned/cacheable derivative delivery
  - diagnostics: exactly-once aggregate outcome recording and GET route registration
- `playwright.config.ts`
  - e01: mobile performance project and stable port
  - diagnostics: `media-diagnostics.spec.ts` included in intentional mobile coverage

## Unrelated working-tree areas

Repository scaffold/docs migration, Mosaic Lab implementation, hooks/templates, and other pre-existing changes are not implicitly owned by either e01 or media diagnostics. They must not be staged merely because they are currently dirty.

## Commit preparation rule

Do not use broad `git add .`. Stage explicit files and inspect shared-file hunks with `git diff --cached` before committing. If shared hunks cannot be split without producing a non-runnable intermediate commit, combine e01 and diagnostics as one declared runtime-hardening unit and state that choice in the commit message.
