// Column-first mosaic layout engine.
//
// The wall now reads as a staggered vertical mosaic instead of stacked
// horizontal justified rows. Photos are placed into a fixed set of
// gapless columns whose widths vary by a deterministic factor list.
// Each next photo goes into the current shortest column, producing
// strong vertical seams and irregular horizontal break lines.
//
// The layout is still deterministic for any loaded prefix of photos:
// appending more photos only extends the shortest columns and never
// reflows already-placed tiles. The exported `rows` are virtualization
// bands, not visual rows — they bucket tiles by starting Y so the wall
// can keep the mounted DOM bounded while preserving the column-first
// composition.

import type { PhotoQueryRecord } from '../../../../shared/api/photos.js';

export interface PackerOptions {
  /** Bounded world width the wall lays out into, in CSS px. */
  worldWidth: number;
  /** Preferred tile span used to derive the minimum tile height. */
  targetRowHeight: number;
  /** Hard ceiling on tile height and virtualization band height. */
  maxRowHeight: number;
  /**
   * Per-column multipliers applied across the bounded world width.
   * Higher factors create wider columns; lower factors create narrower
   * ones. The sequence is deterministic, so already-laid-out tiles keep
   * identical geometry when more photos append.
   */
  columnWidthFactors?: readonly number[];
}

export interface PackedTile {
  photoId: string;
  /** Horizontal offset of the tile, relative to the world origin. */
  x: number;
  /** Vertical offset of the tile, relative to the world origin. */
  y: number;
  width: number;
  height: number;
  /** Source dimensions, kept so consumers can pick a media variant. */
  sourceWidth: number;
  sourceHeight: number;
}

export interface PackedRow {
  /** Virtualization band index from the top of the wall (0-based). */
  index: number;
  /** Y offset of the band's top relative to the world origin. */
  offsetTop: number;
  /** Band height in CSS px. */
  height: number;
  /** Nominal band height used to bucket tiles. */
  targetHeight: number;
  /** Tiles whose top edge starts inside this band. */
  tiles: PackedTile[];
}

export interface PackerResult {
  rows: PackedRow[];
  /** Height of the tallest column — drives the world's vertical extent. */
  contentHeight: number;
  /** All currently loaded photos are packed immediately. */
  packedPhotoCount: number;
}

const EMPTY_RESULT: PackerResult = {
  rows: [],
  contentHeight: 0,
  packedPhotoCount: 0,
};

const UNIFORM_FACTORS: readonly number[] = [1, 1, 1, 1];
const MIN_TILE_HEIGHT_FLOOR = 140;
const MIN_TILE_HEIGHT_RATIO = 0.56;

/**
 * Legacy name retained to minimize churn in the wall code. The current
 * implementation produces a column-first mosaic and returns tiles
 * bucketed into virtualization bands.
 */
export function packJustifiedRows(
  photos: readonly PhotoQueryRecord[],
  options: PackerOptions,
  _hasMore: boolean,
): PackerResult {
  const { worldWidth, targetRowHeight, maxRowHeight, columnWidthFactors } =
    options;
  if (worldWidth <= 0 || targetRowHeight <= 0 || photos.length === 0) {
    return EMPTY_RESULT;
  }

  const factors = normalizeFactors(columnWidthFactors);
  const columns = buildColumns(worldWidth, factors);
  const minTileHeight = Math.min(
    maxRowHeight,
    Math.max(MIN_TILE_HEIGHT_FLOOR, targetRowHeight * MIN_TILE_HEIGHT_RATIO),
  );

  const columnHeights = new Array<number>(columns.length).fill(0);
  const tiles: PackedTile[] = [];

  for (const photo of photos) {
    const columnIndex = shortestColumnIndex(columnHeights);
    const column = columns[columnIndex]!;
    const rawHeight = column.width / aspect(photo);
    const height = clamp(rawHeight, minTileHeight, maxRowHeight);
    const y = columnHeights[columnIndex]!;

    tiles.push({
      photoId: photo.id,
      x: column.x,
      y,
      width: column.width,
      height,
      sourceWidth: photo.width,
      sourceHeight: photo.height,
    });

    columnHeights[columnIndex] = y + height;
  }

  const contentHeight = Math.max(...columnHeights, 0);
  if (tiles.length === 0 || contentHeight <= 0) {
    return EMPTY_RESULT;
  }

  const rows = buildBands(tiles, contentHeight, maxRowHeight);

  return {
    rows,
    contentHeight,
    packedPhotoCount: tiles.length,
  };
}

interface ColumnGeometry {
  x: number;
  width: number;
}

function normalizeFactors(
  factors: readonly number[] | undefined,
): readonly number[] {
  if (!factors || factors.length === 0) return UNIFORM_FACTORS;
  const cleaned = factors.filter((f) => Number.isFinite(f) && f > 0);
  return cleaned.length === 0 ? UNIFORM_FACTORS : cleaned;
}

function buildColumns(
  worldWidth: number,
  factors: readonly number[],
): readonly ColumnGeometry[] {
  const sum = factors.reduce((total, factor) => total + factor, 0);
  let x = 0;
  return factors.map((factor, index) => {
    const width =
      index === factors.length - 1
        ? worldWidth - x
        : (factor / sum) * worldWidth;
    const column = { x, width };
    x += width;
    return column;
  });
}

function shortestColumnIndex(columnHeights: readonly number[]): number {
  let index = 0;
  let min = columnHeights[0] ?? 0;
  for (let i = 1; i < columnHeights.length; i++) {
    const value = columnHeights[i] ?? 0;
    if (value < min) {
      min = value;
      index = i;
    }
  }
  return index;
}

function buildBands(
  tiles: readonly PackedTile[],
  contentHeight: number,
  bandHeight: number,
): PackedRow[] {
  const bandCount = Math.max(1, Math.ceil(contentHeight / bandHeight));
  const rows: PackedRow[] = Array.from({ length: bandCount }, (_, index) => ({
    index,
    offsetTop: index * bandHeight,
    height:
      index === bandCount - 1
        ? contentHeight - index * bandHeight || bandHeight
        : bandHeight,
    targetHeight: bandHeight,
    tiles: [],
  }));

  for (const tile of tiles) {
    const bandIndex = Math.min(
      rows.length - 1,
      Math.max(0, Math.floor(tile.y / bandHeight)),
    );
    rows[bandIndex]!.tiles.push(tile);
  }

  return rows;
}

function aspect(photo: PhotoQueryRecord): number {
  if (Number.isFinite(photo.aspectRatio) && photo.aspectRatio > 0) {
    return photo.aspectRatio;
  }
  if (photo.height > 0) {
    return photo.width / photo.height;
  }
  return 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
