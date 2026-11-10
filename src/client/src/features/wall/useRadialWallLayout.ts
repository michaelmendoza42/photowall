import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import type { PhotoQueryRecord } from '../../../../shared/api/photos.js';
import { panTo, withWorldBounds, type CameraState } from '../../state/camera.js';
import {
  buildFocusNavigation,
  cameraCenteredOnTile,
  tileNearestViewportCenter,
} from './focusNavigation.js';
import type { GroupedWallFoundation } from './groupedWall.js';
import type { FeaturedFrame } from '../../../../shared/api/curation.js';
import { FEATURED_VIEWPORT_SHARE } from './featuredGeometry.js';
import { resolveFeaturedFrame } from './featuredFrames.js';
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
/** Step the hero tile's viewport box is rounded down to. */
const FEATURED_BOX_STEP_PX = 25;

/**
 * The wall's radial layout. Grouped views keep their albums as groups;
 * otherwise photos group by folder.
 */
export function useRadialWallLayout(input: {
  photos: readonly PhotoQueryRecord[];
  groupedFoundation?: GroupedWallFoundation | null;
  referenceWidth: number;
  /** Featured photos that may be drawn as their group's hero tile. */
  featuredPhotoIds?: ReadonlySet<string>;
  /** The wall's on-screen size; hero tiles fill 90% of it at the default zoom. */
  viewport?: { width: number; height: number };
}): RadialWallLayout {
  const { photos, groupedFoundation = null, referenceWidth, featuredPhotoIds, viewport } = input;
  // Rounded so small window resizes don't re-lay out the whole wall.
  const boxWidth = roundBox((viewport?.width ?? 0) * FEATURED_VIEWPORT_SHARE);
  const boxHeight = roundBox((viewport?.height ?? 0) * FEATURED_VIEWPORT_SHARE);
  const roundedWidth = Math.max(
    WORLD_WIDTH_MIN,
    Math.ceil(referenceWidth / REFERENCE_WIDTH_STEP_PX) * REFERENCE_WIDTH_STEP_PX,
  );
  // Until the wall knows its size, lay out nothing: a layout without its
  // hero tiles would open the wall on the wrong center.
  const sizeUnknown = viewport !== undefined && (viewport.width <= 0 || viewport.height <= 0);
  return useMemo(() => {
    if (sizeUnknown) return buildRadialWallLayout({ groups: [], referenceWidth: 0, maxRowHeight: 0, columnWidthFactors: [] });
    const groups: RadialWallGroup[] =
      groupedFoundation?.mode === 'grouped'
        ? groupedFoundation.albums.map((album) => ({
            key: album.area.albumKey,
            photos: album.photos,
          }))
        : groupPhotosByDirectory(photos);
    return buildRadialWallLayout({
      groups: featuredPhotoIds ? withFeatured(groups, featuredPhotoIds) : groups,
      referenceWidth: roundedWidth,
      maxRowHeight: DEFAULT_MAX_ROW_HEIGHT,
      columnWidthFactors: DEFAULT_MOSAIC_COLUMN_FACTORS,
      ...(boxWidth > 0 && boxHeight > 0
        ? { featuredBox: { width: boxWidth, height: boxHeight } }
        : {}),
    });
  }, [photos, groupedFoundation, roundedWidth, featuredPhotoIds, boxWidth, boxHeight, sizeUnknown]);
}

function roundBox(size: number): number {
  return Math.floor(size / FEATURED_BOX_STEP_PX) * FEATURED_BOX_STEP_PX;
}

/**
 * The frame each hero tile hangs in, by photo id. `random` frames are
 * picked once per page load.
 */
export function useFeaturedFrames(
  layout: RadialWallLayout,
  photosById: ReadonlyMap<string, PhotoQueryRecord>,
): ReadonlyMap<string, FeaturedFrame> {
  return useMemo(() => {
    const frames = new Map<string, FeaturedFrame>();
    for (const id of layout.featuredPhotoIds) {
      frames.set(id, resolveFeaturedFrame(photosById.get(id)?.featuredFrame, id));
    }
    return frames;
  }, [layout.featuredPhotoIds, photosById]);
}

