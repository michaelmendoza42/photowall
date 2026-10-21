import { useEffect, useMemo, type MutableRefObject } from 'react';
import type { CameraState } from '../../state/camera.js';
import {
  buildFocusNavigation,
  cameraCenteredOnTile,
  stepFocusOrder,
  type WallFocusNavigator,
} from './focusNavigation.js';
import type { PackerResult } from './packer.js';

/**
 * Registers this wall view's next/previous handle on `navigatorRef`.
 * Each step glides the camera until the new photo is centered.
 */
export function useWallFocusNavigator(input: {
  navigatorRef: MutableRefObject<WallFocusNavigator | null> | undefined;
  packed: PackerResult;
  cameraRef: MutableRefObject<CameraState>;
  zoomRef: MutableRefObject<number>;
  glideTo: (target: { x: number; y: number }) => void;
}): void {
  const { navigatorRef, packed, cameraRef, zoomRef, glideTo } = input;
  const navigation = useMemo(() => buildFocusNavigation(packed.rows), [packed.rows]);

  useEffect(() => {
    if (!navigatorRef) return undefined;
    const navigator: WallFocusNavigator = {
      step(photoId, direction) {
        const nextId = stepFocusOrder(navigation.order, photoId, direction);
        const tile = nextId ? navigation.tilesById.get(nextId) : undefined;
        if (!nextId || !tile) return null;
        glideTo(cameraCenteredOnTile(cameraRef.current, tile, zoomRef.current));
        return nextId;
      },
    };
    navigatorRef.current = navigator;
    return () => {
      if (navigatorRef.current === navigator) navigatorRef.current = null;
    };
  }, [cameraRef, glideTo, navigation, navigatorRef, zoomRef]);
}
