import {
  MOSAIC_LAB_CATEGORY_FAMILIES,
  MOSAIC_LAB_FOOTPRINT_KEYS,
  type MosaicLabCategoryFamily,
  type MosaicLabFootprintKey,
} from './types.js';
import {
  computeRectArea,
  MOSAIC_LAB_GEOMETRY_EPSILON,
  type MosaicLabPackedTileRect,
  type MosaicLabPackingContract,
  type MosaicLabPackingFrame,
  type MosaicLabRect,
} from './geometry.js';

export interface MosaicLabOverlapCell extends MosaicLabRect {
  tileIds: readonly string[];
}

export interface MosaicLabBlackSpaceResult {
  passes: boolean;
  frameArea: number;
  coveredArea: number;
  uncoveredArea: number;
  uncoveredRects: readonly MosaicLabRect[];
}

export interface MosaicLabOverlapResult {
  passes: boolean;
  overlapArea: number;
  overlapRects: readonly MosaicLabOverlapCell[];
}

export interface MosaicLabSeamSegment {
  position: number;
  start: number;
  end: number;
  length: number;
  tileIds: readonly string[];
}

export interface MosaicLabFootprintUsageSummary {
  footprintCounts: Record<MosaicLabFootprintKey, number>;
  footprintVariety: number;
  dominantFootprintKey: MosaicLabFootprintKey | null;
  dominantFootprintCount: number;
  dominantFootprintShare: number;
}

export interface MosaicLabSeamDiagnostics {
  horizontalSeamCount: number;
  verticalSeamCount: number;
  fullSpanHorizontalSeamCount: number;
  fullSpanVerticalSeamCount: number;
  longestHorizontalSeam: number;
  longestVerticalSeam: number;
}

export interface MosaicLabMetricsSummary {
  totalTileCount: number;
  placementCategoryCounts: Record<MosaicLabCategoryFamily, number>;
  placementCategoryVariety: number;
  footprintUsage: MosaicLabFootprintUsageSummary;
  blackSpace: MosaicLabBlackSpaceResult;
  overlap: MosaicLabOverlapResult;
  seamDiagnostics: MosaicLabSeamDiagnostics;
}

interface CoverageCell extends MosaicLabRect {
  tileIds: readonly string[];
}

interface RawSeamSegment {
  position: number;
  start: number;
  end: number;
  tileIds: readonly string[];
}

function approximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= MOSAIC_LAB_GEOMETRY_EPSILON;
}

function dedupeSortedNumbers(values: readonly number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.reduce<number[]>((result, value) => {
    const previous = result[result.length - 1];
    if (previous === undefined || !approximatelyEqual(previous, value)) {
      result.push(value);
    }
    return result;
  }, []);
}

function intervalOverlap(startA: number, endA: number, startB: number, endB: number): {
  start: number;
  end: number;
  length: number;
} | null {
  const start = Math.max(startA, startB);
  const end = Math.min(endA, endB);
  const length = end - start;
  if (length <= MOSAIC_LAB_GEOMETRY_EPSILON) {
    return null;
  }
  return { start, end, length };
}

function clipRectToFrame(
  rect: MosaicLabRect,
  frame: MosaicLabPackingFrame,
): MosaicLabRect | null {
  const overlap = intervalOverlap(rect.x, rect.x + rect.width, frame.x, frame.x + frame.width);
  if (!overlap) {
    return null;
  }

  const verticalOverlap = intervalOverlap(rect.y, rect.y + rect.height, frame.y, frame.y + frame.height);
  if (!verticalOverlap) {
    return null;
  }

  return {
    x: overlap.start,
    y: verticalOverlap.start,
    width: overlap.length,
    height: verticalOverlap.length,
  };
}

