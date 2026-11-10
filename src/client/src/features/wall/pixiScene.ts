import {
  MEDIA_VARIANT_SPECS,
  type MediaVariant,
} from '../../../../shared/api/media.js';
import {
  resolveWallMediaSource,
  type WallMediaSourceResolver,
} from './mediaSourceResolver.js';
import type { FeaturedFrame } from '../../../../shared/api/curation.js';
import { featuredPhotoRect } from './featuredGeometry.js';

export interface PixiSceneTileInput {
  key: string;
  rowOffsetTop: number;
  x: number;
  y: number;
  width: number;
  height: number;
  photoId: string;
  sourceWidth?: number;
  sourceHeight?: number;
  sourceMtimeMs?: number;
  /** Changes when the curator edits the photo, so its URL changes too. */
  sourceEditVersion?: string;
  /** Draw order (higher on top); defaults to list order. */
  zOrder?: number;
  /** An album's hero tile: screen-sharp at every zoom, overview included. */
  featured?: boolean;
  /** A hero tile's frame: the tile is the frame, the photo sits inside it uncropped. */
  frame?: FeaturedFrame;
}

export interface PixiSceneSprite {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  photoId: string;
  src: string;
  variant: MediaVariant;
  sourceWidth: number | null;
  sourceHeight: number | null;
  /** Whether any part of the tile is on screen. */
  onScreen: boolean;
  /** Load order: on-screen tiles nearest the viewport center come first. */
  priority: number;
  zOrder?: number;
  /**
   * A hero tile's frame: the full tile rectangle, drawn under the photo,
   * which sits inside it uncropped.
   */
  frame?: { x: number; y: number; width: number; height: number; style: FeaturedFrame };
}

/** Screen size and device pixel ratio the wall is drawn at. */
export interface PixiSceneView {
  width: number;
  height: number;
  pixelRatio: number;
}

// Initial zoom is an overview: thumbnails keep the first real-library frame responsive.
export const FAR_ZOOM_MAX = 1.05;

/** Wall tiers, smallest to largest. */
export const WALL_VARIANT_TIERS: readonly MediaVariant[] = ['thumb', 'wall', 'modal', 'detail'];

/** A tier may be stretched this much before the next tier is requested. */
const TIER_UPSCALE_TOLERANCE = 1.1;

export function variantRank(variant: MediaVariant): number {
  return WALL_VARIANT_TIERS.indexOf(variant);
}

/**
 * Past the overview zoom, each on-screen tile gets the smallest tier that
 * covers its drawn size in device pixels (never more than the source has).
 * Off-screen tiles stay on thumbnails so zooming in only pays for what is
 * visible.
 */
export function selectTileVariant(input: {
  zoom: number;
  onScreen: boolean;
  /** Longest drawn edge in device pixels. */
  displayLongEdge: number;
  sourceLongEdge: number | null;
  /** Hero tiles stay sharp even on the zoomed-out overview. */
  featured?: boolean;
}): MediaVariant {
  if (!input.onScreen || (input.zoom <= FAR_ZOOM_MAX && !input.featured)) return 'thumb';
  return variantForDrawnSize(input.displayLongEdge, input.sourceLongEdge);
}

/** Smallest tier covering a drawn long edge (device px), capped at the source size. */
export function variantForDrawnSize(
  displayLongEdge: number,
  sourceLongEdge: number | null,
): MediaVariant {
  const needed =
    sourceLongEdge && sourceLongEdge > 0
      ? Math.min(displayLongEdge, sourceLongEdge)
      : displayLongEdge;
  for (const variant of WALL_VARIANT_TIERS) {
    if (MEDIA_VARIANT_SPECS[variant].longEdge * TIER_UPSCALE_TOLERANCE >= needed) {
      return variant;
    }
  }
  return WALL_VARIANT_TIERS[WALL_VARIANT_TIERS.length - 1]!;
}

/** Higher ratios cost GPU memory without a visible gain. */
const MAX_PIXEL_RATIO = 3;

/** Device pixel ratio the wall draws at. */
export function wallPixelRatio(): number {
  const ratio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return Math.min(MAX_PIXEL_RATIO, Math.max(1, ratio));
}

