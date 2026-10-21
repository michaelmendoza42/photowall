import { useEffect, useMemo, type MutableRefObject } from 'react';
import type { PhotoQueryRecord } from '../../../../shared/api/photos.js';
import { panTo, withWorldBounds, type CameraState } from '../../state/camera.js';
import type { GroupedWallFoundation } from './groupedWall.js';
import {
  buildRadialWallLayout,
  groupPhotosByDirectory,
  type RadialWallGroup,
  type RadialWallLayout,
} from './radialWall.js';
import {
  DEFAULT_MAX_ROW_HEIGHT,
  DEFAULT_MOSAIC_COLUMN_FACTORS,
  WORLD_WIDTH_MIN,
} from './worldWidth.js';

/**
 * Tile size follows the viewport-based reference width; rounding it up to
 * a step keeps small window resizes from re-laying out the whole wall
 * (and never makes tiles smaller than the viewport calls for).
 */
const REFERENCE_WIDTH_STEP_PX = 50;

/**
 * The wall's radial layout. Grouped views keep their albums as groups;
 * otherwise photos group by folder.
 */
export function useRadialWallLayout(input: {
  photos: readonly PhotoQueryRecord[];
  groupedFoundation?: GroupedWallFoundation | null;
  referenceWidth: number;
}): RadialWallLayout {
  const { photos, groupedFoundation = null, referenceWidth } = input;
  const roundedWidth = Math.max(
    WORLD_WIDTH_MIN,
    Math.ceil(referenceWidth / REFERENCE_WIDTH_STEP_PX) * REFERENCE_WIDTH_STEP_PX,
  );
  return useMemo(() => {
    const groups: RadialWallGroup[] =
      groupedFoundation?.mode === 'grouped'
        ? groupedFoundation.albums.map((album) => ({
            key: album.area.albumKey,
            photos: album.photos,
          }))
        : groupPhotosByDirectory(photos);
    return buildRadialWallLayout({
      groups,
      referenceWidth: roundedWidth,
      maxRowHeight: DEFAULT_MAX_ROW_HEIGHT,
      columnWidthFactors: DEFAULT_MOSAIC_COLUMN_FACTORS,
    });
  }, [photos, groupedFoundation, roundedWidth]);
}

/** Open each new layout on the center of the wall, where the first photos are. */
export function useCenterCameraOnLayout(input: {
  layout: RadialWallLayout;
  cameraRef: MutableRefObject<CameraState>;
  zoomRef: MutableRefObject<number>;
  publishCamera: (next: CameraState) => void;
  flushCamera: () => void;
}): void {
  const { layout, cameraRef, zoomRef, publishCamera, flushCamera } = input;
  useEffect(() => {
    if (layout.packedPhotoCount === 0) return;
    const zoom = zoomRef.current;
    const bounded = withWorldBounds(cameraRef.current, {
      width: layout.worldWidth,
      height: layout.contentHeight,
    });
    const next = panTo(bounded, {
      x: layout.worldWidth / 2 - bounded.viewport.width / (2 * zoom),
      y: layout.contentHeight / 2 - bounded.viewport.height / (2 * zoom),
    });
    cameraRef.current = next;
    publishCamera(next);
    flushCamera();
  }, [layout, cameraRef, zoomRef, publishCamera, flushCamera]);
}
