// Column-first mosaic layout engine.
//
// Photos are placed into a deterministic set of gapless columns and each
// next photo lands in the best-scoring candidate among the shortest
// current columns. To keep seams few and short, column boundaries are not
// fixed: whenever two neighbouring columns line up, the boundary between
// them moves sideways, so the seam above ends in a T-junction instead of
// running on down the wall. Placement favours lining up a pair whose
// shared seam has run long, cropping the tile slightly if needed.
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
  /**
   * Which column of its mosaic the tile was stacked in. A lane's tiles
   * form one gapless vertical stack even as its boundaries shift.
   */
  lane: number;
  /** Which mosaic the tile belongs to (one per album area when grouped). */
  mosaic: number;
  /**
   * A repeat of a photo shown elsewhere, used for the wall's ragged outer
   * edge where tiles overlap; next/previous skip these.
   */
  duplicate?: boolean;
  /** Draw order: higher layers draw over lower ones (edge overlaps). */
  layer?: number;
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
export const DISPLAY_HEIGHT_MIN_WIDTH_RATIO = 0.58;
const DISPLAY_HEIGHT_MAX_WIDTH_RATIO = 1.75;
const FALLBACK_ASPECT_MIN_HEIGHT_MULTIPLIER = 1.5;
export const SKYLINE_SPREAD_WEIGHT = 1;
export const NEIGHBOR_DELTA_WEIGHT = 1.35;
export const CROP_WEIGHT = 420;
/** Column bottoms closer than this count as lined up. */
export const ALIGN_EPSILON_PX = 0.5;
/** Reward per px of seam that lining up a pair would end, up to the cap. */
export const SEAM_LEVEL_WEIGHT = 0.4;
/** Seams shorter than this (× column width) are fine and earn no bonus. */
export const SEAM_FREE_RUN_PX = 0.6;
export const SEAM_BONUS_CAP_RATIO = 6;
/** Boundary positions a lined-up pair may move to, as the left share. */
const RESPLIT_RATIOS: readonly number[] = [0.36, 0.44, 0.5, 0.56, 0.64];
/** Smallest boundary move worth making, as a share of the pair's width. */
const RESPLIT_MIN_SHIFT = 0.06;
/** Column widths stay within this range of the original widths. */
export const RESPLIT_MIN_WIDTH_RATIO = 0.8;
export const RESPLIT_MAX_WIDTH_RATIO = 1.25;
export const LEVEL_MAX_CROP = 0.25;

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
  mosaic?: number;
}): ColumnPackedResult {
  const { photos, offsetX = 0, offsetY = 0, mosaic = 0 } = input;
  if (photos.length === 0 || input.columns.length === 0) {
    return {
      tiles: [],
      contentHeight: 0,
      columnHeights: new Array<number>(input.columns.length).fill(0),
    };
  }

  // Columns are working state: lined-up neighbours trade width.
  const columns = input.columns.map((column) => ({ ...column }));
  const minWidth =
    Math.min(...input.columns.map((column) => column.width)) * RESPLIT_MIN_WIDTH_RATIO;
  const maxWidth =
    Math.max(...input.columns.map((column) => column.width)) * RESPLIT_MAX_WIDTH_RATIO;
  const columnHeights = new Array<number>(columns.length).fill(0);
  // Where the straight seam between column b and b + 1 currently starts.
  const seamStarts = new Array<number>(Math.max(0, columns.length - 1)).fill(0);
  const tiles: PackedTile[] = [];

  for (const photo of photos) {
    const placement = choosePlacement({ photo, columns, columnHeights, seamStarts });
    const lane = placement.columnIndex;
    const column = columns[lane]!;
    const y = columnHeights[lane]!;

    tiles.push({
      photoId: photo.id,
      x: column.x + offsetX,
      y: y + offsetY,
      width: column.width,
      height: placement.height,
      sourceWidth: photo.width,
      sourceHeight: photo.height,
      lane,
      mosaic,
    });

    columnHeights[lane] = placement.levelTo ?? y + placement.height;

    for (const boundary of [lane - 1, lane]) {
      if (boundary < 0 || boundary >= columns.length - 1) continue;
      const top = columnHeights[boundary]!;
      if (Math.abs(top - columnHeights[boundary + 1]!) > ALIGN_EPSILON_PX) continue;
      if (resplitBoundary(columns, boundary, minWidth, maxWidth)) {
        seamStarts[boundary] = top;
      }
    }
  }

  return {
    tiles,
    contentHeight: Math.max(...columnHeights, 0),
    columnHeights,
  };
}

