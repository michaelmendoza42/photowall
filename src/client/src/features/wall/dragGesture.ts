// Drag-gesture state model.
//
// The wall's drag pan needs to distinguish a deliberate drag from an
// incidental pointer wiggle so later tile-click and modal-open behavior
// (phase4-task2+) can suppress click activation after a drag. The
// threshold lives here as a pure helper so the wall component, future
// tile handlers, and unit tests all read the same rule.

/**
 * Distance in CSS px the pointer must travel from the gesture's start
 * point before the gesture is treated as a drag.
 */
export const DRAG_THRESHOLD_PX = 4;

export interface DragOrigin {
  /** Pointer x at drag start, in client px. */
  startX: number;
  /** Pointer y at drag start, in client px. */
  startY: number;
}

export interface DragSample {
  /** Current pointer x, in client px. */
  x: number;
  /** Current pointer y, in client px. */
  y: number;
}

/** Squared distance between origin and current sample. */
export function distanceSquared(
  origin: DragOrigin,
  sample: DragSample,
): number {
  const dx = sample.x - origin.startX;
  const dy = sample.y - origin.startY;
  return dx * dx + dy * dy;
}

/**
 * Return true once the pointer has moved at least `threshold` px from
 * the gesture origin. Squared comparison avoids a `Math.sqrt` in the
 * hot pointer-move path.
 */
export function hasCrossedThreshold(
  origin: DragOrigin,
  sample: DragSample,
  threshold: number = DRAG_THRESHOLD_PX,
): boolean {
  return distanceSquared(origin, sample) >= threshold * threshold;
}
