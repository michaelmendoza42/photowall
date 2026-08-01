import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { panBy, type CameraDelta, type CameraState } from '../../state/camera.js';

/** Small residual motion added after direct wheel/trackpad pan input. */
export const WHEEL_MOMENTUM_STRENGTH = 0.08;
const WHEEL_MOMENTUM_DECAY = 0.78;
const WHEEL_MOMENTUM_MIN_SPEED = 0.12;
const WHEEL_MOMENTUM_MAX_INITIAL_SPEED = 18;

interface WheelMomentumPanOptions {
  cameraRef: MutableRefObject<CameraState>;
  publishCamera: (next: CameraState) => void;
  flushCamera: () => void;
}

interface WheelMomentumPan {
  start: (delta: CameraDelta) => void;
  cancel: () => void;
}

/**
 * Adds a deliberately short inertial tail without changing the wall's direct
 * two-axis wheel model. Reduced-motion users receive only the direct delta.
 */
export function useWheelMomentumPan(options: WheelMomentumPanOptions): WheelMomentumPan {
  const { cameraRef, publishCamera, flushCamera } = options;
  const frameRef = useRef<number | null>(null);
  const velocityRef = useRef<CameraDelta>({ dx: 0, dy: 0 });

  const cancel = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    velocityRef.current = { dx: 0, dy: 0 };
  }, []);

  const start = useCallback((delta: CameraDelta) => {
    cancel();
    if (prefersReducedMotion()) return;

    velocityRef.current = {
      dx: clampMomentumSpeed(delta.dx * WHEEL_MOMENTUM_STRENGTH),
      dy: clampMomentumSpeed(delta.dy * WHEEL_MOMENTUM_STRENGTH),
    };

    const tick = (): void => {
      const velocity = velocityRef.current;
      const next = panBy(cameraRef.current, velocity);
      cameraRef.current = next;
      publishCamera(next);

      const decayed = {
        dx: velocity.dx * WHEEL_MOMENTUM_DECAY,
        dy: velocity.dy * WHEEL_MOMENTUM_DECAY,
      };
      velocityRef.current = decayed;

      if (Math.hypot(decayed.dx, decayed.dy) <= WHEEL_MOMENTUM_MIN_SPEED) {
        frameRef.current = null;
        flushCamera();
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    if (Math.hypot(velocityRef.current.dx, velocityRef.current.dy) > 0) {
      frameRef.current = requestAnimationFrame(tick);
    }
  }, [cameraRef, cancel, flushCamera, publishCamera]);

  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handlePreferenceChange = (event: MediaQueryListEvent): void => {
      if (event.matches) cancel();
    };
    motionPreference.addEventListener('change', handlePreferenceChange);
    return () => {
      motionPreference.removeEventListener('change', handlePreferenceChange);
      cancel();
    };
  }, [cancel]);

  return { start, cancel };
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function clampMomentumSpeed(value: number): number {
  return Math.max(
    -WHEEL_MOMENTUM_MAX_INITIAL_SPEED,
    Math.min(WHEEL_MOMENTUM_MAX_INITIAL_SPEED, value),
  );
}
