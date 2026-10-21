// Tile-size strategy.
//
// The wall's world is sized to its photos (see `radialWall.ts`); the
// viewport-based width here only sets how wide tiles are, so tiles keep a
// comfortable size on each screen. Tile density is a separate concern
// controlled by `WALL_TILE_SCALE`, where `1` means the previous base column
// width and smaller values make tiles smaller.

export const WORLD_WIDTH_MIN = 360;
export const WORLD_WIDTH_MAX = 3600;
export const WORLD_WIDTH_VIEWPORT_MULTIPLIER = 2.2;

/**
 * Global wall-tile width multiplier. `1` means the previous base width;
 * `0.75` makes tiles 25% smaller than that baseline.
 */
export const WALL_TILE_SCALE = 0.75;

/**
 * Compatibility name retained: this now acts as the nominal virtualization
 * band height, not a visual cap on tile height.
 */
export const DEFAULT_MAX_ROW_HEIGHT = 460;

/**
 * Per-column multipliers applied across the wall width. The sequence is
 * deliberately irregular so the wall reads as a vertical mosaic rather
 * than as equally spaced strips.
 */
export const DEFAULT_MOSAIC_COLUMN_FACTORS: readonly number[] = [
  1.22,
  0.82,
  1.08,
  0.76,
  1.12,
];

/**
 * Map a viewport width onto the reference width tile sizes derive from
 * (five irregular columns' worth, scaled by `WALL_TILE_SCALE`).
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
