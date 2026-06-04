// Camera state contract.
//
// The wall now behaves like a finite, wrap-around 2D surface. The
// camera stores continuous travel offsets in CSS px, while renderers
// project those offsets back into the current world period via positive
// modulo. This keeps wheel and drag input simple, preserves a true 2D
// movement model, and lets the wall loop cleanly at all four edges.

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
  /** Continuous horizontal travel offset, in CSS px. */
  x: number;
  /** Continuous vertical travel offset, in CSS px. */
  y: number;
  viewport: ViewportSize;
  world: WorldBounds;
}

export interface CameraDelta {
  dx: number;
  dy: number;
}

export interface ProjectedCameraState {
  /** Wrapped horizontal render offset inside the current world period. */
  x: number;
  /** Wrapped vertical render offset inside the current world period. */
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

/** Width/height of one bounded world copy relative to the viewport. */
export function maxOffsetX(state: CameraState): number {
  return Math.max(0, state.world.width - state.viewport.width);
}

export function maxOffsetY(state: CameraState): number {
  const worldHeight = state.world.height ?? 0;
  return Math.max(0, worldHeight - state.viewport.height);
}

/**
 * Positive modulo used to project continuous travel into the current
 * wrapped render coordinate space.
 */
export function wrapTravelOffset(value: number, period: number): number {
  if (!Number.isFinite(period) || period <= 0) return 0;
  const normalized = normalizeFinite(value);
  const wrapped = normalized % period;
  return wrapped < 0 ? wrapped + period : wrapped;
}

/**
 * Reproject a travel offset into a new world period while preserving the
 * currently visible wrapped coordinate whenever possible.
 */
export function rebaseWrappedTravel(
  value: number,
  previousPeriod: number,
  nextPeriod: number,
): number {
  const normalized = normalizeFinite(value);
  if (
    !Number.isFinite(previousPeriod) ||
    previousPeriod <= 0 ||
    !Number.isFinite(nextPeriod) ||
    nextPeriod <= 0 ||
    previousPeriod === nextPeriod
  ) {
    return normalized;
  }

  const wrapped = wrapTravelOffset(normalized, previousPeriod);
  const completedCycles = Math.floor((normalized - wrapped) / previousPeriod);
  return completedCycles * nextPeriod + wrapTravelOffset(wrapped, nextPeriod);
}

/**
 * Normalize numeric camera drift without imposing bounded-world clamps.
 * Returns the same reference when nothing changed.
 */
export function clampCamera(state: CameraState): CameraState {
  const x = normalizeFinite(state.x);
  const y = normalizeFinite(state.y);
  if (x === state.x && y === state.y) return state;
  return { ...state, x, y };
}

export function projectCamera(state: CameraState): ProjectedCameraState {
  return {
    x: wrapTravelOffset(state.x, state.world.width),
    y: wrapTravelOffset(state.y, state.world.height ?? 0),
    viewport: state.viewport,
    world: state.world,
  };
}

export function withViewport(
  state: CameraState,
  viewport: ViewportSize,
): CameraState {
  const nextViewport = {
    width: normalizeDimension(viewport.width),
    height: normalizeDimension(viewport.height),
  };
  if (
    nextViewport.width === state.viewport.width &&
    nextViewport.height === state.viewport.height
  ) {
    return clampCamera(state);
  }
  return clampCamera({ ...state, viewport: nextViewport });
}

export function withWorldBounds(
  state: CameraState,
  world: WorldBounds,
): CameraState {
  const nextWorld: WorldBounds = {
    width: normalizeDimension(world.width),
    height: normalizeNullableDimension(world.height),
  };

  const nextX = rebaseWrappedTravel(state.x, state.world.width, nextWorld.width);
  const nextY =
    nextWorld.height === null
      ? normalizeFinite(state.y)
      : rebaseWrappedTravel(state.y, state.world.height ?? 0, nextWorld.height);

  if (
    nextWorld.width === state.world.width &&
    nextWorld.height === state.world.height &&
    nextX === state.x &&
    nextY === state.y
  ) {
    return state;
  }

  return {
    ...state,
    x: nextX,
    y: nextY,
    world: nextWorld,
  };
}

/** Move the camera by a relative travel delta. */
export function panBy(state: CameraState, delta: CameraDelta): CameraState {
  const x = normalizeFinite(state.x + delta.dx);
  const y = normalizeFinite(state.y + delta.dy);
  if (x === state.x && y === state.y) return state;
  return { ...state, x, y };
}

/** Move the camera to an absolute travel offset. */
export function panTo(
  state: CameraState,
  offset: { x: number; y: number },
): CameraState {
  const x = normalizeFinite(offset.x);
  const y = normalizeFinite(offset.y);
  if (x === state.x && y === state.y) return state;
  return { ...state, x, y };
}

function normalizeFinite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function normalizeDimension(value: number): number {
  return Math.max(0, normalizeFinite(value));
}

function normalizeNullableDimension(value: number | null): number | null {
  if (value === null) return null;
  return normalizeDimension(value);
}
