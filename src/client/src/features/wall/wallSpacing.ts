// How the wall is hung: edge to edge, spaced apart, or spaced apart in
// frames. The app works out the gap from the tile size; nobody picks it.
//
// Spaced walls lay out exactly like the edge-to-edge wall, then draw each
// tile half a gap in from its cell. Framed walls lay out each photo as its
// framed cell (the photo, uncropped, plus a frame band and the gap), so
// where the mosaic stretches a cell to keep seams short, the mat takes up
// the difference and the photo is never cropped. The band is the same for
// every frame and mat, so picking one never moves the wall.

import type { FrameMat, WallSpacing } from '../../../../shared/api/curation.js';
import type { Rect } from './featuredGeometry.js';

/** Gap between tiles as a share of the mean column width. */
export const WALL_GAP_RATIO: Record<WallSpacing, number> = {
  none: 0,
  spaced: 0.06,
  framed: 0.12,
};

/**
 * A framed photo's border (moulding plus mat) as a share of the photo's
 * shorter side, the same for every frame and mat.
 */
export const GALLERY_FRAME_BAND_RATIO = 0.17;

export interface PhotoShape {
  width: number;
  height: number;
}

function aspectOf(photo: PhotoShape): number {
  return photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 1;
}

/**
 * The shape (width / height) of a photo's framed cell in a column
 * `columnWidth` wide: photo, frame band and gap.
 */
export function framedCellAspect(photo: PhotoShape, columnWidth: number, gap: number): number {
  const aspect = aspectOf(photo);
  const band = 2 * GALLERY_FRAME_BAND_RATIO;
  const inner = Math.max(1, columnWidth - gap);
  // The band follows the photo's shorter side.
  const framedHeight =
    aspect >= 1
      ? (inner / (aspect + band)) * (1 + band)
      : (inner / (1 + band)) * (1 / aspect + band);
  return columnWidth / (framedHeight + gap);
}

/** `rect` shrunk by half the gap on every side. */
export function insetByGap<T extends { x: number; y: number; width: number; height: number }>(
  rect: T,
  gap: number,
): T {
  if (gap <= 0) return rect;
  const half = gap / 2;
  return {
    ...rect,
    x: rect.x + half,
    y: rect.y + half,
    width: Math.max(1, rect.width - gap),
    height: Math.max(1, rect.height - gap),
  };
}

/**
 * Where the photo sits in a framed tile, uncropped and centered, and how
 * wide the moulding is. `mouldingShare` is the frame style's moulding as
 * a share of the photo's shorter side; with no mat the photo grows to the
 * moulding, otherwise the mat fills the rest of the band.
 */
export function galleryFrameGeometry(
  tile: Rect,
  photo: PhotoShape,
  mouldingShare: number,
  mat: FrameMat,
): { photo: Rect; moulding: number } {
  const aspect = aspectOf(photo);
  const share = mat === 'none' ? mouldingShare : Math.max(mouldingShare, GALLERY_FRAME_BAND_RATIO);
  const band = 2 * share;
  const short =
    aspect >= 1
      ? Math.min(tile.width / (aspect + band), tile.height / (1 + band))
      : Math.min(tile.width / (1 + band), tile.height / (1 / aspect + band));
  const width = aspect >= 1 ? short * aspect : short;
  const height = aspect >= 1 ? short : short / aspect;
  return {
    photo: {
      x: tile.x + (tile.width - width) / 2,
      y: tile.y + (tile.height - height) / 2,
      width,
      height,
    },
    moulding: mouldingShare * short,
  };
}

/**
 * Width / height of a frame drawn tight around a photo (no extra mat):
 * the photo plus its moulding, and its mat unless there is none.
 */
export function framedPhotoAspect(photo: PhotoShape, mouldingShare: number, mat: FrameMat): number {
  const aspect = aspectOf(photo);
  const share = mat === 'none' ? mouldingShare : Math.max(mouldingShare, GALLERY_FRAME_BAND_RATIO);
  const band = 2 * share;
  return aspect >= 1 ? (aspect + band) / (1 + band) : (1 + band) / (1 / aspect + band);
}
