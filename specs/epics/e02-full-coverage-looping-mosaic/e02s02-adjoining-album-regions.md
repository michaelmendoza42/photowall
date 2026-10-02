# e02s02 — Browse Adjoining Album Regions and Navigate Their Centers

Status: Draft; implementation gated by G0 and plan approval
Owner: Pi for Michael
Expires when: Story acceptance is recorded
Promote to: Existing product/system docs for accepted geometry contracts

## 1. Business narrative
Multiple albums should feel like neighboring regions of one continuous photo map, not disconnected islands surrounded by black space. Irregular borders are welcome; users still need reliable directions toward each album's center.

## 2. Actors
Michael browsing a year or multiple folders on desktop/mobile and following album signposts.

## 3. Value and complexity
8 BCP; risk P0. Delivers complete grouped browsing and center navigation end to end. If G0 reveals this cannot stay within one coherent slice, split by demonstrable grouped behavior before coding rather than inventing a models-only story.

## 4. Preconditions and dependencies
G0 passed with representative visual approval; e02s01's complete-period/copy-identity proof is available. Scope PW-MOSAIC-02/03/04/06. Album-region geometry is an internal contract shared with Mosaic Lab and signposts.

## 5. Main flow
Select multiple albums → see touching, recognizable regions with irregular borders → browse across a boundary and map seam → reveal a destination signpost → glide toward that album's center → open and close a photo.

## 6. Alternative flows
Unequal album sizes, a temporarily delayed album page, a region crossing the map seam, a dominant currently visible album, and a modal opened during navigation. Resize or append photos without persistent gaps or pointless full-map reshuffling.

## 7. Requirements
### MODIFIED — PW-MOSAIC-03: adjoining regions
**Before:** album footprints are independently packed into a clustered, separated arrangement that intentionally leaves unoccupied geometry.
**After:** selected albums occupy touching, recognizable regions of one covered period. Borders may intermix neighbors and vary irregularly; there are no blank gutters or rigid-box requirements.

### MODIFIED — PW-MOSAIC-04: center navigation
**Before:** directional navigation uses anchors from sparse album footprints.
**After:** destinations are stable centers representing the new canonical album regions, repeated consistently with the map and reached through the nearest appropriate wrap path. Existing idle/modal/dominant-album suppression remains unchanged.

### MODIFIED — PW-MOSAIC-02: grouped repetition
**Before:** wrapping repeats sparse grouped geometry and its blank space.
**After:** wrapping repeats a complete stable grouped period, maintaining source-photo/album identity and equivalent center geometry.

## 8. Module purpose, callers, contracts
`albumAreas.ts`/`groupedWall.ts` derive selected regions and deterministic album shuffle consumed by grouped views, wall shells and Mosaic Lab. `groupedPacker.ts` generates grouped rows for `WallCanvas`. Preserve selection/album keys while replacing separated-footprint assumptions. `signposts.ts`/`signpostNavigation.ts` consume center/world geometry; retain shortest wrapped targeting and suppression rules.

## 9. Implementation direction
Apply G0's selected shared full-period geometry and local region assignment. Retain deterministic seed/order semantics and modest cropping. Region metadata and rendered photos must share one coordinate system. A torus-crossing album's representative center must not be computed by blindly averaging opposite-edge coordinates into an unrelated album. Avoid global random mixing and independent rectangular album boxes.

## 10. Data and identity
Every tile keeps the correct source `photoId` and `albumKey`. Repeated source placements retain separate instance keys. Album center metadata describes the canonical region, not whichever copies are currently mounted. No server records or persisted playlist formats change.

## 11. Boundaries and compatibility
Retain year/folder filtering, grouped completeness loading, stable shuffle for unchanged loaded inputs, signpost set bounds, dominant-region suppression and modal behavior. Keep the production-layout reuse path for Mosaic Lab; do not make a separate lab-only solution.

## 12. Failure modes
Scattered islands survive under repeated copies; one album dominates all fillers; small selected albums vanish; regions become hard stripes/boxes; centers point into unrelated content; wraps choose the wrong long route; duplicate placements inflate dominant-album coverage counts; unloaded albums stall later pages. Protect each with geometry or browser checks and visual review.

