# e02 — Full-coverage Looping Mosaic Plan

Status: Draft implementation plan; approved product scope; production build gated
Owner: Pi for Michael
Expires when: e02 passes its acceptance checks or a reviewed replacement plan supersedes this one
Promote to: Existing product/system docs for accepted durable behavior and technical contracts
Date: 2026-09-20

## Goal and execution decision

Fill the window with one stable finite mosaic repeated in both axes. Preserve adjoining, recognizable album regions with irregular borders and center-directed navigation. Bound zoom-out without promising a literal 2×/4× scale. Governing truth: `specs/planning-context.yaml` and `docs/product/photo-wall-experience.md`.

**Chosen mode: Standard.** Reversible internal layout changes with explicit product intent and strong geometric/runtime oracles. The shared internal geometry has high blast radius, so use a blocking layout-proof checkpoint and one writer. Escalate if proof requires replacing the renderer, changing backend/persistence contracts, weakening source safety, or materially revising approved behavior. An isolated repeat-selection bug in one view would have allowed Fast.

**Convergence checkpoint:** no side bands, no empty inter-album islands, no reshuffling through loops, and no effectively unbounded repeated overview. Evidence against this understanding would be a desire to retain gutters, rigid album boxes, or generate fresh arrangements on each pass; the approved dialogue explicitly rejects those interpretations.

## Facts versus decisions

- Grouped packing currently creates separated album footprints; its base rectangle is sparse. More wrap copies cannot repair internal holes.
- Single packing spans width but its columns can end at different heights; the maximum height is the repeat period. End-of-period coverage needs an explicit invariant.
- Existing modulo/copy helpers, photo identity, signposts, and Pixi path are reuse candidates, not replacement targets.
- The exact screenshot's view and any visual-transform defect still need runtime reproduction. Do not claim a Pixi defect from static inspection.
- The current 0.55 minimum is already finite but does not express overview readability or copy density. Tune a shared policy rather than merely lowering it.

## Blocking checkpoint G0 — bounded layout proof

Michael authorized the **90-minute spike-prototype** with “k do it”; it started on 2026-09-25 at 07:34:40Z with a 09:04:40Z deadline. Evidence is now recorded in `specs/archive/spikes/SPIKE-full-coverage-looping-mosaic.md` and this capsule's `LAYOUT-PROOF.md`. The isolated prototype is ready for composition review, **not G0-passed or production-approved**. Production/source/config hashes remained unchanged; the running user's library, selections, services, and existing dirty work were preserved. Retain ignored scratch code only for review, then discard it after the plan handoff. G0 is a prerequisite for all three stories, not a fourth user-facing story or a claimed completed task.

1. Reproduce gaps with deterministic 50/100/200-photo albums: single, two equal albums, and uneven album sizes. Compare base rectangles, projected repeated rectangles, Pixi visuals, and DOM hit regions at axis/corner seams.
2. Evaluate one primary candidate: preserve column-first tile geometry and deterministic photo ordering, but construct a complete finite rectangular period. For grouped mode, assign adjoining local album runs/regions on a shared full-coverage geometry rather than isolated footprints. Irregular transitions may intermix neighbors; global album randomization is not acceptable.
3. Resolve column-tail closure using a bounded amount of repeated source content and/or modest crop within existing crop expectations. Preserve every loaded source photo's reachability. Evaluate crop cost, duplicate density, and visible region shape; filling holes by stretching images or giant cropped filler cells fails.
4. Establish explicit instance identity: canonical photo ID opens media; tile-placement identity distinguishes repeated source placements inside one period; wrap-instance identity adds period offsets. Test Pixi/DOM keys for collisions. Reuse existing key builders where sufficient.
5. Define center metadata from the canonical album region, accounting for a region crossing a torus seam. The center must represent that region and remain fixed under camera-only changes. Reuse shortest-wrap targeting rather than adding separate signpost coordinates.
6. Prove the update contract: an unchanged loaded set never repacks on pan/zoom; when a page arrives, geometry may extend/change as already allowed, but preserve the viewed photo/screen anchor and avoid persistent holes. Keep absolute loading travel separate from wrapped rendering. Do not promise an immutable map across changing data.
7. Produce a concrete selected design with measured geometry coverage, crop/duplicate observations, render-instance bounds, and loading behavior. Present representative grouped screenshots for Michael's composition review before production implementation. If no candidate meets these contracts, stop and revise the plan; do not disguise fillers or waive coverage.

