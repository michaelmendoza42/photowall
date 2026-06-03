// World-width strategy.
//
// The wall is a bounded-width, vertically growing world (per
// `01-architecture.md`). The world width is derived from the viewport
// width and clamped so the wall stays usable on very narrow and very
// wide displays. A future panning task may layer horizontal offset on
// top, but the bounded world keeps that horizontal range finite.

export const WORLD_WIDTH_MIN = 360;
export const WORLD_WIDTH_MAX = 2400;

/** Default target row height in CSS px — sized for large-photo orientation. */
export const DEFAULT_TARGET_ROW_HEIGHT = 300;

/** Hard ceiling on row height. Caps unusual single-tile rows. */
export const DEFAULT_MAX_ROW_HEIGHT = 460;

/**
 * Per-row multipliers applied to `DEFAULT_TARGET_ROW_HEIGHT`. The
 * sequence is deliberately irregular and non-periodic at small lengths
 * so the wall reads as a brick/mosaic field instead of a repeating
 * tall/short stripe pattern. Average ≈ 1.0 so total content height
 * stays close to the uniform-row baseline.
 *
 * Cycled by row index inside the packer — already-laid-out rows keep
 * identical geometry when more photos append.
 */
export const DEFAULT_MOSAIC_ROW_FACTORS: readonly number[] = [
  1.0,
  0.72,
  1.32,
  0.88,
  1.18,
  0.78,
  1.12,
  0.94,
  1.26,
  0.82,
  1.06,
  0.74,
  1.24,
];

/**
 * Map a viewport width onto the wall's world width. Equal to the
 * viewport width within sensible bounds, so tiles run edge-to-edge
 * (gapless) and no horizontal scrollbar appears on standard displays.
 */
export function computeWorldWidth(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return WORLD_WIDTH_MIN;
  }
  return Math.min(
    WORLD_WIDTH_MAX,
    Math.max(WORLD_WIDTH_MIN, Math.floor(viewportWidth)),
  );
}
