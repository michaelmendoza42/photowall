import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import {
  panBy,
  type CameraDelta,
  type CameraState,
} from '../../state/camera.js';

/** Small residual motion added after direct wheel/trackpad pan input. */
export const WHEEL_MOMENTUM_STRENGTH = 0.08;
/** Recent drag velocity is already normalized to one animation frame. */
export const DRAG_MOMENTUM_STRENGTH = 0.9;
const MOMENTUM_DECAY = 0.78;
const MOMENTUM_MIN_SPEED = 0.12;
const MOMENTUM_MAX_INITIAL_SPEED = 18;

interface PanMomentumOptions {
  cameraRef: MutableRefObject<CameraState>;
  publishCamera: (next: CameraState) => void;
  flushCamera: () => void;
}

interface PanMomentum {
  startWheel: (delta: CameraDelta) => void;
  startDrag: (velocityPerFrame: CameraDelta) => void;
  cancel: () => void;
}

/**
 * Adds a deliberately short inertial tail without changing the wall's direct
 * two-axis input model. Reduced-motion users receive only the direct delta.
 */
export function usePanMomentum(options: PanMomentumOptions): PanMomentum {
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

  const startMomentum = useCallback(
    (velocity: CameraDelta) => {
      cancel();
      if (prefersReducedMotion()) return;

      velocityRef.current = {
        dx: clampMomentumSpeed(velocity.dx),
        dy: clampMomentumSpeed(velocity.dy),
      };

      const tick = (): void => {
        const currentVelocity = velocityRef.current;
        const next = panBy(cameraRef.current, currentVelocity);
        cameraRef.current = next;
        publishCamera(next);

        const decayed = {
          dx: currentVelocity.dx * MOMENTUM_DECAY,
          dy: currentVelocity.dy * MOMENTUM_DECAY,
        };
        velocityRef.current = decayed;

        if (Math.hypot(decayed.dx, decayed.dy) <= MOMENTUM_MIN_SPEED) {
          frameRef.current = null;
          flushCamera();
          return;
        }
        frameRef.current = requestAnimationFrame(tick);
      };

      if (Math.hypot(velocityRef.current.dx, velocityRef.current.dy) > 0) {
        frameRef.current = requestAnimationFrame(tick);
      }
    },
    [cameraRef, cancel, flushCamera, publishCamera],
  );

  const startWheel = useCallback(
    (delta: CameraDelta) => {
      startMomentum({
        dx: delta.dx * WHEEL_MOMENTUM_STRENGTH,
        dy: delta.dy * WHEEL_MOMENTUM_STRENGTH,
      });
    },
    [startMomentum],
  );

  const startDrag = useCallback(
    (velocityPerFrame: CameraDelta) => {
      startMomentum({
        dx: velocityPerFrame.dx * DRAG_MOMENTUM_STRENGTH,
        dy: velocityPerFrame.dy * DRAG_MOMENTUM_STRENGTH,
      });
    },
    [startMomentum],
  );

  useEffect(() => {
    const motionPreference = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    );
    const handlePreferenceChange = (event: MediaQueryListEvent): void => {
      if (event.matches) cancel();
    };
    motionPreference.addEventListener('change', handlePreferenceChange);
    return () => {
      motionPreference.removeEventListener('change', handlePreferenceChange);
      cancel();
    };
  }, [cancel]);

  return { startWheel, startDrag, cancel };
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function clampMomentumSpeed(value: number): number {
  return Math.max(
    -MOMENTUM_MAX_INITIAL_SPEED,
    Math.min(MOMENTUM_MAX_INITIAL_SPEED, value),
  );
}