/**
 * Give each group its featured photo. A group spanning several folders
 * can hold several; the one from the shallowest folder wins.
 */
export function withFeatured(
  groups: readonly RadialWallGroup[],
  featuredPhotoIds: ReadonlySet<string>,
): RadialWallGroup[] {
  return groups.map((group) => {
    let featured: PhotoQueryRecord | undefined;
    for (const photo of group.photos) {
      if (!featuredPhotoIds.has(photo.id)) continue;
      if (!featured || folderDepth(photo) < folderDepth(featured)) featured = photo;
    }
    return featured ? { ...group, featured } : group;
  });
}

function folderDepth(photo: PhotoQueryRecord): number {
  return photo.directoryPath === '' ? 0 : photo.directoryPath.split('/').length;
}

/**
 * Open each new selection on the center of the wall, where the first
 * photos are. When the same selection lays out again (a photo made
 * private, starred or edited, a window resize), the photo in the middle
 * of the screen stays there instead.
 */
export function useCenterCameraOnLayout(input: {
  layout: RadialWallLayout;
  /** Changes when the viewer picks a different set of albums. */
  selectionKey: string;
  cameraRef: MutableRefObject<CameraState>;
  zoomRef: MutableRefObject<number>;
  publishCamera: (next: CameraState) => void;
  flushCamera: () => void;
}): void {
  const { layout, selectionKey, cameraRef, zoomRef, publishCamera, flushCamera } = input;
  const shownRef = useRef<{ layout: RadialWallLayout; selectionKey: string } | null>(null);
  useEffect(() => {
    if (layout.packedPhotoCount === 0) return;
    const shown = shownRef.current;
    shownRef.current = { layout, selectionKey };
    if (shown?.layout === layout) return;
    const next =
      shown && shown.selectionKey === selectionKey
        ? cameraHeldOnCenterPhoto(cameraRef.current, shown.layout, layout, zoomRef.current)
        : cameraOnWallCenter(cameraRef.current, layout, zoomRef.current);
    cameraRef.current = next;
    publishCamera(next);
    flushCamera();
  }, [layout, selectionKey, cameraRef, zoomRef, publishCamera, flushCamera]);
}

function worldOf(layout: RadialWallLayout): { width: number; height: number } {
  return { width: layout.worldWidth, height: layout.contentHeight };
}

export function cameraOnWallCenter(
  camera: CameraState,
  layout: RadialWallLayout,
  zoom: number,
): CameraState {
  const bounded = withWorldBounds(camera, worldOf(layout));
  return panTo(bounded, {
    x: layout.worldWidth / 2 - bounded.viewport.width / (2 * zoom),
    y: layout.contentHeight / 2 - bounded.viewport.height / (2 * zoom),
  });
}

/**
 * Move the camera onto `next` so the photo nearest the middle of the
 * screen in `previous`, among those still on the wall, keeps its place
 * on screen.
 */
export function cameraHeldOnCenterPhoto(
  camera: CameraState,
  previous: RadialWallLayout,
  next: RadialWallLayout,
  zoom: number,
): CameraState {
  const nextTiles = buildFocusNavigation(next.rows).tilesById;
  const stillShown = [...buildFocusNavigation(previous.rows).tilesById.values()].filter(
    (tile) => nextTiles.has(tile.photoId),
  );
  const anchor = tileNearestViewportCenter(camera, stillShown, zoom);
  const bounded = withWorldBounds(camera, worldOf(next));
  const moved = anchor ? nextTiles.get(anchor.photoId) : undefined;
  if (!anchor || !moved) return bounded;
  // How far the camera sat from centering the photo, kept as is.
  const before = cameraCenteredOnTile(camera, anchor, zoom);
  const after = cameraCenteredOnTile(bounded, moved, zoom);
  return panTo(bounded, {
    x: after.x + (camera.x - before.x),
    y: after.y + (camera.y - before.y),
  });
}
