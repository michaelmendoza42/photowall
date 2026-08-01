import type { CameraDelta } from '../../state/camera.js';

const FRAME_MS = 1000 / 60;
const MAX_SAMPLE_INTERVAL_MS = 64;
const RELEASE_FRESHNESS_MS = 160;
const RECENT_SAMPLE_WEIGHT = 0.65;

export interface DragMomentumSample extends CameraDelta {
  lastMoveAt: number;
  hasVelocity: boolean;
}

export function createDragMomentumSample(
  startedAt: number,
): DragMomentumSample {
  return { dx: 0, dy: 0, lastMoveAt: startedAt, hasVelocity: false };
}

/** Normalize recent camera movement to one animation frame and smooth jitter. */
export function sampleDragMomentum(
  previous: DragMomentumSample,
  cameraDelta: CameraDelta,
  movedAt: number,
): DragMomentumSample {
  const elapsed = Math.max(
    1,
    Math.min(MAX_SAMPLE_INTERVAL_MS, movedAt - previous.lastMoveAt),
  );
  const frameScale = FRAME_MS / elapsed;
  const frameVelocity = {
    dx: cameraDelta.dx * frameScale,
    dy: cameraDelta.dy * frameScale,
  };

  if (!previous.hasVelocity) {
    return { ...frameVelocity, lastMoveAt: movedAt, hasVelocity: true };
  }

  return {
    dx:
      previous.dx * (1 - RECENT_SAMPLE_WEIGHT) +
      frameVelocity.dx * RECENT_SAMPLE_WEIGHT,
    dy:
      previous.dy * (1 - RECENT_SAMPLE_WEIGHT) +
      frameVelocity.dy * RECENT_SAMPLE_WEIGHT,
    lastMoveAt: movedAt,
    hasVelocity: true,
  };
}

/** A paused pointer release must not fling the wall using stale velocity. */
export function dragMomentumAtRelease(
  sample: DragMomentumSample,
  releasedAt: number,
): CameraDelta | null {
  if (
    !sample.hasVelocity ||
    releasedAt - sample.lastMoveAt > RELEASE_FRESHNESS_MS
  ) {
    return null;
  }
  return { dx: sample.dx, dy: sample.dy };
}
