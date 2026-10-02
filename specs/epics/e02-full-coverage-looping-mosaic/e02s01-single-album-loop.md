# e02s01 — Browse a Fully Covered Single-album Loop

Status: Draft; implementation gated by G0 and plan approval
Owner: Pi for Michael
Expires when: Story acceptance is recorded
Promote to: Existing product/system docs for accepted contracts

## 1. Business narrative
A person browsing an album should see photos across the entire window rather than a narrow strip or gaps at wrap boundaries. Returning through a loop must preserve spatial familiarity.

## 2. Actors
Michael using the desktop or mobile wall with a friendly 50+ photo album.

## 3. Value and complexity
5 BCP; risk P0 under the planning rubric for shared core geometry. Delivers a usable full-coverage single-album loop independently of grouped-region changes.

## 4. Preconditions and dependencies
G0 in `PLAN.md` has demonstrated complete-period geometry and has recorded composition approval. The approved source is `specs/planning-context.yaml`; requirements PW-MOSAIC-01/02/06. No sensitive server boundary changes.

## 5. Main flow
Open an album → view a filled window → pan through horizontal/vertical/corner seams → return to the same arrangement → open a repeated photo → close it into the same browsing context.

## 6. Alternative flows
At minimum existing zoom, expose several copies without blank space. Rotate/resize the window or append a page while near a seam; preserve a usable photo/screen anchor. Empty/loading/error states retain existing behavior rather than inventing images.

## 7. Requirements
### MODIFIED — PW-MOSAIC-01: full-period coverage
**Before:** columns span width, but their different end heights are not proven to cover the whole tallest-column repeat rectangle; repeated render geometry can expose layout voids.
**After:** loaded single-album geometry and its wrapped projection cover the viewport at every supported pan phase and zoom, with no unoccupied side bands, tail gaps, or corners.

### MODIFIED — PW-MOSAIC-02: stable photo copies
**Before:** repeat helpers preserve copy positions, but tests do not comprehensively prove full-period coverage and repeat-instance interaction.
**After:** unchanged loaded inputs have identical canonical placements after any integral X/Y travel or zoom round trip; every repeated placement opens the correct source photo.

## 8. Module purpose, callers, contracts
`packer.ts` produces column tiles/bands for single-stream scene models and grouped packing; preserve deterministic identity, positive geometry, crop bounds and loaded-photo reachability. `singleStreamSceneModel.ts` and `singleStreamRenderWindow.ts` feed `SingleStreamWallView`; preserve cache boundaries and bounded copy enumeration. `virtualization.ts` is shared with `WallCanvas`; no new camera/zoom-dependent repacking.

## 9. Implementation direction
Use G0's selected complete-period construction, extending existing packing and wrap helpers. Keep a single canonical placement model and project it to both Pixi visuals and DOM hit targets. Only change camera transforms if runtime evidence identifies a discrepancy. Distinguish repeated placement count from unique loaded-photo count. Do not add another renderer.

## 10. Data and identity
Photo IDs remain source identity. Within-period duplicates need unique placement identity; wrapped instances add period offsets. Existing API records/cursors are unchanged. All loaded originals remain reachable; filler duplicates are not new photos or new page demand.

## 11. Boundaries and compatibility
Preserve mobile fling, pinch, drag threshold, reduced motion, photo opening, current filters, media URLs, and camera absolute-travel loading semantics. Existing crop and append-stability tests remain protective; conflicts require an explicit design decision, not deletion to turn the suite green.

## 12. Failure modes
Shorter-column holes; omitted diagonal copies; duplicate keys causing missing sprites; DOM targets covering empty GPU space; appended-page rebase teleport; repeated photos counted as extra loaded sources. Each receives a negative or regression case.

## 13. Performance
Camera changes must not repack unchanged inputs. Copy count must follow visible extent plus bounded overscan. Retain texture sharing, bounded concurrency and refinement fallbacks from e01.

## 14. Fixtures and test oracle
Add 50/100/200 mixed-aspect single-album fixtures through existing helpers. Use a tested rectangle-union sweep for full coverage, canonical placement comparisons modulo periods, and browser visible-texture/hit-target checks. Include thin-hole negative tests for the oracle.

## 15. Implementation steps
1. Add deterministic fixtures and failing coverage/identity cases, including mobile test discovery → verify: `npx vitest run src/client/src/features/wall/__tests__/mosaicCoverage.test.ts`
2. Implement complete-period packing and wrapped single-view integration, retaining existing scene/virtualization contracts → verify: `npx vitest run src/client/src/features/wall/__tests__/packer.test.ts src/client/src/features/wall/__tests__/singleStreamSceneModel.test.ts src/client/src/features/wall/__tests__/singleStreamRenderWindow.test.ts src/client/src/features/wall/__tests__/virtualization.test.ts src/client/src/features/wall/__tests__/mosaicCoverage.test.ts`
3. Prove browser coverage, repeated-photo opening, resize and append continuity with the new spec enabled in both projects → verify: `npx playwright test playwright/mosaic-coverage.spec.ts --project=chromium-desktop --workers=1 && npx playwright test playwright/mosaic-coverage.spec.ts --project=chromium-mobile --workers=1`
4. Check integration types and retain the existing wrap/browser contracts → verify: `npm run typecheck && npx playwright test playwright/single-stream-wrap-continuity.spec.ts --project=chromium-desktop --project=chromium-mobile --workers=1`

## 16. Verification procedure
Use the isolated fixture server on the stable registered port; coordinate any running dev server first. Inspect default/minimum/maximum zoom at each axis/corner seam on desktop and portrait/landscape mobile. Open a visibly repeated photo and close it. Save screenshots plus geometry/texture-readiness evidence, console/network summary, and commands under `specs/verifications/` when executing. Do not execute these future tests during planning or use no-tests success flags.

## 17. Acceptance criteria
```gherkin
Scenario: Full single-album coverage
  Given a loaded fixture album with at least 50 mixed-aspect photos
  When the viewport crosses each axis seam and a diagonal corner at supported zooms
  Then tile geometry covers the viewport without gaps
  And actual Pixi output occupies the same photo regions as the hit targets
Scenario: Stable loop and activation
  Given unchanged loaded photos and selection
  When the camera travels one whole X period, Y period, and both periods
  Then the canonical photo arrangement is identical
  And opening a repeated placement selects its source photo
  And closing restores the wall context
Scenario: Incremental and viewport changes
  Given the user is viewing a seam
  When another page arrives or the viewport changes shape
  Then the visible anchor remains usable and coverage is restored without persistent holes
  And loading is neither duplicated nor starved by wrap projection
```

## 18. Out of scope
Grouped-region composition, final overview tuning, renderer replacement, unrelated gesture or modal redesign, and fixing pre-existing overlap-test fixture selection independently.

## 19. Rollback and stop rules
One coherent code/docs/test commit after proof, never stage unrelated pending changes. Revert that logical change if its complete-period construction breaks crop, identity or loading invariants. Stop for design review rather than weakening an invariant or hiding a missing source photo.

## 20. Delivery evidence and handoff
`e02s01-tasks.yaml` remains failing until its commands pass. Record G0 approval, new regression red/green evidence, typecheck and browser output, screenshots, existing-test deviations and known baseline failures. User value is the single-album browsing loop; e02s02 may then reuse its geometry proof and copy identity contract.
