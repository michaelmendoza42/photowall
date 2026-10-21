import type { PhotoQueryRecord } from '../../../../shared/api/photos.js';
import {
  buildColumns,
  buildPackedRows,
  computeTileBounds,
  packColumnMosaic,
  type PackedRow,
  type PackedTile,
} from './packer.js';
import { WALL_TILE_SCALE } from './worldWidth.js';
import type { AlbumAreaDescriptor } from './albumAreas.js';

export interface GroupedAlbumPackInput {
  area: AlbumAreaDescriptor;
  photos: readonly PhotoQueryRecord[];
}

export interface GroupedPackerOptions {
  worldWidth: number;
  maxRowHeight: number;
  columnWidthFactors: readonly number[];
  tileScale?: number;
}

export interface GroupedPackerResult {
  rows: PackedRow[];
  tiles: PackedTile[];
  contentHeight: number;
  packedPhotoCount: number;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

export function packGroupedAlbums(
  albums: readonly GroupedAlbumPackInput[],
  options: GroupedPackerOptions,
): GroupedPackerResult {
  const {
    worldWidth,
    maxRowHeight,
    columnWidthFactors,
    tileScale = WALL_TILE_SCALE,
  } = options;

  const tiles: PackedTile[] = [];

  albums.forEach((album, mosaic) => {
    if (album.photos.length === 0) return;
    const columns = buildColumns({
      worldWidth: album.area.footprintWidth,
      factors: columnWidthFactors,
      tileScale,
    });
    if (columns.length === 0) return;

    const local = packColumnMosaic({
      photos: album.photos,
      columns,
      offsetX: album.area.anchorX - album.area.footprintWidth / 2,
      offsetY: Math.max(0, album.area.anchorY - album.area.footprintHeight / 2),
      mosaic,
    });

    tiles.push(...local.tiles);
  });

  if (tiles.length === 0) {
    return {
      rows: [],
      tiles: [],
      contentHeight: 0,
      packedPhotoCount: 0,
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    };
  }

  tiles.sort((a, b) => a.y - b.y || a.x - b.x || a.photoId.localeCompare(b.photoId));

  const bounds = computeTileBounds(tiles);
  const contentHeight = Math.max(0, bounds.maxY);

  return {
    rows: buildPackedRows(tiles, contentHeight, maxRowHeight),
    tiles,
    contentHeight,
    packedPhotoCount: tiles.length,
    bounds,
  };
}
