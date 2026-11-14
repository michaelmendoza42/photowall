import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import type { PhotoQueryRecord } from '../../../../shared/api/photos.js';
import { panTo, withWorldBounds, type CameraState } from '../../state/camera.js';
import {
  buildFocusNavigation,
  cameraCenteredOnTile,
  tileNearestViewportCenter,
} from './focusNavigation.js';
import type { GroupedWallFoundation } from './groupedWall.js';
import type { FrameMat, FrameStyle, RandomFramePool, WallSpacing } from '../../../../shared/api/curation.js';
import { FEATURED_VIEWPORT_SHARE, featuredTileSize } from './featuredGeometry.js';
import { resolvePhotoFrame } from './featuredFrames.js';
import { insetByGap, WALL_GAP_RATIO } from './wallSpacing.js';
import { buildGalleryWallLayout } from './galleryWall.js';
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
  // On a framed wall the featured frame itself fills the box: its cell is
  // a gap larger, since every frame sits half a gap in from its cell.
  const heroBox =
    spacing === 'framed' ? { width: boxWidth + gap, height: boxHeight + gap } : { width: boxWidth, height: boxHeight };
  const maxTileHeight = montageTileCap(featured, heroBox, gap);
  const layout = spacing === 'framed'
    ? buildGalleryWallLayout({
        groups: featured,
        large: largeFramedPhotos(featured),
        columnWidth: radialMeanColumnWidth(options),
        gap,
        maxRowHeight: options.maxRowHeight,
        ...(boxWidth > 0 && boxHeight > 0 ? { heroBox } : {}),
        ...(maxTileHeight ? { maxTileHeight } : {}),
      })
    : buildRadialWallLayout({
        ...options,
        groups: featured,
        ...(maxTileHeight ? { maxTileHeight } : {}),
        raggedEdge: spacing === 'none',
        ...(boxWidth > 0 && boxHeight > 0 ? { featuredBox: heroBox } : {}),
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

/** Photos at least this wide hang larger on a framed wall. */
const FRAMED_WIDE_ASPECT = 1.9;

/**
 * The largest any other photo may hang, as a share of the smallest
 * featured photo's area on the wall (frames included): a featured photo
 * is always at least twice the size of everything around it.
 */
export const MONTAGE_MAX_AREA_SHARE = 0.5;

/**
 * The tallest a cell `width` wide may be so its tile (drawn a gap smaller)
 * stays within the montage's share of the smallest featured photo, or
 * null without featured photos on the wall. `heroBox` is the box hero
 * cells fit in; they are drawn a gap smaller too.
 */
function montageTileCap(
  groups: readonly RadialWallGroup[],
  heroBox: { width: number; height: number },
  gap: number,
): ((width: number) => number) | null {
  let smallest = Number.POSITIVE_INFINITY;
  for (const group of groups) {
    if (!group.featured || group.photos.length < 2) continue;
    const size = featuredTileSize(group.featured, heroBox);
    smallest = Math.min(smallest, Math.max(0, size.width - gap) * Math.max(0, size.height - gap));
  }
  if (!Number.isFinite(smallest)) return null;
  const area = smallest * MONTAGE_MAX_AREA_SHARE;
  return (width) => area / Math.max(1, width - gap) + gap;
}

/** A wall layout, with the gap its tiles were drawn in from their cells. */
export type WallLayout = RadialWallLayout & { gap: number; spacing: WallSpacing };

/**
 * Photos that hang larger on a framed wall: favorites, and photos too
 * wide to be anything but tiny at the usual width. Featured photos have
 * their own size.
 */
function largeFramedPhotos(groups: readonly RadialWallGroup[]): Set<string> {
  const large = new Set<string>();
  for (const group of groups) {
    for (const photo of group.photos) {
      if (photo === group.featured) continue;
      if (photo.starred || photo.width / Math.max(1, photo.height) >= FRAMED_WIDE_ASPECT) large.add(photo.id);
    }
  }
  return large;
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
  randomFrames: RandomFramePool = 'standard',
): ReadonlyMap<string, TileFrame> {
  return useMemo(() => {
    const frames = new Map<string, TileFrame>();
    if (layout.spacing === 'framed') {
      for (const photo of photos) frames.set(photo.id, { ...resolvePhotoFrame(photo, randomFrames), kind: 'gallery' });
    }
    for (const id of layout.featuredPhotoIds) {
      const photo = photosById.get(id);
      if (photo) frames.set(id, { ...resolvePhotoFrame(photo, randomFrames), kind: 'hero' });
    }
    return frames;
  }, [layout.spacing, layout.featuredPhotoIds, photos, photosById, randomFrames]);
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

/**
 * Where a selection opens: front and center on its featured photo (the
 * one nearest the middle of the wall, if several albums have one), or on
 * the middle of the wall without one.
 */
export function cameraOnWallCenter(
  camera: CameraState,
  layout: RadialWallLayout,
  zoom: number,
): CameraState {
  const bounded = withWorldBounds(camera, worldOf(layout));
  const middle = { x: layout.worldWidth / 2, y: layout.contentHeight / 2 };
  let target = middle;
  let nearest = Number.POSITIVE_INFINITY;
  for (const row of layout.rows) {
    for (const tile of row.tiles) {
      if (tile.duplicate || !layout.featuredPhotoIds.has(tile.photoId)) continue;
      const center = { x: tile.x + tile.width / 2, y: tile.y + tile.height / 2 };
      const distance = Math.hypot(center.x - middle.x, center.y - middle.y);
      if (distance < nearest) {
        nearest = distance;
        target = center;
      }
    }
  }
  return panTo(bounded, {
    x: target.x - bounded.viewport.width / (2 * zoom),
    y: target.y - bounded.viewport.height / (2 * zoom),
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
