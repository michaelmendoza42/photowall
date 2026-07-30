import type { MediaVariant } from '../../../../shared/api/media.js';
import {
  resolveWallMediaSource,
  type WallMediaSourceResolver,
} from './mediaSourceResolver.js';

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
}

// Initial zoom is an overview: thumbnails keep the first real-library frame responsive.
export const FAR_ZOOM_MAX = 1.05;
export const NEAR_ZOOM_MIN = 1.7;

export function selectPixiSceneVariant(zoom: number): MediaVariant {
  if (zoom <= FAR_ZOOM_MAX) return 'thumb';
  if (zoom >= NEAR_ZOOM_MIN) return 'modal';
  return 'wall';
}

export function buildPixiSceneSprites(
  tiles: readonly PixiSceneTileInput[],
  zoom: number,
  mediaSourceResolver?: WallMediaSourceResolver,
): PixiSceneSprite[] {
  const variant = selectPixiSceneVariant(zoom);

  return tiles.map((tile) => ({
    key: tile.key,
    x: tile.x,
    y: tile.rowOffsetTop + tile.y,
    width: tile.width,
    height: tile.height,
    photoId: tile.photoId,
    src: resolveWallMediaSource(
      {
        id: tile.photoId,
        width: tile.sourceWidth ?? 0,
        height: tile.sourceHeight ?? 0,
        mtimeMs: tile.sourceMtimeMs,
      },
      variant,
      mediaSourceResolver,
    ),
    variant,
    sourceWidth: tile.sourceWidth ?? null,
    sourceHeight: tile.sourceHeight ?? null,
  }));
}
