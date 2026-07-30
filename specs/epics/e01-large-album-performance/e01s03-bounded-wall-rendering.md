# e01s03 — Bounded Wall Rendering

## Purpose
Keep panning and zooming a large album responsive by separating stable layout work from camera projection and by bounding texture work.

## Requirement delta

### MODIFIED — Large-album interaction
**Before:** camera updates can repack loaded photos, cull rows linearly, and start unbounded texture loads.

**After:** packing is stable between data changes, culling is indexed, camera publication is frame-bounded, and visible texture work is prioritized and bounded.

## Acceptance criteria

```gherkin
Scenario: sustained pan
  Given a loaded large album
  When the user pans continuously
  Then camera updates do not repack unchanged photo layout
  And visible rows and textures remain bounded

Scenario: tier transition
  Given a visible thumbnail sprite
  When the user zooms to wall or modal detail
  Then the prior texture remains visible until replacement succeeds
  And a failed replacement does not leave a black tile
```

## Tasks
1. Cache layout and binary-search visible rows → verify: `npx vitest run src/client/src/features/wall/__tests__/singleStreamSceneModel.test.ts src/client/src/features/wall/__tests__/singleStreamRenderWindow.test.ts src/client/src/features/wall/__tests__/virtualization.test.ts --pool=threads --maxWorkers=1 --minWorkers=1`
2. Publish camera state at animation-frame cadence while preserving drag/wrap/mobile behavior → verify: `npx playwright test playwright/mobile-pinch-zoom.spec.ts playwright/single-stream-wrap-continuity.spec.ts --project=chromium-mobile`
3. Add bounded prioritized texture loading, failure handling, and eviction → verify: `npx vitest run src/client/src/features/wall/__tests__/pixiScene.test.ts --pool=threads --maxWorkers=1 --minWorkers=1`

## Risks and rollback
Keep one Pixi-first renderer. Texture eviction cannot destroy active sprite textures; direction-neutral pagination remains a separately measured pivot.
