import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import type { PhotoQueryRecord } from '../../../../shared/api/photos.js';
import { panTo, withWorldBounds, type CameraState } from '../../state/camera.js';
import {
  buildFocusNavigation,
  cameraCenteredOnTile,
  tileNearestViewportCenter,
} from './focusNavigation.js';
import type { GroupedWallFoundation } from './groupedWall.js';
import type { FrameMat, FrameStyle, WallSpacing } from '../../../../shared/api/curation.js';
import { FEATURED_VIEWPORT_SHARE } from './featuredGeometry.js';
import { resolvePhotoFrame } from './featuredFrames.js';
import { framedCellAspect, insetByGap, WALL_GAP_RATIO } from './wallSpacing.js';
import {
  buildRadialWallLayout,
  groupPhotosByDirectory,
  radialMeanColumnWidth,
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
  /** Edge to edge, spaced apart, or spaced apart in frames. */
  spacing?: WallSpacing;
}): WallLayout {
  const {
    photos,
    groupedFoundation = null,
    referenceWidth,
    featuredPhotoIds,
    viewport,
    spacing = 'none',
  } = input;
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
  return useMemo(
    () =>
      buildWallLayout({
        photos,
        groupedFoundation,
        referenceWidth: roundedWidth,
        featuredPhotoIds,
        featuredBox: sizeUnknown ? null : { width: boxWidth, height: boxHeight },
        spacing,
      }),
    [photos, groupedFoundation, roundedWidth, featuredPhotoIds, boxWidth, boxHeight, sizeUnknown, spacing],
  );
}

/**
 * The wall's layout for a spacing (see useRadialWallLayout). A null
 * `featuredBox` means the wall's size isn't known yet: nothing is laid out.
 */
export function buildWallLayout(input: {
  photos: readonly PhotoQueryRecord[];
  groupedFoundation?: GroupedWallFoundation | null;
  referenceWidth: number;
  featuredPhotoIds?: ReadonlySet<string>;
  featuredBox: { width: number; height: number } | null;
  spacing: WallSpacing;
}): WallLayout {
  const { photos, groupedFoundation = null, featuredPhotoIds, featuredBox, spacing } = input;
  const boxWidth = featuredBox?.width ?? 0;
  const boxHeight = featuredBox?.height ?? 0;
  if (featuredBox === null) {
    return {
      ...buildRadialWallLayout({ groups: [], referenceWidth: 0, maxRowHeight: 0, columnWidthFactors: [] }),
      gap: 0,
      spacing,
    };
  }
  const groups: RadialWallGroup[] =
    groupedFoundation?.mode === 'grouped'
      ? groupedFoundation.albums.map((album) => ({
          key: album.area.albumKey,
          photos: album.photos,
        }))
      : groupPhotosByDirectory(photos);
  const options = {
    referenceWidth: input.referenceWidth,
    maxRowHeight: DEFAULT_MAX_ROW_HEIGHT,
    columnWidthFactors: DEFAULT_MOSAIC_COLUMN_FACTORS,
  };
  const gap = radialMeanColumnWidth(options) * WALL_GAP_RATIO[spacing];
  const featured = featuredPhotoIds ? withFeatured(groups, featuredPhotoIds) : groups;
  const layout = buildRadialWallLayout({
    ...options,
    groups: spacing === 'framed' ? framedGroups(featured, radialMeanColumnWidth(options), gap) : featured,
    raggedEdge: spacing === 'none',
    ...(spacing === 'framed'
      ? { shapeToColumn: true, levelMaxShrink: FRAMED_LEVEL_MAX_SHRINK }
      : {}),
    ...(boxWidth > 0 && boxHeight > 0
      ? { featuredBox: { width: boxWidth, height: boxHeight } }
      : {}),
  });
  if (gap <= 0) return { ...layout, gap, spacing };
  // Each tile sits half a gap in from its cell, with its photo's real size.
  const byId = new Map(photos.map((photo) => [photo.id, photo]));
  return {
    ...layout,
    rows: layout.rows.map((row) => ({
      ...row,
      tiles: row.tiles.map((tile) => {
        const photo = byId.get(tile.photoId);
        return insetByGap(
          photo ? { ...tile, sourceWidth: photo.width, sourceHeight: photo.height } : tile,
          gap,
        );
      }),
    })),
    gap,
    spacing,
  };
}

/** How much a framed cell may be shortened to line up with a neighbour. */
const FRAMED_LEVEL_MAX_SHRINK = 0.1;
/** Photos at least this wide get two columns on a framed wall. */
const FRAMED_WIDE_ASPECT = 1.9;

/** A wall layout, with the gap its tiles were drawn in from their cells. */
export type WallLayout = RadialWallLayout & { gap: number; spacing: WallSpacing };

/**
 * Groups whose photos are shaped as framed cells for packing. Featured
 * photos keep their own shape: their hero tile is sized to the screen.
 */
function framedGroups(
  groups: readonly RadialWallGroup[],
  columnWidth: number,
  gap: number,
): RadialWallGroup[] {
  const shaped = (photo: PhotoQueryRecord, width: number): PhotoQueryRecord => {
    const aspect = framedCellAspect(photo, width, gap);
    return { ...photo, width: Math.round(aspect * 10000), height: 10000, aspectRatio: aspect };
  };
  return groups.map((group) => {
    const wide = new Map<string, PhotoQueryRecord>();
    const photos = group.photos.map((photo) => {
      if (photo === group.featured) return photo;
      // Favorites hang larger, and very wide photos would be too small in
      // one column: both get two columns where they fit.
      if (photo.starred || photo.width / Math.max(1, photo.height) >= FRAMED_WIDE_ASPECT) {
        wide.set(photo.id, shaped(photo, 2 * columnWidth));
      }
      return shaped(photo, columnWidth);
    });
    return { ...group, photos, ...(wide.size > 0 ? { wide } : {}) };
  });
}

function roundBox(size: number): number {
  return Math.floor(size / FEATURED_BOX_STEP_PX) * FEATURED_BOX_STEP_PX;
}

/** How a tile is framed: a featured photo's hero frame, or a framed wall's. */
export interface TileFrame {
  style: FrameStyle;
  mat: FrameMat;
  kind: 'hero' | 'gallery';
}

/**
 * The frame each framed tile hangs in, by photo id: featured photos'
 * hero tiles always, and on a framed wall every other photo too. Unpicked
 * frames are random, picked once per page load.
 */
export function useTileFrames(
  layout: WallLayout,
  photos: readonly PhotoQueryRecord[],
  photosById: ReadonlyMap<string, PhotoQueryRecord>,
): ReadonlyMap<string, TileFrame> {
  return useMemo(() => {
    const frames = new Map<string, TileFrame>();
    if (layout.spacing === 'framed') {
      for (const photo of photos) frames.set(photo.id, { ...resolvePhotoFrame(photo), kind: 'gallery' });
    }
    for (const id of layout.featuredPhotoIds) {
      const photo = photosById.get(id);
      if (photo) frames.set(id, { ...resolvePhotoFrame(photo), kind: 'hero' });
    }
    return frames;
  }, [layout.spacing, layout.featuredPhotoIds, photos, photosById]);
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