export function buildPixiSceneSprites(
  tiles: readonly PixiSceneTileInput[],
  zoom: number,
  view: PixiSceneView,
  mediaSourceResolver?: WallMediaSourceResolver,
): PixiSceneSprite[] {
  const centerX = view.width / 2;
  const centerY = view.height / 2;

  return tiles.map((tile) => {
    const y = tile.rowOffsetTop + tile.y;
    // Tile coordinates are viewport-relative world units; zoom maps them to CSS px.
    const left = tile.x * zoom;
    const top = y * zoom;
    const right = left + tile.width * zoom;
    const bottom = top + tile.height * zoom;
    const onScreen = right > 0 && left < view.width && bottom > 0 && top < view.height;
    const distance = Math.hypot((left + right) / 2 - centerX, (top + bottom) / 2 - centerY);
    const sourceLongEdge =
      tile.sourceWidth && tile.sourceHeight
        ? Math.max(tile.sourceWidth, tile.sourceHeight)
        : null;
    const variant = selectTileVariant({
      zoom,
      onScreen,
      displayLongEdge: Math.max(tile.width, tile.height) * zoom * view.pixelRatio,
      sourceLongEdge,
      featured: tile.featured === true,
    });

    const tileRect = { x: tile.x, y, width: tile.width, height: tile.height };
    // A framed photo sits inside its frame, uncropped.
    const photoRect =
      tile.frame && tile.sourceWidth && tile.sourceHeight
        ? featuredPhotoRect(tileRect, { width: tile.sourceWidth, height: tile.sourceHeight })
        : tileRect;
    return {
      key: tile.key,
      ...(tile.zOrder !== undefined ? { zOrder: tile.zOrder } : {}),
      ...(tile.frame && photoRect !== tileRect ? { frame: { ...tileRect, style: tile.frame } } : {}),
      x: photoRect.x,
      y: photoRect.y,
      width: photoRect.width,
      height: photoRect.height,
      photoId: tile.photoId,
      src: resolveWallMediaSource(
        {
          id: tile.photoId,
          width: tile.sourceWidth ?? 0,
          height: tile.sourceHeight ?? 0,
          mtimeMs: tile.sourceMtimeMs,
          editVersion: tile.sourceEditVersion,
        },
        variant,
        mediaSourceResolver,
      ),
      variant,
      sourceWidth: tile.sourceWidth ?? null,
      sourceHeight: tile.sourceHeight ?? null,
      onScreen,
      priority: onScreen ? -distance : -1e6 - distance,
    };
  });
}

/** Largest tier any on-screen sprite asks for (diagnostics and tests). */
export function largestOnScreenVariant(sprites: readonly PixiSceneSprite[]): MediaVariant {
  let largest: MediaVariant = 'thumb';
  for (const sprite of sprites) {
    if (sprite.onScreen && variantRank(sprite.variant) > variantRank(largest)) {
      largest = sprite.variant;
    }
  }
  return largest;
}

/**
 * The centered region of a `source`-sized image that has the `target`
 * shape, in source pixels: CSS `object-fit: cover` as a texture frame.
 * Tiles may crop their photo but never stretch it.
 */
export function coverCropFrame(
  source: { width: number; height: number },
  target: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  if (source.width <= 0 || source.height <= 0 || target.width <= 0 || target.height <= 0) {
    return { x: 0, y: 0, width: Math.max(0, source.width), height: Math.max(0, source.height) };
  }
  const scale = Math.max(target.width / source.width, target.height / source.height);
  const width = Math.min(source.width, target.width / scale);
  const height = Math.min(source.height, target.height / scale);
  return {
    x: (source.width - width) / 2,
    y: (source.height - height) / 2,
    width,
    height,
  };
}

/**
 * Draw order matching the DOM hit targets: rows stack in order (each row
 * is its own stacking context), and inside a row, higher layers win.
 */
export function wallTileZOrder(rowIndex: number, layer: number, tileIndex: number): number {
  return rowIndex * 1_000_000 + layer * 100_000 + tileIndex;
}
