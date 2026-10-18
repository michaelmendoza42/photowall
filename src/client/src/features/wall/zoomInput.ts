// Zoom input math shared by the single-stream and grouped wall views.

export const MIN_WALL_ZOOM = 0.55;
export const MAX_WALL_ZOOM = 2.4;

/**
 * Trackpad pinch arrives as ctrl/⌘ + wheel. Browsers report a pinch that
 * doubles finger spread as roughly 70 deltaY, so this sensitivity covers the
 * whole zoom range (~4.4×) in about one comfortable pinch.
 */
export const WHEEL_ZOOM_SENSITIVITY = 0.02;

/**
 * Cap on a single wheel event so a mouse wheel notch (deltaY ~100) steps
 * like the zoom buttons instead of jumping across the whole range. Trackpad
 * pinch events are small, so they never hit it.
 */
export const MAX_WHEEL_ZOOM_STEP = 1.25;

/**
 * Touch pinch amplifies finger spread so one pinch or spread (~2.3× change
 * in finger distance) covers the whole zoom range.
 */
export const PINCH_ZOOM_EXPONENT = 1.75;

function clampZoom(zoom: number): number {
  return Math.min(MAX_WALL_ZOOM, Math.max(MIN_WALL_ZOOM, zoom));
}

export function wheelZoom(currentZoom: number, deltaY: number): number {
  const factor = Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY);
  const capped = Math.min(MAX_WHEEL_ZOOM_STEP, Math.max(1 / MAX_WHEEL_ZOOM_STEP, factor));
  return clampZoom(currentZoom * capped);
}

export function pinchZoom(currentZoom: number, distanceRatio: number): number {
  if (!(distanceRatio > 0)) return currentZoom;
  return clampZoom(currentZoom * distanceRatio ** PINCH_ZOOM_EXPONENT);
}

export function stepZoom(currentZoom: number, factor: number): number {
  return clampZoom(currentZoom * factor);
}

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * The wall scales from the screen's top-left, so zooming alone would pivot
 * there. This is the camera move (world units) that keeps the world point
 * under `before` (screen px, at `fromZoom`) under `after` (at `toZoom`).
 * Passing the same point for both pivots on it; a moving pinch midpoint
 * also pans with the fingers.
 */
export function zoomAnchorDelta(
  fromZoom: number,
  toZoom: number,
  before: ScreenPoint,
  after: ScreenPoint = before,
): { dx: number; dy: number } {
  return {
    dx: before.x / fromZoom - after.x / toZoom,
    dy: before.y / fromZoom - after.y / toZoom,
  };
}
