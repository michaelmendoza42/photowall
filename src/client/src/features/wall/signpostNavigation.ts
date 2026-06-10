import type { CameraState } from '../../state/camera.js';
import { wrapTravelOffset } from '../../state/camera.js';

export function computeWrapAwareCameraTarget(input: {
  camera: CameraState;
  targetX: number;
  targetY: number;
}): { x: number; y: number } {
  const { camera, targetX, targetY } = input;
  const targetWrappedX = targetX - camera.viewport.width / 2;
  const targetWrappedY = targetY - camera.viewport.height / 2;
  const nextX = camera.x + shortestWrappedDelta(targetWrappedX - wrapTravelOffset(camera.x, camera.world.width), camera.world.width);
  const verticalPeriod = camera.world.height ?? 0;
  const nextY =
    verticalPeriod > 0
      ? camera.y + shortestWrappedDelta(targetWrappedY - wrapTravelOffset(camera.y, verticalPeriod), verticalPeriod)
      : targetWrappedY;
  return { x: nextX, y: nextY };
}

export function easeOutCubic(progress: number): number {
  const t = Math.min(Math.max(progress, 0), 1);
  return 1 - Math.pow(1 - t, 3);
}

function shortestWrappedDelta(delta: number, period: number): number {
  if (!Number.isFinite(period) || period <= 0) return delta;
  const wrapped = ((delta + period / 2) % period + period) % period - period / 2;
  if (wrapped === -period / 2 && delta > 0) {
    return period / 2;
  }
  return wrapped;
}
