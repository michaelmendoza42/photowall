// Justified-row layout engine.
//
// Given a flat list of photos and a target row height, greedily pack
// photos left-to-right at the target height until the accumulated row
// width crosses the world width, then scale the row down so its tiles
// fill the world width exactly. The result is a gapless wall whose row
// geometry is deterministic for a given prefix of photos — meaning
// rows already laid out never shift as additional pages append.
//
// This is a pure function: it owns no state, performs no IO, and the
// same inputs always produce the same output. The wall component calls
// it during render and memoises the result.

import type { PhotoQueryRecord } from '../../../../shared/api/photos.js';

export interface PackerOptions {
  /** Bounded world width the wall lays out into, in CSS px. */
  worldWidth: number;
  /** Preferred row height before justification scales it down. */
  targetRowHeight: number;
  /**
   * Hard ceiling on row height. Caps the rare case where a single very
   * wide photo would otherwise inflate a row past a comfortable height.
   */
  maxRowHeight: number;
  /**
   * Per-row multipliers applied to `targetRowHeight`, cycled by row
   * index. Drives the mosaic/brick rhythm: tall rows hold fewer, wider
   * photos; short rows hold more, smaller photos. The cycle is
   * deterministic in the row index, so already-laid-out rows keep
   * identical geometry when more photos append. Each factor must be a
   * positive finite number. Defaults to `[1]` (uniform rows).
   */
  rowHeightFactors?: readonly number[];
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
  /** Row index from the top of the wall (0-based). */
  index: number;
  /** Y offset of the row top relative to the world origin. */
  offsetTop: number;
  /** Row height in CSS px. */
  height: number;
  /** Effective target height used to pack this row, before justification. */
  targetHeight: number;
  /** Tiles in left-to-right render order. */
  tiles: PackedTile[];
}

export interface PackerResult {
  rows: PackedRow[];
  /** Sum of row heights — drives the world's vertical extent. */
  contentHeight: number;
  /** Photos consumed into a row. Trailing photos held back are not counted. */
  packedPhotoCount: number;
}

const EMPTY_RESULT: PackerResult = {
  rows: [],
  contentHeight: 0,
  packedPhotoCount: 0,
};

/**
 * Pack `photos` into justified rows.
 *
 * Rows that already filled `worldWidth` are emitted with stable
 * geometry. The trailing photos that have not yet accumulated enough
 * width to form a complete row are held back when `hasMore === true`,
 * because the next page will likely contribute additional photos that
 * change which tiles share the final row. When `hasMore === false`
 * the trailing photos are flushed as an orphan row at the target
 * height so the wall does not silently truncate the last few photos.
 */
export function packJustifiedRows(
  photos: readonly PhotoQueryRecord[],
  options: PackerOptions,
  hasMore: boolean,
): PackerResult {
  const { worldWidth, targetRowHeight, maxRowHeight, rowHeightFactors } =
    options;
  if (worldWidth <= 0 || targetRowHeight <= 0 || photos.length === 0) {
    return EMPTY_RESULT;
  }

  const factors = normalizeFactors(rowHeightFactors);

  const rows: PackedRow[] = [];
  let offsetTop = 0;
  let cursor = 0;

  while (cursor < photos.length) {
    const rowIndex = rows.length;
    const effectiveTarget = effectiveTargetHeight(
      targetRowHeight,
      maxRowHeight,
      factors,
      rowIndex,
    );

    let sumAtTarget = 0;
    let end = cursor;
    while (end < photos.length && sumAtTarget < worldWidth) {
      sumAtTarget += aspect(photos[end]!) * effectiveTarget;
      end++;
    }

    const slice = photos.slice(cursor, end);
    const sliceComplete = sumAtTarget >= worldWidth;

    if (!sliceComplete && hasMore) {
      break;
    }

    const row = buildRow({
      photos: slice,
      rowIndex,
      offsetTop,
      worldWidth,
      targetRowHeight: effectiveTarget,
      maxRowHeight,
      justified: sliceComplete,
    });
    rows.push(row);
    offsetTop += row.height;
    cursor = end;
  }

  return {
    rows,
    contentHeight: offsetTop,
    packedPhotoCount: cursor,
  };
}

const UNIFORM_FACTORS: readonly number[] = [1];

function normalizeFactors(
  factors: readonly number[] | undefined,
): readonly number[] {
  if (!factors || factors.length === 0) return UNIFORM_FACTORS;
  const cleaned = factors.filter((f) => Number.isFinite(f) && f > 0);
  return cleaned.length === 0 ? UNIFORM_FACTORS : cleaned;
}

function effectiveTargetHeight(
  base: number,
  maxRowHeight: number,
  factors: readonly number[],
  rowIndex: number,
): number {
  const factor = factors[rowIndex % factors.length] ?? 1;
  // Cap at maxRowHeight so a tall factor cannot ask the packer to fit
  // photos at a height the justification step would have to clamp back.
  return Math.min(maxRowHeight, base * factor);
}

interface BuildRowInput {
  photos: PhotoQueryRecord[];
  rowIndex: number;
  offsetTop: number;
  worldWidth: number;
  targetRowHeight: number;
  maxRowHeight: number;
  /** True when the row fills the world width; false for an orphan tail row. */
  justified: boolean;
}

function buildRow(input: BuildRowInput): PackedRow {
  const {
    photos,
    rowIndex,
    offsetTop,
    worldWidth,
    targetRowHeight,
    maxRowHeight,
    justified,
  } = input;

  const sumAR = photos.reduce((s, p) => s + aspect(p), 0);

  let rowHeight: number;
  let rowWidth: number;
  if (justified && sumAR > 0) {
    rowHeight = Math.min(maxRowHeight, worldWidth / sumAR);
    rowWidth = worldWidth;
  } else {
    rowHeight = Math.min(maxRowHeight, targetRowHeight);
    rowWidth = Math.min(worldWidth, sumAR * rowHeight);
  }

  const tiles: PackedTile[] = [];
  let x = 0;
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i]!;
    let tileWidth: number;
    if (justified) {
      // Pin the final tile to the right edge so float drift never
      // leaves a sub-pixel seam at the world boundary.
      tileWidth =
        i === photos.length - 1
          ? rowWidth - x
          : (aspect(p) / sumAR) * worldWidth;
    } else {
      tileWidth = aspect(p) * rowHeight;
    }
    tiles.push({
      photoId: p.id,
      x,
      y: offsetTop,
      width: tileWidth,
      height: rowHeight,
      sourceWidth: p.width,
      sourceHeight: p.height,
    });
    x += tileWidth;
  }

  return {
    index: rowIndex,
    offsetTop,
    height: rowHeight,
    targetHeight: targetRowHeight,
    tiles,
  };
}

function aspect(photo: PhotoQueryRecord): number {
  // Snapshot records carry aspectRatio precomputed, but defend against
  // a malformed record by falling back to width/height. A zero/NaN
  // here would corrupt every downstream geometry calculation.
  if (Number.isFinite(photo.aspectRatio) && photo.aspectRatio > 0) {
    return photo.aspectRatio;
  }
  if (photo.height > 0) {
    return photo.width / photo.height;
  }
  return 1;
}