### G0 objective exit table

These are proposed engineering acceptance thresholds for the experiment, not new product promises. Freeze them before running the candidate; if they are infeasible, report the failure and revise the design/plan explicitly instead of moving the goalposts after seeing output.

| Check | Required proof result |
| --- | --- |
| Base and projected coverage | Rectangle-union sweep finds no uncovered interval larger than 1e-6 world units in a base period. Projected browser geometry allows at most 0.5/devicePixelRatio CSS px numerical tolerance; no visible seam on known nonblack fixtures. Test axes/corners at all matrix scales, not just area sums. |
| Identity and reachability | Zero placement/wrap-instance key collisions; every loaded source photo is reachable; each instance retains exactly the correct source photo and album ID. Unique loaded counts equal input unique counts. |
| Stability | Sorted canonical identity/geometry/center tuples match within 1e-6 world units after +X, +Y, +X+Y periods and a zoom round trip with unchanged loaded input. |
| Crop | No image stretching. Define crop fraction as 1 minus retained source area under cover rendering. On identical fixtures, candidate p95 and maximum crop fractions must each be no more than 0.05 above the current packer's baseline; retain any stricter existing test bound. Log worst cases for visual review. |
| Duplication | For friendly 50+ inputs, canonical placement count is at most 1.25 times the unique loaded count. Visible wrap periods expose at most two period lengths per axis (at most nine intersecting periods including partial edges) for the initial proof; final tuning still requires readability review. |
| Render work | Mounted placement instances stay at or below canonical placement count times `(ceil(viewportWorldWidth / periodWidth) + 2) * (ceil(viewportWorldHeight / periodHeight) + 2)`; retain existing narrower culling, texture and concurrency budgets. No layout invocation on camera-only movement. |
| Page requests | In a no-fault fixture, at most one request per selection/cursor and one in flight for that cursor. All advertised pages/selected albums eventually arrive under existing loading flow; modulo crossing does not generate new seeds or refetch consumed cursors. |
| Anchor preservation | During controlled page append or viewport resize with no gesture in flight, a tracked source-photo point retains its normalized viewport position within 2 CSS px in the new viewport. Record identity and coordinate evidence; lost anchors or period-change jumps fail. |
| Composition | Separate human gate: Michael accepts representative single/equal/unequal grouped screenshots as full coverage, recognizable regions, non-rigid irregular borders and a useful overview. Numeric checks do not substitute for this. |

The spike must save the exact runnable commands and fixture seeds that produced each result. A failed threshold blocks production implementation and feeds back into plan-work; it is not waived by a good-looking screenshot. G0 passes only with proof output and the composition review recorded. The implementation checklist remains `failing` until individual verification commands actually pass. Scope approval is not approval of an unseen layout algorithm.

## 2026-09-25 experiment checkpoint

The selected experimental direction solves aspect-exact equal-height columns, keeps cyclic album runs adjoining, aligns neighboring runs to prevent disconnected regions, and retries with fewer columns when necessary. Circular region centers, shared Pixi/DOM projection, and an anchor-preserving paging adapter were exercised. The recorded matrix passed 24 numeric cases/1,080 projections, 600 connectivity cases, and 176 browser checks. See `LAYOUT-PROOF.md` for bounds and exclusions.

The initial six-album connectivity failure is a required regression case. The proposed `fetchNextPage({cancelRefetch:false})` adapter must be reviewed against the actual production frontier/completeness owner; the spike did not replace that owner or prove production row-band budgets. Preserve existing source validation, deterministic input seeds, and large-library behavior. Add tiny/degenerate-input fallback tests without introducing a minimum album admission size.

**Pending:** Michael's composition/readability decision, plan-work incorporation/review, and production integration verification in the three stories. No implementation task check is promoted by this experiment.

