// World-width strategy.
//
// The wall remains a bounded-width, vertically growing world. The
// visual rhythm is now driven by a fixed set of irregular column-width
// factors rather than by full-width horizontal rows, so the mosaic reads
// primarily through vertical seams and staggered tile bottoms.

export const WORLD_WIDTH_MIN = 360;
export const WORLD_WIDTH_MAX = 2400;
export const WORLD_WIDTH_VIEWPORT_MULTIPLIER = 1.4;

/** Preferred tile span in CSS px — used as the packer's base size. */
export const DEFAULT_TARGET_ROW_HEIGHT = 300;

/** Hard ceiling on rendered tile height and virtualization band height. */
export const DEFAULT_MAX_ROW_HEIGHT = 460;

/**
 * Per-column multipliers applied across the wall width. The sequence is
 * deliberately irregular so the wall reads as a vertical mosaic rather
 * than as equally spaced strips. Average ≈ 1.0, so overall density
 * stays near the previous baseline.
 */
export const DEFAULT_MOSAIC_COLUMN_FACTORS: readonly number[] = [
  1.22,
  0.82,
  1.08,
  0.76,
  1.12,
];

/**
 * Map a viewport width onto the wall's world width. The world stays
 * bounded, but deliberately wider than the viewport so the 2D camera
 * always has real horizontal travel on normal desktop/tablet sizes.
 */
export function computeWorldWidth(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return WORLD_WIDTH_MIN;
  }
  return Math.min(
    WORLD_WIDTH_MAX,
    Math.max(
      WORLD_WIDTH_MIN,
      Math.floor(viewportWidth * WORLD_WIDTH_VIEWPORT_MULTIPLIER),
    ),
  );
}
