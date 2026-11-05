import { useEffect, useMemo, type MutableRefObject } from 'react';
import type { CameraState } from '../../state/camera.js';
import {
  buildFocusNavigation,
  cameraCenteredOnTile,
  stepFocusOrder,
  tileNearestViewportCenter,
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
  /** Zoom about the middle of the screen; views without zoom leave it out. */
  setZoom?: (zoom: number) => void;
}): void {
  const { navigatorRef, packed, cameraRef, zoomRef, glideTo, setZoom } = input;
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
      centerOn(photoId, zoom) {
        const tile = navigation.tilesById.get(photoId);
        if (!tile) return false;
        if (zoom != null && setZoom) setZoom(zoom);
        glideTo(cameraCenteredOnTile(cameraRef.current, tile, zoomRef.current));
        return true;
      },
      currentView() {
        const tile = tileNearestViewportCenter(
          cameraRef.current,
          navigation.tilesById.values(),
          zoomRef.current,
        );
        return { photoId: tile?.photoId ?? null, zoom: zoomRef.current };
      },
    };
    navigatorRef.current = navigator;
    return () => {
      if (navigatorRef.current === navigator) navigatorRef.current = null;
    };
  }, [cameraRef, glideTo, navigation, navigatorRef, setZoom, zoomRef]);
}
