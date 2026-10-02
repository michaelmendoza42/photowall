# e02s03 — Explore a Bounded Full-coverage Overview

Status: Draft; implementation gated by G0 and plan approval
Owner: Pi for Michael
Expires when: Story acceptance is recorded
Promote to: Existing product/system docs for the accepted zoom policy

## 1. Business narrative
Zooming out should help a user find photos, not shrink the wall into an unlimited field of tiny repeated maps. All supported scales must remain filled while preserving familiar album locations.

## 2. Actors
Michael using wheel/trackpad zoom, visible controls, or mobile pinch in single and grouped views.

## 3. Value and complexity
5 BCP; risk P0. Delivers an observable bounded overview on every input path and viewport, not just a new math helper.

## 4. Preconditions and dependencies
G0 passed and e02s01/e02s02 provide complete canonical periods and stable identity. Requirements PW-MOSAIC-05/06. Exact lower-bound tuning is delegated; “4×” is not a fixed requirement.

## 5. Main flow
Open either wall mode → zoom out to locate photos → reach a finite useful limit → continue attempting zoom-out without further shrinking → zoom back toward a photo and open it.

## 6. Alternative flows
Resize/orientation changes, a newly extended loaded period, zoom while near a wrap corner, reduced motion, and switching filters. Direct wheel, pinch and button inputs must agree on the bound; a previously valid scale may need anchor-preserving reclamping after geometry changes.

## 7. Requirements
### MODIFIED — PW-MOSAIC-05: bounded useful overview
**Before:** both views independently use fixed 0.55–2.4 limits, without a stated map/viewport repeat-density or readability policy.
**After:** one consistent policy provides a finite useful overview in both modes and every input path; it prevents excessive tiny repeats while maintaining full coverage. Exact tuning is selected through representative evidence, not interpreted as a literal 2×/4× instruction.

### MODIFIED — PW-MOSAIC-06: scale changes preserve browsing
**Before:** basic pinch/buttons and texture tiers are covered, but coverage, repeat density and focal stability at bounds are not comprehensively asserted.
**After:** reaching/reapplying a limit, resizing, or changing period geometry preserves a usable focal anchor, valid finite scale, filled viewport, correct repeated-photo activation and existing gesture behavior.

## 8. Module purpose, callers, contracts
`WallCanvas` and `SingleStreamWallView` own their mode's input integration; `useTouchPinchZoom` and `WallZoomControls` feed those paths. Camera/scene geometry converts viewport pixels to world distance. Preserve direct pan deltas, touch momentum screen-space invariance, focal zoom behavior, texture-tier selection and stable layout cache inputs.

## 9. Implementation direction
Prefer one small shared geometry-aware zoom policy rather than three per-input clamps. Evaluate PLAN.md's finite repeat/readability guard against G0's period geometry. Clamp on input and geometry/viewport changes, with explicit finite-bound fallback for degenerate/small inputs. Retain max-zoom behavior unless evidence requires a separately justified change. Keep overview policy independently unit-testable and make both views consume it.

## 10. Data and identity
Zoom never changes the canonical placement order or photo/album identity for unchanged loaded inputs. Repetition is view projection, not newly loaded photo records. No persisted zoom migration or server schema change is proposed.

## 11. Boundaries and compatibility
Preserve pinch, drag/fling cancellation, wheel-tail behavior, reduced motion, buttons, media/detail tiers and focused-photo return. A clamp must not turn a smooth gesture into a camera teleport or trigger layout rebuilding on every event.

## 12. Failure modes
Different minimums by input path; unlimited period-copy growth; inverted min/max bounds; division by zero for loading/empty geometry; tiny unreadable tiles; lower-bound change moves the selected photo offscreen; treating overscan copies as visible repeats; new pinch tests with only one initializing move that never actually changes zoom.

## 13. Performance
At the selected minimum, bound visible period copies and tile/sprite/texture work using existing budgets. Test larger deterministic albums and repeated input sequences. No all-library preload or per-frame repacking as an overview shortcut.