function buildCoverageCells(
  frame: MosaicLabPackingFrame,
  tiles: readonly MosaicLabPackedTileRect[],
): CoverageCell[] {
  const clippedTiles = tiles
    .map((tile) => {
      const clippedRect = clipRectToFrame(tile, frame);
      return clippedRect ? { tileId: tile.tileId, rect: clippedRect } : null;
    })
    .filter((entry): entry is { tileId: string; rect: MosaicLabRect } => entry !== null);

  const xs = dedupeSortedNumbers([
    frame.x,
    frame.x + frame.width,
    ...clippedTiles.flatMap(({ rect }) => [rect.x, rect.x + rect.width]),
  ]);
  const ys = dedupeSortedNumbers([
    frame.y,
    frame.y + frame.height,
    ...clippedTiles.flatMap(({ rect }) => [rect.y, rect.y + rect.height]),
  ]);

  const cells: CoverageCell[] = [];

  for (let xIndex = 0; xIndex < xs.length - 1; xIndex += 1) {
    const x = xs[xIndex]!;
    const nextX = xs[xIndex + 1]!;
    const width = nextX - x;
    if (width <= MOSAIC_LAB_GEOMETRY_EPSILON) {
      continue;
    }

    for (let yIndex = 0; yIndex < ys.length - 1; yIndex += 1) {
      const y = ys[yIndex]!;
      const nextY = ys[yIndex + 1]!;
      const height = nextY - y;
      if (height <= MOSAIC_LAB_GEOMETRY_EPSILON) {
        continue;
      }

      const tileIds = clippedTiles
        .filter(({ rect }) =>
          rect.x < nextX - MOSAIC_LAB_GEOMETRY_EPSILON &&
          rect.x + rect.width > x + MOSAIC_LAB_GEOMETRY_EPSILON &&
          rect.y < nextY - MOSAIC_LAB_GEOMETRY_EPSILON &&
          rect.y + rect.height > y + MOSAIC_LAB_GEOMETRY_EPSILON,
        )
        .map(({ tileId }) => tileId);

      cells.push({
        x,
        y,
        width,
        height,
        tileIds,
      });
    }
  }

  return cells;
}

function mergeSegments(segments: readonly RawSeamSegment[]): MosaicLabSeamSegment[] {
  const sorted = [...segments].sort((left, right) => {
    if (!approximatelyEqual(left.position, right.position)) {
      return left.position - right.position;
    }
    if (!approximatelyEqual(left.start, right.start)) {
      return left.start - right.start;
    }
    return left.end - right.end;
  });

  const merged: Array<{
    position: number;
    start: number;
    end: number;
    tileIds: Set<string>;
  }> = [];

  for (const segment of sorted) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      approximatelyEqual(previous.position, segment.position) &&
      segment.start <= previous.end + MOSAIC_LAB_GEOMETRY_EPSILON
    ) {
      previous.end = Math.max(previous.end, segment.end);
      segment.tileIds.forEach((tileId) => previous.tileIds.add(tileId));
      continue;
    }

    merged.push({
      position: segment.position,
      start: segment.start,
      end: segment.end,
      tileIds: new Set(segment.tileIds),
    });
  }

  return merged.map((segment) => ({
    position: segment.position,
    start: segment.start,
    end: segment.end,
    length: segment.end - segment.start,
    tileIds: [...segment.tileIds].sort(),
  }));
}

function collectVerticalSeamPairs(
  tiles: readonly MosaicLabPackedTileRect[],
): RawSeamSegment[] {
  const segments: RawSeamSegment[] = [];

  for (let index = 0; index < tiles.length; index += 1) {
    const tile = tiles[index]!;
    for (let otherIndex = index + 1; otherIndex < tiles.length; otherIndex += 1) {
      const otherTile = tiles[otherIndex]!;
      let seamX: number | null = null;

      if (approximatelyEqual(tile.x + tile.width, otherTile.x)) {
        seamX = otherTile.x;
      } else if (approximatelyEqual(otherTile.x + otherTile.width, tile.x)) {
        seamX = tile.x;
      }

      if (seamX === null) {
        continue;
      }

      const overlap = intervalOverlap(
        tile.y,
        tile.y + tile.height,
        otherTile.y,
        otherTile.y + otherTile.height,
      );
      if (!overlap) {
        continue;
      }

      segments.push({
        position: seamX,
        start: overlap.start,
        end: overlap.end,
        tileIds: [tile.tileId, otherTile.tileId],
      });
    }
  }

  return segments;
}

