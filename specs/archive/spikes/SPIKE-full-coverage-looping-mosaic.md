# Spike: full-coverage looping mosaic

Status: Experimental evidence ready; human composition review pending; not production approval
Owner: Pi for Michael
Expires when: e02 adopts a reviewed production design or rejects this experiment
Promote to: Existing system documentation and e02 story contracts after human approval
Date: 2026-09-25

## Question

Can one deterministic, aspect-preserving rectangular mosaic fill both-axis loops, retain adjoining recognizable album regions, and support a bounded overview without replacing Pixi?

Michael authorized the proposed 90-minute isolated experiment with “k do it.” The timebox started at **07:34:40Z**, with a hard deadline of **09:04:40Z**. The existing G0 thresholds were frozen before experimentation. Scope approval and permission to experiment are not approval of this layout or production implementation.

## Result

**Geometry/rendering feasibility demonstrated on the recorded fixtures. G0 is not passed: Michael’s composition/readability acceptance is still required.** Production integration remains unimplemented and unverified.

The candidate uses shared columns, complete column tails, contiguous cyclic album runs, and region centers that understand the map’s seams. It needs no additional within-period photo duplicates and introduces no crop in the measured fixtures. The existing Pixi renderer, wrap helper, navigation helper, query client, and infinite-photo query hook were reused.

## Findings

### Complete the period before repeating it

Production packer adapters reproduced incomplete base rectangles. Across the 24 seeded single/grouped fixtures, uncovered area ranged from approximately **0.49% to 77.93%**. This is a fixture measurement, not a claim about every real selection or the precise earlier screenshot.

For a column containing source aspect ratios `a`, let `S = sum(1/a)`. Choose one common height `H = W / sum_columns(1/S)` and column widths `w = H/S`. Every column then ends at exactly `H`, all widths sum to `W`, and each photo keeps its aspect ratio. This closes the base period without stretching, tail fillers, or extra source placements.

### Region connectivity needs an explicit invariant

The initial contiguous-column slices looked like rigid vertical slabs. The refined candidate distributes album runs over shared columns with bounded spatial variation and rotates the first run across the vertical seam. This produces adjoining, uneven bands, not disconnected rectangular footprints.

Independent review found that independent column balancing could split a region with **six 50-photo albums, seed 57**. A subsequent stress check also exposed failures with ten albums. The final experiment aligns cyclic neighboring-column runs by their minimum same-album overlap. If that cannot connect the runs, it retries with one fewer column. This is bounded by the initial column count; the resulting shape must be reported, not hidden.

An independent edge-connectivity oracle then passed **600/600** friendly-input cases, including the reported regression. Twenty-four cases needed fewer columns, with a maximum reduction of two. Measured period height/width stayed between **0.874 and 1.199**. These bounded results are not a proof for arbitrary metadata, arbitrary album counts, or tiny/degenerate selections.

Centers use area-weighted circular coordinates and snap to an owned tile center. A nearly uniform full-axis region uses the middle of that axis because it has no unique circular mean. Centers and canonical geometry remain unchanged during camera-only motion.

### Renderer and loading boundaries remain reusable

The same projected placement list drives `PixiWallSurface` and DOM hit targets. Tests check both rectangle coverage and settled Pixi raster output, rather than treating transparent buttons as evidence of images.

The controlled paging fixture uses the actual `createQueryClient` and `useInfinitePhotos`, but an **experimental anchor adapter**, not `WallShell`. Three simultaneous next-page attempts use `fetchNextPage({cancelRefetch:false})`: each of three cursor positions is requested once, with one in flight. A delayed page leaves the existing scene covered; all 150 fixture photos eventually arrive; crossing many periods does not refetch consumed cursors.

The non-cancelling fetch option is a proposed integration detail. It has not been applied to the production loading owner. Production frontier/completeness orchestration and row-band culling still need their own tests.

### Overview remains a proposal

The experimental minimum combines a 0.25 floor, a 36-CSS-pixel median tile-width target, and at most two exposed period lengths per axis. Maximum zoom remains 2.4. These are tuning inputs, not new product promises or a literal 2×/4× requirement. Representative images need Michael’s readability review. Tiny/degenerate inputs and unusual aspect distributions need an explicit safe production fallback.