## 14. Fixtures and oracle
Use both modes with 50/100/200-photo albums, equal/unequal grouped sets, desktop wide and mobile portrait/landscape windows. Geometry checks count visible periods separately from overscan. Use actual multi-move touch pinches and non-force button interactions; collapse debug UI through its normal control if it blocks targets. Unit checks cover bound monotonicity, finite results, viewport/period extremes and clamping after resize.

## 15. Implementation steps
1. Add failing shared-policy cases for finite repeat/readability bounds and viewport/data changes → verify: `npx vitest run src/client/src/features/wall/__tests__/wallZoomPolicy.test.ts`
2. Integrate the policy in both views and every zoom input while retaining camera, wrap and momentum contracts → verify: `npm run typecheck && npx vitest run src/client/src/features/wall/__tests__/wallZoomPolicy.test.ts src/client/src/features/wall/__tests__/worldWidth.test.ts src/client/src/features/wall/__tests__/dragMomentum.test.ts src/client/src/state/__tests__/camera.test.ts`
3. Prove input parity, limit saturation, coverage and usable focal context in both browser projects → verify: `for project in chromium-desktop chromium-mobile; do for spec in mosaic-overview mosaic-coverage mosaic-regions; do npx playwright test "playwright/$spec.spec.ts" --project="$project" --list || exit 1; done; done && npx playwright test playwright/mosaic-overview.spec.ts playwright/mosaic-coverage.spec.ts playwright/mosaic-regions.spec.ts --project=chromium-desktop --project=chromium-mobile --workers=1`
4. Run final regression/build gates and document the selected tuning with visual evidence → verify: `npm run typecheck && npm test && npm run build && npx playwright test --workers=1`

## 16. Verification procedure
Run fixture automation with exclusive control of the stable browser port. Confirm all new specs are discovered in both projects. Reach the limit independently by wheel zoom, buttons, and multi-move pinch; show attempts beyond the limit do not change scale. Check corner coverage, direction-preserving fling and repeated photo activation after zoom. Rotate/resize and append data while zoomed out. Capture actual renderer screenshots, console/network output, repeat-density/texture metrics, and human overview-readability feedback. Rebuild/restart the local production app as prescribed after implementation; no Docker or unauthorized process replacement.

## 17. Acceptance criteria
```gherkin
Scenario: Common finite lower bound
  Given the same mode, loaded selection and viewport
  When the user repeatedly zooms out through buttons, wheel zoom or pinch
  Then each supported path reaches the same finite minimum
  And further zoom-out leaves scale unchanged
  And the overview is not an excessive field of tiny repeated maps
Scenario: Full coverage at the overview limit
  Given either mode at its supported minimum zoom
  When the camera traverses axis and corner seams
  Then photos cover the viewport without layout holes
  And the same canonical arrangement returns after full-period travel
Scenario: Geometry changes and preserved interaction
  Given a photo is the user's browsing anchor near the zoom limit
  When the viewport or loaded period changes
  Then scale stays within valid finite bounds and the anchor remains usable
  And repeated-photo opening and existing pan/fling behavior remain correct
```

## 18. Out of scope
A fixed promised 4× factor, infinite zoom, a new renderer, touch-gesture redesign, backend optimization, adding a second overview UI, or silencing unrelated baseline failures to claim a clean suite.

## 19. Rollback and stop rules
If no finite policy balances overview readability and repetition with coverage, return to G0/tuning review. Do not hide defects by making the zoom range unusably narrow. Keep a targeted reversible change; any renderer/persistence expansion escalates the plan before execution.

## 20. Delivery evidence and handoff
Record the chosen defaults and why they are useful, task verification exits, full-suite results including explicit baseline failures, screenshots, real-library health/browser checks, and remaining real-device concerns. Status remains failing until checks pass; approval of this plan is not proof of working behavior.