function collectHorizontalSeamPairs(
  tiles: readonly MosaicLabPackedTileRect[],
): RawSeamSegment[] {
  const segments: RawSeamSegment[] = [];

  for (let index = 0; index < tiles.length; index += 1) {
    const tile = tiles[index]!;
    for (let otherIndex = index + 1; otherIndex < tiles.length; otherIndex += 1) {
      const otherTile = tiles[otherIndex]!;
      let seamY: number | null = null;

      if (approximatelyEqual(tile.y + tile.height, otherTile.y)) {
        seamY = otherTile.y;
      } else if (approximatelyEqual(otherTile.y + otherTile.height, tile.y)) {
        seamY = tile.y;
      }

      if (seamY === null) {
        continue;
      }

      const overlap = intervalOverlap(
        tile.x,
        tile.x + tile.width,
        otherTile.x,
        otherTile.x + otherTile.width,
      );
      if (!overlap) {
        continue;
      }

      segments.push({
        position: seamY,
        start: overlap.start,
        end: overlap.end,
        tileIds: [tile.tileId, otherTile.tileId],
      });
    }
  }

  return segments;
}

export function countPackedTiles(tiles: readonly MosaicLabPackedTileRect[]): number {
  return tiles.length;
}

export function countTilesByPlacementCategory(
  tiles: readonly MosaicLabPackedTileRect[],
): Record<MosaicLabCategoryFamily, number> {
  const counts = MOSAIC_LAB_CATEGORY_FAMILIES.reduce<Record<MosaicLabCategoryFamily, number>>(
    (result, family) => {
      result[family] = 0;
      return result;
    },
    {
      Standard: 0,
      'Scale rescue': 0,
      'Neutral connector': 0,
      'Seam-break rescue': 0,
    },
  );

  for (const tile of tiles) {
    counts[tile.categoryFamily] += 1;
  }

  return counts;
}

export function countTilesByFootprint(
  tiles: readonly MosaicLabPackedTileRect[],
): Record<MosaicLabFootprintKey, number> {
  const counts = MOSAIC_LAB_FOOTPRINT_KEYS.reduce<Record<MosaicLabFootprintKey, number>>(
    (result, footprintKey) => {
      result[footprintKey] = 0;
      return result;
    },
    {
      'standard-landscape': 0,
      'standard-portrait': 0,
      'large-landscape': 0,
      'large-portrait': 0,
      'square-rescue': 0,
      'wide-landscape-seam-break': 0,
      'tall-portrait-seam-break': 0,
    },
  );

  for (const tile of tiles) {
    counts[tile.footprintKey] += 1;
  }

  return counts;
}

function countNonZeroValues(counts: Record<string, number>): number {
  return Object.values(counts).filter((value) => value > 0).length;
}

function getDominantFootprintUsage(
  footprintCounts: Record<MosaicLabFootprintKey, number>,
  totalTileCount: number,
): Pick<
  MosaicLabFootprintUsageSummary,
  'dominantFootprintKey' | 'dominantFootprintCount' | 'dominantFootprintShare'
> {
  const dominantFootprint = MOSAIC_LAB_FOOTPRINT_KEYS
    .map((footprintKey) => ({
      footprintKey,
      count: footprintCounts[footprintKey],
    }))
    .sort((left, right) => {
      if (left.count !== right.count) {
        return right.count - left.count;
      }

      return left.footprintKey.localeCompare(right.footprintKey);
    })[0];

  if (!dominantFootprint || dominantFootprint.count === 0 || totalTileCount === 0) {
    return {
      dominantFootprintKey: null,
      dominantFootprintCount: 0,
      dominantFootprintShare: 0,
    };
  }

  return {
    dominantFootprintKey: dominantFootprint.footprintKey,
    dominantFootprintCount: dominantFootprint.count,
    dominantFootprintShare: dominantFootprint.count / totalTileCount,
  };
}