## Evidence

See [the G0 proof packet](../../epics/e02-full-coverage-looping-mosaic/LAYOUT-PROOF.md) for the gate table, screenshots, exact commands, fixture seeds, and machine-readable output.

- **24/24** seeded geometry cases; **1,080** projected coverage cases.
- **600/600** additional connectivity/coverage cases.
- **176 Playwright checks**, including min/default/max zoom, axis/corner seams, portrait/landscape, delayed paging, correct photo opening, center navigation, and append/resize anchors.
- Synthetic Pixi raster checks found **zero near-black uncovered pixels**; natural dark real photographs were not subjected to that oracle.
- **212 GET requests**, zero mutation requests, zero browser console/HTTP errors in the recorded full run.
- Candidate canonical duplicate ratio **1.0**; measured maximum crop **2.22e-16**, numerical zero.
- The 186 production/source/config files captured before the spike remained byte-identical. The running development server was not replaced or restarted.

Real-photo screenshots remain local under ignored `scratch/mosaic-g0/results/`; durable evidence uses synthetic imagery. No real photo assets should be added to a commit as part of this experiment.

## Issues corrected during the experiment

- The first coverage oracle flattened and independently sorted interval endpoints; overlapping intervals could be misinterpreted. It now merges paired intervals and has seven positive/negative self-checks.
- The grouped baseline adapter initially omitted the production column factors and produced an empty layout. It now uses the actual factors and rejects invalid baseline adapters.
- The initial album-border exchange missed transitions occurring inside columns; it was replaced by cyclic shared-column runs.
- Independent review’s disconnected-region example led to neighbor-overlap alignment, bounded column reduction, and the 600-case connectivity check.
- Mobile offscreen hit boxes expanded the layout viewport. Clipping the experimental surface fixed the harness; no production CSS was changed.
- Early pointer capture in the harness could suppress photo clicks. Capture now starts only after the drag threshold; actual mouse/touch opening is checked.
- Browser verification initially covered only minimum zoom and fixed first-page reads. It now covers all three scales, landscape seams, and controlled cursor paging.

## Implications for the plan

Keep the three-story order. Feed this candidate and its regression cases into `plan-work`; do not copy the scratch component into production.

1. Introduce the invariant-bearing period geometry at the existing packer boundary, while preserving source identity, deterministic input ordering/seeds, and existing source validation.
2. Preserve shared projection between Pixi and DOM; retain the production row/texture/concurrency budgets rather than replacing them with the spike’s all-placement scan.
3. Protect album connectivity and seam-aware centers, including six/ten-album and uneven-count fixtures—not only two albums.
4. Preserve the tracked source-photo point when a page or viewport changes. Keep request/cursor ownership separate from wrapped drawing coordinates; test the actual production loading owner under coincident triggers.
5. Apply one reviewed zoom policy to both views and every input path. Add safe tiny/degenerate-input behavior without introducing an album admission minimum.
6. Obtain composition approval, then review/approve the amended implementation plan and establish a safe task branch/checkpoint before production edits.

## What was not explored

- Production `WallShell` loading ownership, row-band culling, animation lifecycle, all input integrations, or large-library rendering budgets.
- A general solution for malformed metadata, arbitrarily extreme aspect ratios, or every small/degenerate selection.
- Performance guarantees: the local 600-case sweep recorded pack p95 around 2.2 ms, but that is an observation on these fixtures, not a production benchmark.
- A renderer replacement, backend/persistence changes, Docker deployment, unrelated gesture fixes, or broad refactoring.
- Human composition acceptance.

## Recommendation and disposal

**Proceed to visual review, not production implementation.** The evidence supports this candidate as an input to the plan, subject to the documented integration work and human gate.

The preview and harness remain clearly isolated in ignored `scratch/mosaic-g0/` only so Michael can inspect and reproduce the experiment. They are not shipping code and must not be staged or merged. After the review/plan handoff, discard the scratch implementation; retain this learning packet and durable evidence. All e02 implementation task checks remain `failing` until their production verification commands actually pass.