## Story order and independent user value

| Story | BCP | Depends on | Observable delivery |
| --- | --- | --- | --- |
| e02s01 | 5 | G0 | A single album fills the viewport through both-axis loops, and repeated tiles open the correct photo. |
| e02s02 | 8 | e02s01, G0 | Multiple albums form adjoining irregular regions; signposts navigate to their stable centers through seams. |
| e02s03 | 5 | e02s01/e02s02 | Desktop/mobile users reach a useful finite overview with full coverage and consistent input clamps. |

No tests-only or architecture-only story is counted as user delivery. Tests, fixtures, docs, and verification live with the slice they protect. Each slice keeps existing supported zoom behavior covered; e02s03 refines the final overview policy rather than postponing basic coverage until the end.

## Shared implementation contracts

- **Complete period first:** the union of canonical tile rectangles covers `[0, worldWidth] × [0, periodHeight]`; copies fill the exposed window, including four-corner crossings.
- **Identity:** distinguish unique source records from placement instances. Duplication must not inflate loaded-photo counts, page cursors, album membership, or load-completeness decisions.
- **Stability:** cache geometry by real layout inputs, not camera/zoom. Repeat the same canonical geometry at integral period offsets. Keep prior deterministic shuffle seeds.
- **Visual/hit-test parity:** one projected repeated tile plan feeds Pixi and DOM targets. A transparent hit rectangle alone is not proof of visible content.
- **Loading:** preserve existing frontier/completeness behavior; wrapping is a projection, not a command to request a new random arrangement. Test appends while viewing a seam and while an album page is delayed.
- **Crop:** reuse current cover rendering and aspect/crop constraints. No portrait/panorama flattening merely to satisfy an area sum.
- **Budget:** enumerate visible periods/tiles plus existing overscan; do not materialize an unbounded copied world or load every full-detail image for every instance.

## Overview tuning proposal, not additional product law

Use one shared policy called by both views, wheel zoom, buttons, and pinch. A candidate lower bound combines existing readable tile-size/scale expectations with viewport-to-period dimensions. As an initial geometric guard, consider no more than two complete period lengths exposed along either axis; including partial copies this bounds the visible period grid to at most nine. This is a tunable hypothesis, not Michael's rejected literal “two copies” requirement. Count actual visible repeats separately from overscan, and visually reject an overly repetitive or unreadable result even if its numeric bound passes.

Clamp safely after orientation/viewport or period changes as well as on direct input. Preserve the visual focal anchor during clamping. If the required lower bound exceeds the supported maximum for tiny/degenerate inputs, use a documented safe fallback without inverted/NaN bounds; friendly 50+ inputs remain the optimization target. Do not silently raise the minimum so far that useful browsing disappears.

## Reuse and proposed abstraction depth

- Reuse `computeWrappedAxisCopies`, `computeWrappedVisibleRowSegments`, scene/render-window models, existing shuffle seeds, `computeWrapAwareCameraTarget`, media IDs, and existing test fixture patterns.
- Extend the current packing modules before introducing a parallel renderer or generalized layout framework.
- A small shared zoom-policy helper is justified only if geometry-dependent clamp logic would otherwise be duplicated in both views. **Reason for depth:** it owns one cross-input invariant and removes independent lower-bound implementations.
- A test-only rectangle-union oracle shared by unit and browser adapters is justified. **Reason for depth:** one geometric definition of coverage prevents screenshot darkness and sparse sampling from producing false passes.
- If the selected prototype needs a new pure period-layout helper, its boundary is photos/album metadata/options → canonical placements/period/centers. **Reason for depth:** both wall paths need one invariant-bearing geometry result, not another layer over identical logic. Name and API are selected after G0, not invented as binding contracts now.
- Dependencies: no new packages proposed. Existing React, Pixi/pixi-viewport, Vitest, and Playwright are retained; this plan does not propose or assess a dependency upgrade.

## Verification design

### Geometric oracle