## 13. Performance
Maintain cached layout and bounded visible render instances. Signpost calculations should consume region metadata and visible geometry rather than repacking all photos per frame. Preserve e01's texture/sprite limits.

## 14. Fixtures and oracle
Use equal 50/50 and unequal 50/150 mixed-aspect albums, a third album, and staged/delayed pages. Reuse the shared coverage oracle and add album ownership, region-center stability, toroidal center/target and repeat-instance identity checks. Geometry proves no gaps; screenshots and human review establish whether regions remain recognizable and borders suitably irregular.

## 15. Implementation steps
1. Add failing grouped full-period, identity, center and unequal-album cases using the shared fixture/oracle → verify: `npx vitest run src/client/src/features/wall/__tests__/groupedMosaicCoverage.test.ts`
2. Integrate the selected adjoining-region layout and stable center metadata without regressing single view or loading → verify: `npx vitest run src/client/src/features/wall/__tests__/groupedPacker.test.ts src/client/src/features/wall/__tests__/groupedWall.test.ts src/client/src/features/wall/__tests__/albumAreas.test.ts src/client/src/features/wall/__tests__/groupedLoading.test.ts src/client/src/features/wall/__tests__/groupedMosaicCoverage.test.ts`
3. Adapt signpost/target consumers and prove wrapped center navigation with unchanged suppression rules → verify: `npx vitest run src/client/src/features/wall/__tests__/signposts.test.ts src/client/src/features/wall/__tests__/signpostNavigation.test.ts && npx playwright test playwright/mosaic-regions.spec.ts --project=chromium-desktop --workers=1 && npx playwright test playwright/mosaic-regions.spec.ts --project=chromium-mobile --workers=1`
4. Verify existing grouped view/filter behavior plus type safety → verify: `npm run typecheck && npx playwright test playwright/grouped-album-areas.spec.ts playwright/grouped-signposts.spec.ts playwright/wall-layout-modes.spec.ts --project=chromium-desktop --workers=1`

## 16. Verification procedure
In isolated fixtures, browse touching boundaries and all wrap corners at supported scales. Navigate from near each seam to an album center and inspect the shortest glide, source region and destination. Open a repeated boundary tile and close it; check modal suppression and filter reload. Capture desktop/mobile grouped screenshots at equal/unequal sizes and record Michael's composition review. Preserve diagnostics showing page completeness and no new console/network failures.

## 17. Acceptance criteria
```gherkin
Scenario: Adjoining recognizable album regions
  Given two or more loaded albums with at least 50 photos each
  When the user browses the grouped map at supported zooms
  Then the viewport is covered without empty separators
  And each selected album retains a recognizable region
  And borders may intermix neighboring photos without rigid boxes
Scenario: Center navigation through a seam
  Given a destination album whose nearest repeated center crosses a map edge
  When the user activates its visible signpost
  Then the camera glides toward that center by the appropriate shortest wrap path
  And idle, dominant-album and modal suppression rules remain protected
Scenario: Stable grouped repetition and delayed data
  Given unchanged loaded inputs
  When the user completes a horizontal, vertical or diagonal loop
  Then album centers and canonical photo placements are unchanged
  When a pending page supplies more photos
  Then the layout remains usable without losing album identity or starving remaining pages
```

## 18. Out of scope
Replacing Pixi, changing persistence/media delivery, flattening albums into one random mixture, rigid album rectangles, a lab redesign, or revising signpost visibility UX independently of center geometry.

## 19. Rollback and stop rules
Keep one writer across grouped metadata, packing and navigation seams. Stop if centers cannot represent their actual regions, all loaded photos are not reachable, or crop/duplication becomes excessive. Do not preserve old separated-footprint tests by lying about the new geometry; update only tests whose governing behavior was explicitly changed and retain unrelated protections.

## 20. Delivery evidence and handoff
Record new/regression unit and browser results, repeated-photo activation, source/instance identity checks, representative screenshots and composition approval. Preserve the e01 performance baseline and state any existing unrelated failures. Hand off the covered grouped map and center contract to e02s03 for final overview tuning.
