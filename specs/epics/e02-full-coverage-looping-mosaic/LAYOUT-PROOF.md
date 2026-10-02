# G0 — Isolated layout proof

Status: Prototype ready for composition review; G0 not passed; production remains gated
Owner: Pi for Michael
Expires when: Michael reviews the composition and the implementation plan is approved or replaced
Promote to: Existing system documentation and e02 implementation contracts after approval
Date: 2026-09-25

## Verdict and authority

**The experiment demonstrates feasibility on the recorded fixtures. It is not production implementation or production acceptance.** Michael has not yet approved the pictured region shape or overview density. Production loading ownership, lifecycle, and row-band integration remain explicit follow-up verification.

Michael’s “k do it” authorized the previously proposed 90-minute isolated prototype. Start: **2026-09-25 07:34:40Z**; deadline: **09:04:40Z**. G0 thresholds were frozen before the run and were not relaxed. The scope/design/implementation approval gates remain distinct.

Learning: [SPIKE-full-coverage-looping-mosaic.md](../../archive/spikes/SPIKE-full-coverage-looping-mosaic.md).

## Selected experimental design

- Solve shared column widths and one common period height from source aspect ratios. Every column closes; no crop, stretch, tail filler, or extra within-period source placement is needed on the measured fixtures.
- Keep cyclic album runs adjoining on the shared geometry. Deterministic local variation makes uneven borders; neighboring-run alignment prevents separated components. Retry with fewer columns when alignment fails, and report that trade-off.
- Derive seam-aware centers from the canonical regions; target them with the existing shortest-wrap helper.
- Feed one projected placement list to existing Pixi rendering and DOM hit targets. Camera-only actions do not regenerate the canonical layout.
- Keep cursor ownership in the existing infinite-query mechanism, with a proposed non-cancelling fetch adapter. Preserve the tracked source-photo point when data or viewport dimensions change.
- Treat the experimental overview clamp as a readability proposal, not a fixed 2×/4× product promise.

The preview deliberately does **not** reuse production `WallShell` frontier/completeness orchestration or row-band culling. Its paging/projection results must not be described as proof of those unmodified production paths.

## Frozen gate results

| G0 check | Experimental result | Scope/remaining work |
| --- | --- | --- |
| Base/projected coverage | PASS: 24 seeded cases, 1,080 projected cases; seven oracle self-checks | Includes production packer baselines; not a reconstruction of the exact earlier screenshot |
| Visible coverage | PASS: 159 settled synthetic raster/DOM samples; zero near-black uncovered pixels | Desktop, mobile portrait, and landscape; min/default/max; horizontal/vertical/corner seams |
| Identity/reachability | PASS: all fixture sources retained; no canonical or wrap key collisions; mouse/touch opens the selected source | Production interaction/lifecycle regression suites still required |
| Repeat stability | PASS: X/Y/diagonal numeric translations, 17/−13 runtime period travel, canonical geometry/centers unchanged through zoom round trips | Applies to unchanged loaded input, not to an immutable layout across new pages |
| Crop | PASS: p95/max no worse than baseline; maximum approximately 2.22e-16 | Numerical zero; extreme/malformed metadata not generalized |
| Duplication/overview | PASS: canonical ratio 1.0; no more than two exposed lengths/axis and nine intersecting partial periods | Readability and final clamp tuning need human acceptance |
| Region connectivity | PASS: 600 additional cases; one toroidal edge-connected component/album | Six matrices, seeds 1–100; not an arbitrary-input proof |
| Render work | PASS for prototype mounted-instance formula and no camera-only layout invocation; max observed 631 instances | Existing Pixi reused; actual production row/texture/lifecycle budget integration must still be verified |
| Page requests | PASS in the isolated adapter: one request and one in-flight request per cursor; all three pages/150 photos arrive; wraps do not refetch | Uses production query hook and `cancelRefetch:false`; does not test production frontier/completeness triggers |
| Append/resize anchor | PASS: source identity retained; maximum recorded append drift approximately 2.85e-13 CSS px; resize point coordinates stable | Controlled no-gesture transitions; production integration still required |
| Composition | **PENDING — Michael** | Accept or reject single/equal/unequal regions, non-rigid borders, repetition density, and readability |

**Overall: G0 not passed.** These measurements justify composition review and plan refinement, not silently waiving later production integration proof. All twelve e02 implementation tasks retain their original failing/pending verification state.

## Screenshots for composition review

Color represents album membership; these are synthetic diagnostic photos, not proposed application styling.

- [Single album, corner seam](evidence/g0/desktop-50-minimum-corner.png)
- [Two equal albums](evidence/g0/desktop-50-50-minimum-corner.png)
- [Unequal 50/150 albums](evidence/g0/desktop-50-150-minimum-corner.png)
- [Three albums](evidence/g0/desktop-50-50-50-minimum-corner.png)
- [Mobile portrait](evidence/g0/mobile-50-50-minimum-corner.png)
- [Mobile landscape](evidence/g0/mobile-landscape-minimum-corner.png)

Real-photo evidence remains ignored/local:

- `scratch/mosaic-g0/results/real-photos-normal.png`
- `scratch/mosaic-g0/results/real-photos-overview.png`

Interactive local preview: `http://127.0.0.1:5176/@fs/home/michael/Projects/Code/photo-wall/scratch/mosaic-g0/index.html?real=1`.
LAN equivalent: replace `127.0.0.1` with `mmdebian.local`.