export function measureBlackSpace(
  contract: MosaicLabPackingContract,
  tiles: readonly MosaicLabPackedTileRect[],
): MosaicLabBlackSpaceResult {
  const cells = buildCoverageCells(contract.frame, tiles);
  const uncoveredRects = cells
    .filter((cell) => cell.tileIds.length === 0)
    .map<MosaicLabRect>(({ x, y, width, height }) => ({ x, y, width, height }));
  const uncoveredArea = uncoveredRects.reduce((total, rect) => total + computeRectArea(rect), 0);
  const frameArea = computeRectArea(contract.frame);

  return {
    passes: uncoveredArea <= MOSAIC_LAB_GEOMETRY_EPSILON,
    frameArea,
    coveredArea: frameArea - uncoveredArea,
    uncoveredArea,
    uncoveredRects,
  };
}

export function measureOverlap(
  contract: MosaicLabPackingContract,
  tiles: readonly MosaicLabPackedTileRect[],
): MosaicLabOverlapResult {
  const overlapRects = buildCoverageCells(contract.frame, tiles)
    .filter((cell) => cell.tileIds.length > 1)
    .map<MosaicLabOverlapCell>(({ x, y, width, height, tileIds }) => ({
      x,
      y,
      width,
      height,
      tileIds,
    }));
  const overlapArea = overlapRects.reduce((total, rect) => total + computeRectArea(rect), 0);

  return {
    passes: overlapArea <= MOSAIC_LAB_GEOMETRY_EPSILON,
    overlapArea,
    overlapRects,
  };
}

export function getVerticalSeamSegments(
  tiles: readonly MosaicLabPackedTileRect[],
): readonly MosaicLabSeamSegment[] {
  return mergeSegments(collectVerticalSeamPairs(tiles));
}

export function getHorizontalSeamSegments(
  tiles: readonly MosaicLabPackedTileRect[],
): readonly MosaicLabSeamSegment[] {
  return mergeSegments(collectHorizontalSeamPairs(tiles));
}

export function measureLongestVerticalSeam(
  tiles: readonly MosaicLabPackedTileRect[],
): number {
  return getVerticalSeamSegments(tiles).reduce(
    (longest, segment) => Math.max(longest, segment.length),
    0,
  );
}

export function measureLongestHorizontalSeam(
  tiles: readonly MosaicLabPackedTileRect[],
): number {
  return getHorizontalSeamSegments(tiles).reduce(
    (longest, segment) => Math.max(longest, segment.length),
    0,
  );
}

export function measureSeamDiagnostics(
  contract: MosaicLabPackingContract,
  tiles: readonly MosaicLabPackedTileRect[],
): MosaicLabSeamDiagnostics {
  const horizontalSeams = getHorizontalSeamSegments(tiles);
  const verticalSeams = getVerticalSeamSegments(tiles);

  return {
    horizontalSeamCount: horizontalSeams.length,
    verticalSeamCount: verticalSeams.length,
    fullSpanHorizontalSeamCount: horizontalSeams.filter((segment) =>
      approximatelyEqual(segment.length, contract.frame.width),
    ).length,
    fullSpanVerticalSeamCount: verticalSeams.filter((segment) =>
      approximatelyEqual(segment.length, contract.frame.height),
    ).length,
    longestHorizontalSeam: horizontalSeams.reduce(
      (longest, segment) => Math.max(longest, segment.length),
      0,
    ),
    longestVerticalSeam: verticalSeams.reduce(
      (longest, segment) => Math.max(longest, segment.length),
      0,
    ),
  };
}

export function computeMosaicLabMetrics(
  contract: MosaicLabPackingContract,
  tiles: readonly MosaicLabPackedTileRect[],
): MosaicLabMetricsSummary {
  const totalTileCount = countPackedTiles(tiles);
  const placementCategoryCounts = countTilesByPlacementCategory(tiles);
  const footprintCounts = countTilesByFootprint(tiles);

  return {
    totalTileCount,
    placementCategoryCounts,
    placementCategoryVariety: countNonZeroValues(placementCategoryCounts),
    footprintUsage: {
      footprintCounts,
      footprintVariety: countNonZeroValues(footprintCounts),
      ...getDominantFootprintUsage(footprintCounts, totalTileCount),
    },
    blackSpace: measureBlackSpace(contract, tiles),
    overlap: measureOverlap(contract, tiles),
    seamDiagnostics: measureSeamDiagnostics(contract, tiles),
  };
}