Clip projected rectangles to the viewport and sweep all rectangle X boundaries, checking merged Y intervals in each slab. Include degenerate intervals and a subpixel epsilon justified by device pixel ratio. Test the oracle itself with deliberate thin slits, overlap, corners, and fully covered rectangles. Reject area-sum-only checks (overlaps can hide holes) and arbitrary point grids (can miss narrow gaps). Use source photo/placement IDs and canonical rectangles modulo the map period to verify stable repeats.

### Browser fixture and matrix

Extend existing fixture/routing helpers, not the user's library. Add deterministic photographic or colored synthetic media with at least 50 photos per album and mixed aspect ratios. Cover 50/100/200 photo single selections, two equal albums, unequal 50/150 albums, delayed pages, both portrait and landscape windows, and minimum/default/maximum supported zoom.

New planned specs: `playwright/mosaic-coverage.spec.ts`, `playwright/mosaic-regions.spec.ts`, `playwright/mosaic-overview.spec.ts`. Add them explicitly to the mobile project's `testMatch`; its current allowlist will otherwise omit them. Verify discovery separately for every new spec in each project with `--list`, with failure propagated; a combined desktop/mobile command can succeed while omitting mobile tests. The task commands below separate project runs or require each spec/project discovery to succeed before a combined run. No `--pass-with-no-tests` or blanket skip is allowed for the new acceptance suites.

Verify horizontal, vertical, diagonal and corner seams, modulo-equivalent geometry, repeated-photo open/close, center-directed signposts, input clamps, new-touch interruption, and loading/resize continuity. Geometry is not sufficient by itself: inspect actual Pixi output with known nonblack fixtures, screenshots and texture/readiness checks; inspect console/network failures. Natural dark regions in real photos are not layout failures.

Existing mobile overlap-tap fixture and debug-overlay interception failures are baseline issues, not permission to skip the new scenarios. For new visual checks, use the normal debug-collapse control or an explicit test configuration to keep overlays from obscuring targets; do not silently force-click covered controls.

### Runnable verification and evidence

Story task files contain exact commands. Tests named as new do not exist at planning time; commands should fail until they are implemented, never use `--passWithNoTests`. Full gate after all slices: `npm run typecheck`, `npm test`, `npm run build`, then full Playwright. Any retained baseline failure needs an explicit report; do not claim an entirely green suite from a filtered run.

Resolve the repo's stable port using `/home/michael/Projects/Code/pi-mods/bin/dev-ports ensure .` before browser startup. The test harness owns that same port, so coordinate with the running dev server: ask before stopping an operator's server; never point fixture tests at the real library through `PLAYWRIGHT_REUSE_EXISTING_SERVER=true`. Do not change to a framework-default or unrelated browser port.

After implementation, perform the repo-required local npm production rebuild/restart (no Docker) with authorized library/data paths, stable port, `0.0.0.0` bind, `/healthz`, real-browser screenshots, and a bounded real-library smoke. Record any launch-policy block rather than bypassing it. Human real-device feel/composition review complements browser automation.

## State, safety, and handoff

The checkout is already dirty on `fix/mobile-fling-response`. This plan does not commit, overwrite, or absorb those changes. Before execution, identify prerequisite pending gesture changes, checkpoint only with appropriate ownership, and choose an isolated mosaic task branch/worktree without dropping required uncommitted work. Preserve e01's history and do not reconcile its contradictory completion metadata as part of this initiative.

Plan tooling: repo-local timing, status-sync, and consistency scripts are absent. Use the installed bigpowers `scripts/lib/plan-consistency-check.sh` read-only for this capsule and a YAML/link/task cross-check. The referenced upstream countable-story template is not installed; story documents use explicit 20-section local contracts with business narrative, flows, requirements, §17 acceptance, and §18 exclusions. Do not create a replacement global template or retrofit scaffolding.

**Next action:** Michael's composition/readability review of `LAYOUT-PROOF.md`. Then use `plan-work` to incorporate the selected geometry and integration obligations. After proof and plan approval, use `kickoff-branch`/safe worktree preparation, then `develop-tdd` or `build-epic` for e02s01. No production implementation is authorized by this plan's existence alone.