The real-photo action performs only bounded GET reads: 50 photos from Gem Lake and 50 from Museum of Flight. It does not alter the running app’s library, saved selections, playlists, or server configuration. “50 + 50,” “50 + 150,” and “Three albums” switch to color-coded fixture views. Use **Minimum**, **Corner seam**, and **Go album** controls to inspect the composition. The harness is not a replacement UI or a gesture-feel preview.

## Reproducible commands and inputs

Run from `/home/michael/Projects/Code/photo-wall` while the isolated scratch files are retained for review:

```bash
npx tsx scratch/mosaic-g0/measure.ts
npx tsx scratch/mosaic-g0/verify-topology.ts
npx tsx scratch/mosaic-g0/verify-browser.ts
```

The browser command is standalone Playwright automation, not the production Playwright project runner. It explicitly creates both desktop and mobile contexts, so it cannot silently omit the mobile project through a `testMatch` allowlist.

Runtime used: existing Vite on **5176**, existing authorized photo API on **3002**. No server was started or restarted by this spike. If Vite is absent, first confirm service ownership and the stable assignment:

```bash
/home/michael/Projects/Code/pi-mods/bin/dev-ports ensure .
# On this checkout the assigned browser port is 5176.
# Requires the existing authorized photo API at 127.0.0.1:3002.
VITE_DEV_PROXY_TARGET=http://127.0.0.1:3002 \
  npm run dev:client -- --host 0.0.0.0 --port 5176
```

Do not stop an operator’s server, change the stable port, deploy Docker, or use `PLAYWRIGHT_REUSE_EXISTING_SERVER=true`. The isolated preview alone consumes controlled intercepted paging responses; the normal app is not pointed at fixture data. The separate real-photo smoke requires the two named folders in the authorized local library.

| Run | Inputs | Durable result |
| --- | --- | --- |
| Numeric geometry | `[50]`, `[100]`, `[200]`, `[50,50]`, `[50,150]`, `[50,50,50]`; seeds 17, 9025, 27183, 65371; viewport 1440×960, 390×844, 844×390; min/1.0/2.4 zoom; five camera phases | [JSON](evidence/g0/evidence.json), [output](evidence/g0/geometry-output.txt) |
| Connectivity regression | Six matrices recorded in the JSON; seeds 1–100, including six 50-photo albums at seed 57 and ten-album cases | [JSON](evidence/g0/topology-evidence.json), [output](evidence/g0/topology-output.txt) |
| Browser/Pixi | Seed 9025; desktop 1440×960 DPR1, mobile 390×844 DPR2 and landscape 844×390; min/1.0/2.4; three-page delayed fixture; two real first-page reads | [JSON](evidence/g0/browser-evidence.json), [output](evidence/g0/browser-output.txt) |
| Isolation | SHA-256 comparison of 186 captured production/source/config paths; no changes; prototype file hashes | [JSON](evidence/g0/isolation.json) |

Recorded full browser run: **176 passing checks**, **212 GET-only requests**, **zero console/HTTP errors**. Real-photo darkness is not counted as a geometric gap. The source fixture’s image ratios are 0.62, 0.8, 1, 1.35, 1.78, and 2.2; per-album seeding preserves existing photo metadata when another album grows.

## Independent review and corrections

The first read-only review identified disconnected regions for six albums/seed 57, missing cursor proof, and minimum-only browser coverage. Those findings produced the overlap-alignment/retry strategy, independent topology sweep, controlled paging adapter, and expanded scale/orientation matrix. The final read-only review found no new algorithmic blocker within the tested bounds; it correctly retained the human and production-integration gates.

Its remaining reproducibility finding—missing command/seed/server metadata in browser evidence—was corrected in the harness and recorded output. Neither reviewer claimed arbitrary-input correctness or production readiness.

Other self-review fixes: paired-interval coverage merging, an invalid empty grouped baseline adapter, mobile viewport expansion from offscreen hit targets, and premature pointer capture in the scratch harness. No corresponding production files were edited opportunistically.

## Reuse, safety, and next decision

- **Searched:** packers, album areas, scene/render-window models, wrapping, signpost navigation, query hooks, fixture patterns, and media diagnostics.
- **Reused:** `PixiWallSurface`, `computeWrappedAxisCopies`, `computeWrapAwareCameraTarget`, `createQueryClient`, `useInfinitePhotos`, media IDs/resolution, Playwright, and sharp.
- **New:** isolated experimental layout, paired-interval oracle, connectivity checker, and preview adapters; they exist to test an uncertain invariant, not to create a parallel production framework.
- **Discoverability:** this packet links exact evidence and the spike findings from the e02 capsule.
- **Hardening learned:** verify complete-period union and connected regions; distinguish source/placement/wrap identities; test real raster as well as DOM; centralize cursor ownership and preserve anchors.

The scratch code stays ignored and unshipped only for the pending human review. Preserve the learning/evidence, then discard the prototype after the plan handoff. Do not absorb the existing uncommitted gesture changes. No implementation task is completed by this packet, and no production restart/build is required for these isolated learning artifacts.

**Next decision:** Michael’s composition/readability review. Then use `plan-work` to incorporate the selected design and integration obligations, review/approve that plan, and establish the safe implementation branch/checkpoint before touching production code.
