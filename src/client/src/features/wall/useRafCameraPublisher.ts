import { useCallback, useEffect, useRef } from 'react';
import type { CameraState } from '../../state/camera.js';

/** Coalesces high-frequency input updates while retaining the newest camera state. */
export function useRafCameraPublisher(onCameraChange: (next: CameraState) => void): {
  publish: (next: CameraState) => void;
  flush: () => void;
} {
  const callbackRef = useRef(onCameraChange);
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<CameraState | null>(null);

  useEffect(() => {
    callbackRef.current = onCameraChange;
  }, [onCameraChange]);

  const flush = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) callbackRef.current(pending);
  }, []);

  const publish = useCallback((next: CameraState) => {
    pendingRef.current = next;
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) callbackRef.current(pending);
    });
  }, []);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  return { publish, flush };
}
