// Column-first mosaic layout engine.
//
// The wall reads as a staggered vertical mosaic instead of stacked
// horizontal justified rows. Photos are placed into a deterministic
// repeated set of gapless columns and each next photo lands in the
// best-scoring candidate among the shortest current columns.
//
// The layout remains deterministic for any loaded prefix of photos:
// appending more photos only extends already-established columns and
// never reflows previously packed tiles. The exported `rows` are
// virtualization bands, not visual rows — they bucket tiles by starting
// Y so the wall can keep the mounted DOM bounded while preserving the
// column-first composition.

import type { PhotoQueryRecord } from '../../../../shared/api/photos.js';
import { WALL_TILE_SCALE } from './worldWidth.js';

export interface PackerOptions {
  /** Bounded world width the wall lays out into, in CSS px. */
  worldWidth: number;
  /**
   * Nominal virtualization band height. Compatibility name retained to
   * avoid churn in callers/tests.
   */
  maxRowHeight: number;
  /**
   * Per-column multipliers applied in a repeating sequence.
   * Higher factors create wider columns; lower factors create narrower
   * ones. The sequence is deterministic, so already-laid-out tiles keep
   * identical geometry when more photos append.
   */
  columnWidthFactors?: readonly number[];
  /**
   * Wall tile-width multiplier. `1` means the previous base width;
   * smaller values make tiles narrower than the original baseline.
   */
  tileScale?: number;
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
  /**
   * Visible extent of this band in CSS px. This must cover the furthest
   * bottom edge of any tile whose top begins inside the band so visible
   * cropped portraits do not unmount early.
   */
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

export interface ColumnGeometry {
  x: number;
  width: number;
}

export interface ColumnPackedResult {
  tiles: PackedTile[];
  contentHeight: number;
  columnHeights: number[];
}

const EMPTY_RESULT: PackerResult = {
  rows: [],
  contentHeight: 0,
  packedPhotoCount: 0,
};

const UNIFORM_FACTORS: readonly number[] = [1, 1, 1, 1];
const MIN_TILE_DIMENSION_PX = 1;
const MIN_TILE_SCALE = 0.05;
const MAX_COLUMN_COUNT_GUARD = 10_000;
const TAIL_COLUMN_MERGE_RATIO = 0.7;
const CANDIDATE_COLUMN_COUNT = 3;
const DISPLAY_HEIGHT_MIN_WIDTH_RATIO = 0.58;
const DISPLAY_HEIGHT_MAX_WIDTH_RATIO = 1.75;
const FALLBACK_ASPECT_MIN_HEIGHT_MULTIPLIER = 1.5;
const SKYLINE_SPREAD_WEIGHT = 1;
const NEIGHBOR_DELTA_WEIGHT = 1.35;
const CROP_WEIGHT = 420;

/**
 * Compatibility name retained to minimize churn in the wall code. The
 * current implementation produces a column-first mosaic and returns
 * tiles bucketed into virtualization bands.
 */
export function packJustifiedRows(
  photos: readonly PhotoQueryRecord[],
  options: PackerOptions,
  _hasMore: boolean,
): PackerResult {
  const {
    worldWidth,
    maxRowHeight,
    columnWidthFactors,
    tileScale = WALL_TILE_SCALE,
  } = options;

  if (worldWidth <= 0 || maxRowHeight <= 0 || photos.length === 0) {
    return EMPTY_RESULT;
  }

  const factors = normalizeFactors(columnWidthFactors);
  const columns = buildColumns({ worldWidth, factors, tileScale });
  if (columns.length === 0) {
    return EMPTY_RESULT;
  }

  const packed = packColumnMosaic({ photos, columns });
  if (packed.tiles.length === 0 || packed.contentHeight <= 0) {
    return EMPTY_RESULT;
  }

  const rows = buildPackedRows(packed.tiles, packed.contentHeight, maxRowHeight);

  return {
    rows,
    contentHeight: packed.contentHeight,
    packedPhotoCount: packed.tiles.length,
  };
}

export function packColumnMosaic(input: {
  photos: readonly PhotoQueryRecord[];
  columns: readonly ColumnGeometry[];
  offsetX?: number;
  offsetY?: number;
}): ColumnPackedResult {
  const { photos, columns, offsetX = 0, offsetY = 0 } = input;
  if (photos.length === 0 || columns.length === 0) {
    return {
      tiles: [],
      contentHeight: 0,
      columnHeights: new Array<number>(columns.length).fill(0),
    };
  }

  const columnHeights = new Array<number>(columns.length).fill(0);
  const tiles: PackedTile[] = [];

  for (const photo of photos) {
    const placement = choosePlacement({ photo, columns, columnHeights });
    const y = columnHeights[placement.columnIndex]!;

    tiles.push({
      photoId: photo.id,
      x: placement.column.x + offsetX,
      y: y + offsetY,
      width: placement.column.width,
      height: placement.height,
      sourceWidth: photo.width,
      sourceHeight: photo.height,
    });

    columnHeights[placement.columnIndex] = y + placement.height;
  }

  return {
    tiles,
    contentHeight: Math.max(...columnHeights, 0),
    columnHeights,
  };
}

export function buildPackedRows(
  tiles: readonly PackedTile[],
  contentHeight: number,
  bandHeight: number,
): PackedRow[] {
  return buildBands(tiles, contentHeight, bandHeight);
}

export function computeTileBounds(tiles: readonly PackedTile[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  if (tiles.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const tile of tiles) {
    minX = Math.min(minX, tile.x);
    minY = Math.min(minY, tile.y);
    maxX = Math.max(maxX, tile.x + tile.width);
    maxY = Math.max(maxY, tile.y + tile.height);
  }

  return { minX, minY, maxX, maxY };
}


interface BuildColumnsInput {
  worldWidth: number;
  factors: readonly number[];
  tileScale: number;
}

interface PlacementChoice {
  columnIndex: number;
  column: ColumnGeometry;
  height: number;
}

function normalizeFactors(
  factors: readonly number[] | undefined,
): readonly number[] {
  if (!factors || factors.length === 0) return UNIFORM_FACTORS;
  const cleaned = factors.filter((f) => Number.isFinite(f) && f > 0);
  return cleaned.length === 0 ? UNIFORM_FACTORS : cleaned;
}

export function computeBaseColumnWidth(
  worldWidth: number,
  factors: readonly number[],
): number {
  const sum = factors.reduce((total, factor) => total + factor, 0);
  return sum > 0 ? worldWidth / sum : 0;
}

export function buildColumns(input: BuildColumnsInput): readonly ColumnGeometry[] {
  const { worldWidth, factors, tileScale } = input;
  if (worldWidth <= 0 || factors.length === 0) return [];

  const normalizedScale = normalizeTileScale(tileScale);
  const baseColumnWidth = computeBaseColumnWidth(worldWidth, factors);
  const scaledBaseColumnWidth = baseColumnWidth * normalizedScale;
  if (scaledBaseColumnWidth <= 0) return [];

  const columns: ColumnGeometry[] = [];
  let x = 0;
  let factorIndex = 0;

  while (worldWidth - x > 0.5) {
    if (columns.length >= MAX_COLUMN_COUNT_GUARD) break;

    const remaining = worldWidth - x;
    if (
      columns.length > 0 &&
      remaining <= scaledBaseColumnWidth * TAIL_COLUMN_MERGE_RATIO
    ) {
      columns[columns.length - 1] = {
        ...columns[columns.length - 1]!,
        width: columns[columns.length - 1]!.width + remaining,
      };
      break;
    }

    const factor = factors[factorIndex % factors.length]!;
    const idealWidth = scaledBaseColumnWidth * factor;
    const width = idealWidth >= remaining
      ? remaining
      : Math.max(MIN_TILE_DIMENSION_PX, idealWidth);

    columns.push({ x, width });
    x += width;
    factorIndex += 1;
  }

  return columns;
}

function normalizeTileScale(tileScale: number): number {
  if (!Number.isFinite(tileScale) || tileScale <= 0) {
    return WALL_TILE_SCALE;
  }
  return Math.max(MIN_TILE_SCALE, tileScale);
}

function choosePlacement(input: {
  photo: PhotoQueryRecord;
  columns: readonly ColumnGeometry[];
  columnHeights: readonly number[];
}): PlacementChoice {
  const { photo, columns, columnHeights } = input;

  const firstUnusedColumnIndex = columnHeights.findIndex((height) => height === 0);
  if (firstUnusedColumnIndex >= 0) {
    const column = columns[firstUnusedColumnIndex]!;
    return {
      columnIndex: firstUnusedColumnIndex,
      column,
      height: computeDisplayHeight(column.width, photo),
    };
  }

  const candidates = sortedColumnIndices(columnHeights).slice(0, CANDIDATE_COLUMN_COUNT);

  let best: PlacementChoice | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const columnIndex of candidates) {
    const column = columns[columnIndex]!;
    const height = computeDisplayHeight(column.width, photo);
    const score = scorePlacement({
      columnIndex,
      height,
      columns,
      columnHeights,
      photo,
    });

    if (
      best === null ||
      score < bestScore ||
      (score === bestScore && columnIndex < best.columnIndex)
    ) {
      best = { columnIndex, column, height };
      bestScore = score;
    }
  }

  return best ?? {
    columnIndex: 0,
    column: columns[0]!,
    height: computeDisplayHeight(columns[0]!.width, photo),
  };
}

/**
 * The wall is mosaic-first: it may crop through the tile's `cover`
 * rendering if that avoids large cavities and skyline spikes. This
 * clamp is the anti-overcrop guard: it allows bounded crop while still
 * keeping portraits portrait-ish and panoramas wide-ish.
 */
export function computeDisplayHeight(
  columnWidth: number,
  photo: PhotoQueryRecord,
): number {
  const idealHeight = Math.max(MIN_TILE_DIMENSION_PX, columnWidth / aspect(photo));
  const minHeightRatio = hasExplicitAspectRatio(photo)
    ? DISPLAY_HEIGHT_MIN_WIDTH_RATIO
    : DISPLAY_HEIGHT_MIN_WIDTH_RATIO * FALLBACK_ASPECT_MIN_HEIGHT_MULTIPLIER;
  const minHeight = columnWidth * minHeightRatio;
  const maxHeight = columnWidth * DISPLAY_HEIGHT_MAX_WIDTH_RATIO;
  return clamp(idealHeight, minHeight, maxHeight);
}

function scorePlacement(input: {
  columnIndex: number;
  height: number;
  columns: readonly ColumnGeometry[];
  columnHeights: readonly number[];
  photo: PhotoQueryRecord;
}): number {
  const { columnIndex, height, columns, columnHeights, photo } = input;
  const projected = columnHeights.map((current, index) =>
    index === columnIndex ? current + height : current,
  );

  const skylineSpread = Math.max(...projected) - Math.min(...projected);
  const neighborDelta = neighboringHeightPenalty(projected, columnIndex);
  const cropPenalty = computeCropPenalty(columns[columnIndex]!.width, photo, height);

  return (
    skylineSpread * SKYLINE_SPREAD_WEIGHT +
    neighborDelta * NEIGHBOR_DELTA_WEIGHT +
    cropPenalty * CROP_WEIGHT
  );
}

function sortedColumnIndices(columnHeights: readonly number[]): number[] {
  return columnHeights
    .map((height, index) => ({ height, index }))
    .sort((a, b) => a.height - b.height || a.index - b.index)
    .map((entry) => entry.index);
}

function neighboringHeightPenalty(
  projectedHeights: readonly number[],
  columnIndex: number,
): number {
  let penalty = 0;

  if (columnIndex > 0) {
    penalty += Math.abs(
      projectedHeights[columnIndex]! - projectedHeights[columnIndex - 1]!,
    );
  }
  if (columnIndex < projectedHeights.length - 1) {
    penalty += Math.abs(
      projectedHeights[columnIndex]! - projectedHeights[columnIndex + 1]!,
    );
  }

  return penalty;
}

function computeCropPenalty(
  columnWidth: number,
  photo: PhotoQueryRecord,
  displayedHeight: number,
): number {
  const idealHeight = Math.max(MIN_TILE_DIMENSION_PX, columnWidth / aspect(photo));
  const larger = Math.max(idealHeight, displayedHeight);
  if (larger <= 0) return 0;
  return Math.abs(idealHeight - displayedHeight) / larger;
}

function buildBands(
  tiles: readonly PackedTile[],
  contentHeight: number,
  bandHeight: number,
): PackedRow[] {
  const byBandIndex = new Map<number, PackedRow>();

  for (const tile of tiles) {
    const bandIndex = Math.max(0, Math.floor(tile.y / bandHeight));
    const offsetTop = bandIndex * bandHeight;

    const band = byBandIndex.get(bandIndex) ?? {
      index: bandIndex,
      offsetTop,
      height: 0,
      targetHeight: bandHeight,
      tiles: [],
    };

    band.tiles.push(tile);
    band.height = Math.max(band.height, tile.y + tile.height - band.offsetTop);
    byBandIndex.set(bandIndex, band);
  }

  return [...byBandIndex.values()].sort((a, b) => a.index - b.index);
}

function hasExplicitAspectRatio(photo: PhotoQueryRecord): boolean {
  return Number.isFinite(photo.aspectRatio) && photo.aspectRatio > 0;
}

function aspect(photo: PhotoQueryRecord): number {
  if (hasExplicitAspectRatio(photo)) {
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
