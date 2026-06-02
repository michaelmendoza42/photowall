// Camera state contract.
//
// The wall is a 2D camera over a bounded-width, vertically growing world
// (per `01-architecture.md`). This contract defines the data shape every
// future layout/pan task will consume; phase3-task1 only wires the
// initial state and viewport tracking, not real pan input handling.

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

export const INITIAL_VIEWPORT: ViewportSize = { width: 0, height: 0 };

export const INITIAL_WORLD: WorldBounds = { width: 0, height: null };

export const INITIAL_CAMERA: CameraState = {
  x: 0,
  y: 0,
  viewport: INITIAL_VIEWPORT,
  world: INITIAL_WORLD,
};

export function withViewport(
  state: CameraState,
  viewport: ViewportSize,
): CameraState {
  return { ...state, viewport };
}

export function withWorldBounds(
  state: CameraState,
  world: WorldBounds,
): CameraState {
  return { ...state, world };
}