/**
 * Move the boundary between two lined-up columns as far as the allowed
 * splits permit, so the seam above does not continue below. Returns
 * whether it moved.
 */
export function resplitBoundary(
  columns: ColumnGeometry[],
  boundary: number,
  minWidth: number,
  maxWidth: number,
): boolean {
  const left = columns[boundary]!;
  const right = columns[boundary + 1]!;
  const total = left.width + right.width;
  const current = left.width / total;

  let bestRatio: number | null = null;
  for (const ratio of RESPLIT_RATIOS) {
    const leftWidth = total * ratio;
    const rightWidth = total - leftWidth;
    if (Math.min(leftWidth, rightWidth) < minWidth) continue;
    if (Math.max(leftWidth, rightWidth) > maxWidth) continue;
    if (Math.abs(ratio - current) < RESPLIT_MIN_SHIFT) continue;
    if (bestRatio === null || Math.abs(ratio - current) > Math.abs(bestRatio - current)) {
      bestRatio = ratio;
    }
  }
  if (bestRatio === null) return false;

  const leftWidth = total * bestRatio;
  columns[boundary] = { x: left.x, width: leftWidth };
  columns[boundary + 1] = { x: left.x + leftWidth, width: total - leftWidth };
  return true;
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
  height: number;
  /**
   * Exact bottom when the tile was sized to line up with a neighbour, so
   * float error never leaves the pair a hair apart.
   */
  levelTo?: number;
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
  seamStarts: readonly number[];
}): PlacementChoice {
  const { photo, columns, columnHeights, seamStarts } = input;

  const firstUnusedColumnIndex = columnHeights.findIndex((height) => height === 0);
  if (firstUnusedColumnIndex >= 0) {
    return {
      columnIndex: firstUnusedColumnIndex,
      height: computeDisplayHeight(columns[firstUnusedColumnIndex]!.width, photo),
    };
  }

  const seamBonus = (boundary: number): number => {
    const reference = columns[boundary]!.width;
    const run =
      Math.min(columnHeights[boundary]!, columnHeights[boundary + 1]!) -
      seamStarts[boundary]!;
    const excess = run - reference * SEAM_FREE_RUN_PX;
    return SEAM_LEVEL_WEIGHT * clamp(excess, 0, reference * SEAM_BONUS_CAP_RATIO);
  };

  let best: PlacementChoice | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const consider = (choice: PlacementChoice, bonus: number): void => {
    const width = columns[choice.columnIndex]!.width;
    const projected = columnHeights.slice();
    projected[choice.columnIndex] =
      choice.levelTo ?? columnHeights[choice.columnIndex]! + choice.height;
    const score =
      scoreProjection(projected, choice.columnIndex) +
      computeCropPenalty(width, photo, choice.height) * CROP_WEIGHT -
      bonus;
    if (
      best === null ||
      score < bestScore ||
      (score === bestScore && choice.columnIndex < best.columnIndex)
    ) {
      best = choice;
      bestScore = score;
    }
  };

  const candidates = sortedColumnIndices(columnHeights).slice(0, CANDIDATE_COLUMN_COUNT);
  for (const columnIndex of candidates) {
    consider(
      {
        columnIndex,
        height: computeDisplayHeight(columns[columnIndex]!.width, photo),
      },
      0,
    );
  }

  // Lining up is tried on every column: a long seam is worth ending even
  // where the skyline is not lowest.
  for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
    const width = columns[columnIndex]!.width;
    const top = columnHeights[columnIndex]!;
    for (const neighbor of [columnIndex - 1, columnIndex + 1]) {
      if (neighbor < 0 || neighbor >= columns.length) continue;
      const target = columnHeights[neighbor]!;
      const height = target - top;
      if (height <= ALIGN_EPSILON_PX) continue;
      if (computeCropPenalty(width, photo, height) > LEVEL_MAX_CROP) continue;
      consider(
        { columnIndex, height, levelTo: target },
        seamBonus(Math.min(columnIndex, neighbor)),
      );
    }
  }

  return best ?? {
    columnIndex: 0,
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

function scoreProjection(
  projected: readonly number[],
  columnIndex: number,
): number {
  const skylineSpread = Math.max(...projected) - Math.min(...projected);
  const neighborDelta = neighboringHeightPenalty(projected, columnIndex);
  return (
    skylineSpread * SKYLINE_SPREAD_WEIGHT +
    neighborDelta * NEIGHBOR_DELTA_WEIGHT
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

export function computeCropPenalty(
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
