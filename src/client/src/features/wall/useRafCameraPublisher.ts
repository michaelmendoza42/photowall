import { useCallback, useEffect, useRef } from 'react';
import type { CameraState } from '../../state/camera.js';

/**
 * Coalesces high-frequency input updates while retaining the newest camera state.
 *
 * Published states reach React a frame later. `isEcho` lets the view tell those
 * echoes apart from outside camera changes, so a stale echo never rewinds the
 * live camera ref mid-gesture (which made glides jitter backward and lose
 * about half their travel).
 */
export function useRafCameraPublisher(onCameraChange: (next: CameraState) => void): {
  publish: (next: CameraState) => void;
  flush: () => void;
  isEcho: (camera: CameraState) => boolean;
} {
  const callbackRef = useRef(onCameraChange);
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<CameraState | null>(null);
  const publishedRef = useRef(new WeakSet<CameraState>());

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
    publishedRef.current.add(next);
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

  const isEcho = useCallback(
    (camera: CameraState) => publishedRef.current.has(camera),
    [],
  );

  return { publish, flush, isEcho };
}
