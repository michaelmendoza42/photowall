# Impact — Full-coverage Looping Mosaic

Status: Planning evidence; no production implementation
Owner: Pi for Michael
Expires when: e02 is implemented and its verification record supersedes this assessment
Promote to: Existing system docs for any accepted persistent contract changes
Date: 2026-09-20

## Target and evidence

Approved scope: `specs/planning-context.yaml` and `docs/product/photo-wall-experience.md`.
Read-only parallel scouts inspected the current dirty checkout; parent checked the packer/module contracts. Context-mode was attempted but unavailable (`spawn context-mode ENOENT`). This is source-grounded impact evidence, not a reproduced diagnosis of the supplied screenshot's exact selected view.

- **Confirmed structural gap, grouped:** `albumAreas.ts` deliberately places separated footprints in a limited horizontal cluster. `groupedPacker.ts` packs each album independently at its anchor and derives overall height from their bounds. Their union is not a filled rectangular period. Repeating it cannot eliminate its internal holes.
- **Confirmed coverage risk, single:** `packer.ts` spans the requested width with columns but takes the tallest column as the vertical period. Shorter columns leave end-of-period voids unless explicitly closed. Existing repeat helpers copy geometry; they do not fill such voids.
- **Not established:** a Pixi camera/transform defect as the cause of this screenshot. Compare the packed geometry, repeated render window, Pixi output, and DOM hit targets before altering transforms.
- **Already present:** finite zoom constants (0.55–2.4 in both view paths), both-axis wrapping, photo-ID activation, and shortest-wrap signpost navigation. Extend these rather than rebuilding them.

## Modules, purposes, callers, contracts

| Module family | Purpose / direct consumers | Contracts to preserve or deliberately evolve |
| --- | --- | --- |
| `packer.ts`, `worldWidth.ts` | Base column geometry; used by single-stream scene model and grouped packing | Positive bounded tiles, modest crop, deterministic loaded-input layout, row-band indexing. Evolve base-period coverage without hiding source photos. |
| `albumAreas.ts`, `groupedPacker.ts`, `groupedWall.ts` | Album selection/seed/centers and grouped geometry; used by grouped view/shell, `WallCanvas`, and Mosaic Lab through production reuse | Stable album keys and shuffle, recognizable regions, center metadata, incremental availability. Replace separated-footprint layout assumption. |
| `singleStreamSceneModel.ts`, `singleStreamRenderWindow.ts`, `virtualization.ts` | Stable scene plus visible wrapped copies; consumed by `SingleStreamWallView` and grouped `WallCanvas` | Correct modulo periods, bounded visible-copy enumeration, unique instance keys, canonical photo identity, no camera-driven repacking. |
| `WallCanvas.tsx`, `SingleStreamWallView.tsx`, `useTouchPinchZoom.ts`, `WallZoomControls.tsx` | Render/input integration in grouped and single modes | Screen/world transforms applied once, common zoom limits, touch/drag thresholds, reduced motion, click suppression, photo opening. Avoid absorbing unrelated pending gesture changes. |
| `signposts.ts`, `signpostNavigation.ts` | Directional destinations and shortest-wrap glide; consumed by `WallCanvas` | Region-center anchors, nearest repeated target, dominant-album suppression, hidden idle/modal states. |
| `state/camera.ts`, `dynamicLoading.ts`, `groupedLoading.ts` | Continuous camera, period rebasing and page frontier/completeness; consumed by wall shells/views | Absolute travel is distinct from modulo rendering. Preserve loading, no duplicate requests or starvation, usable anchor when loaded content changes. |
| `PixiWallSurface.tsx`, Pixi scene helpers | GPU rendering of the same repeated tile plan as DOM interaction targets | Keep Pixi-first path, bounded textures/sprites, stable identities, previous texture while refinement loads. Transform edits only after runtime evidence. |

Blast radius includes both production wall modes, grouped signposts, photo hit testing, Mosaic Lab's production-layout reuse, wrap camera state, viewport resize, and loading transitions. It does not require a server route, persisted library format, auth boundary, or media-cache change.

## Existing stories and state

- e01s03 protects bounded layout/culling/camera/texture work; e02 must retain it.
- e01s04 protects browser/mobile performance behavior; retain those regressions.
- e01s01/e01s02 derivative scheduling and media identity should remain untouched.
- Existing `execution-status.yaml` marks e01 stories done while e01's manifest says planned/todo and old state points at an obsolete branch. Preserve that discrepancy as history; do not infer publication or rerun e01 automatically.
- e01 scope/state/release snapshots are preserved under its capsule before selecting e02 for planning.

## Test coverage and gaps

Reuse unit suites under `src/client/src/features/wall/__tests__/`: `packer`, `groupedPacker`, `groupedWall`, `albumAreas`, `singleStreamSceneModel`, `singleStreamRenderWindow`, `virtualization`, `worldWidth`, `signposts`, `signpostNavigation`, `dynamicLoading`, `groupedLoading`, and `pixiScene`. Also retain `src/client/src/state/__tests__/camera.test.ts`.

Reuse browser specs: `single-stream-wrap-continuity`, `grouped-album-areas`, `grouped-signposts`, `wall-layout-modes`, `mobile-pinch-zoom`, `mobile-wall-gestures`, `wheel-momentum`, `zoom-detail-tiers`, `focused-lightbox`, and `mosaic-lab` where applicable.

Missing explicit protection:
1. Full rectangular base-period and projected viewport coverage, especially column ends, side bands, and diagonal seams.
2. Stable canonical photo geometry and album centers after complete X/Y/diagonal loops and zoom round trips.
3. Adjoining irregular grouped boundaries with no lost album/photo identity.
4. Shared geometry-aware overview clamp across buttons, wheel, pinch, viewport changes, and both modes.
5. Repeated-copy activation with overlapping row bands and seam-instance keys.
6. Loading/resize behavior under the new geometry without duplicate page fetches or camera teleports.
7. Representative deterministic fixtures with 50+ photos per album, multiple albums, and portrait/landscape windows.

The existing mobile overlap-tap test could not find its candidate in the previous fixture run. The debug overlay also intercepts mobile zoom-button hit targets. Record these baseline issues separately, but do not waive the new mosaic's coverage or interaction scenarios.

## Risk: High blast radius; Standard execution with a blocking design gate

Shared internal geometry contracts feed many view, input, rendering, and test consumers. No sensitive boundary or external migration is proposed. Keep one writer, require a bounded layout proof before production implementation, and escalate execution mode if a renderer replacement, backend/persistence change, or broad unrelated redesign becomes necessary.

## Recommended action

Scope and slice all approved behavior now; treat the production plan as a reviewed draft until a bounded prototype demonstrates a complete period with acceptable crop, stable region centers, bounded duplicates, and viable incremental loading. Add failing geometric/browser regression coverage before fixing production paths. Do not mistake copying more sparse periods for filling a sparse period.
