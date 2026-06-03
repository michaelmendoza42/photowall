// Camera state contract.
//
// The wall is a 2D camera over a bounded-width, vertically growing
// world (per `01-architecture.md`). The camera tracks an explicit
// x/y offset of the world relative to the viewport in CSS px. Wheel
// and drag input feed the same offsets via `panBy` / `panTo`, and
// every helper that mutates state runs the result through
// `clampCamera` so callers cannot drift past the loaded frontier.

export interface ViewportSize {
  width: number;
  height: number;
}

export interface WorldBounds {
  /** Total renderable world width once layout has settled. */
  width: number;
  /**
   * Vertical extent of laid-out content. Grows as additional photo
   * pages append rows. `null` until the first page is laid out.
   */
  height: number | null;
}

export interface CameraState {
  /** Horizontal offset of the world relative to the viewport, in CSS px. */
  x: number;
  /** Vertical offset of the world relative to the viewport, in CSS px. */
  y: number;
  viewport: ViewportSize;
  world: WorldBounds;
}

export interface CameraDelta {
  dx: number;
  dy: number;
}

export const INITIAL_VIEWPORT: ViewportSize = { width: 0, height: 0 };

export const INITIAL_WORLD: WorldBounds = { width: 0, height: null };

export const INITIAL_CAMERA: CameraState = {
  x: 0,
  y: 0,
  viewport: INITIAL_VIEWPORT,
  world: INITIAL_WORLD,
};

/** Maximum scrollable extent along an axis, never negative. */
export function maxOffsetX(state: CameraState): number {
  return Math.max(0, state.world.width - state.viewport.width);
}

export function maxOffsetY(state: CameraState): number {
  const worldHeight = state.world.height ?? 0;
  return Math.max(0, worldHeight - state.viewport.height);
}

/**
 * Clamp the camera's current x/y to the current world/viewport bounds.
 * Returns the same reference when nothing changed so React state checks
 * can bail out early.
 */
export function clampCamera(state: CameraState): CameraState {
  const cx = clamp(state.x, 0, maxOffsetX(state));
  const cy = clamp(state.y, 0, maxOffsetY(state));
  if (cx === state.x && cy === state.y) return state;
  return { ...state, x: cx, y: cy };
}

export function withViewport(
  state: CameraState,
  viewport: ViewportSize,
): CameraState {
  return clampCamera({ ...state, viewport });
}

export function withWorldBounds(
  state: CameraState,
  world: WorldBounds,
): CameraState {
  return clampCamera({ ...state, world });
}

/** Move the camera by a relative delta and reclamp to world bounds. */
export function panBy(state: CameraState, delta: CameraDelta): CameraState {
  const cx = clamp(state.x + delta.dx, 0, maxOffsetX(state));
  const cy = clamp(state.y + delta.dy, 0, maxOffsetY(state));
  if (cx === state.x && cy === state.y) return state;
  return { ...state, x: cx, y: cy };
}

/** Move the camera to an absolute offset and reclamp to world bounds. */
export function panTo(
  state: CameraState,
  offset: { x: number; y: number },
): CameraState {
  const cx = clamp(offset.x, 0, maxOffsetX(state));
  const cy = clamp(offset.y, 0, maxOffsetY(state));
  if (cx === state.x && cy === state.y) return state;
  return { ...state, x: cx, y: cy };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
