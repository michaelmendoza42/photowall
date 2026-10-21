import { describe, expect, it } from 'vitest';
import type { PhotoQueryRecord } from '../../../../../shared/api/photos.js';
import {
  buildColumns,
  computeDisplayHeight,
  packJustifiedRows,
  type PackedTile,
} from '../packer.js';
import { DEFAULT_MOSAIC_COLUMN_FACTORS } from '../worldWidth.js';
import { createLargeAlbumFixture } from './fixtures/largeAlbum.js';

function photo(id: string, width: number, height: number): PhotoQueryRecord {
  return {
    id,
    relativePath: `2024/event/${id}.jpg`,
    directoryPath: '2024/event',
    filename: `${id}.jpg`,
    width,
    height,
    aspectRatio: width / height,
    fileSize: 1000,
    mtimeMs: 0,
    year: 2024,
    yearSource: 'top-level',
  };
}

const OPTS = {
  worldWidth: 1200,
  maxRowHeight: 480,
  tileScale: 1,
};

function flattenTiles(result: ReturnType<typeof packJustifiedRows>): PackedTile[] {
  return result.rows.flatMap((row) => row.tiles);
}

function columnHeights(tiles: readonly PackedTile[]): number[] {
  const byX = new Map<number, number>();
  for (const tile of tiles) {
    byX.set(tile.x, Math.max(byX.get(tile.x) ?? 0, tile.y + tile.height));
  }
  return [...byX.values()].sort((a, b) => a - b);
}

/** Length of every straight vertical seam: an x where tile edges meet on both sides. */
function seamRuns(tiles: readonly PackedTile[]): number[] {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
  const runs: number[] = [];
  const edges = [...new Set(tiles.map((t) => Math.round(t.x)))].filter((x) => x > 0);
  for (const x of edges) {
    const left = tiles.filter((t) => near(t.x + t.width, x));
    const right = tiles.filter((t) => near(t.x, x));
    const shared: Array<[number, number]> = [];
    for (const a of left) {
      for (const b of right) {
        const top = Math.max(a.y, b.y);
        const bottom = Math.min(a.y + a.height, b.y + b.height);
        if (bottom > top) shared.push([top, bottom]);
      }
    }
    shared.sort((a, b) => a[0] - b[0]);
    let run: [number, number] | null = null;
    for (const span of shared) {
      if (run && span[0] <= run[1] + 0.5) run[1] = Math.max(run[1], span[1]);
      else {
        if (run) runs.push(run[1] - run[0]);
        run = [span[0], span[1]];
      }
    }
    if (run) runs.push(run[1] - run[0]);
  }
  return runs;
}

const WALL_OPTS = {
  worldWidth: 3600,
  maxRowHeight: 460,
  columnWidthFactors: DEFAULT_MOSAIC_COLUMN_FACTORS,
};

describe('packJustifiedRows', () => {
  it('returns an empty result for an empty input', () => {
    const result = packJustifiedRows([], OPTS, false);
    expect(result.rows).toEqual([]);
    expect(result.contentHeight).toBe(0);
    expect(result.packedPhotoCount).toBe(0);
  });

  it('returns an empty result when worldWidth is non-positive', () => {
    const result = packJustifiedRows(
      [photo('a', 200, 100)],
      { ...OPTS, worldWidth: 0 },
      false,
    );
    expect(result.rows).toEqual([]);
  });

  it('packs the first photos into deterministic gapless columns', () => {
    const result = packJustifiedRows(
      [
        photo('a', 100, 100),
        photo('b', 100, 100),
        photo('c', 100, 100),
      ],
      { ...OPTS, columnWidthFactors: [1, 1, 1] },
      false,
    );

    const tiles = flattenTiles(result);
    expect(tiles).toHaveLength(3);
    expect(tiles[0]).toMatchObject({ x: 0, y: 0, width: 400, height: 400 });
    expect(tiles[1]).toMatchObject({ x: 400, y: 0, width: 400, height: 400 });
    expect(tiles[2]).toMatchObject({ x: 800, y: 0, width: 400, height: 400 });
    const sumWidth = tiles.slice(0, 3).reduce((sum, tile) => sum + tile.width, 0);
    expect(sumWidth).toBeCloseTo(OPTS.worldWidth, 6);
    expect(result.contentHeight).toBeCloseTo(400, 6);
    expect(result.packedPhotoCount).toBe(3);
  });

  it('creates staggered horizontal seams instead of full-width rows', () => {
    const result = packJustifiedRows(
      [
        photo('a', 200, 100),
        photo('b', 100, 100),
        photo('c', 100, 200),
        photo('d', 100, 100),
        photo('e', 200, 100),
        photo('f', 100, 100),
      ],
      { ...OPTS, columnWidthFactors: [1, 1, 1] },
      false,
    );

    const tiles = flattenTiles(result);
    expect(tiles[0]!.y).toBe(0);
    expect(tiles[1]!.y).toBe(0);
    expect(tiles[2]!.y).toBe(0);
    expect(new Set(tiles.slice(3).map((tile) => Math.round(tile.y))).size).toBeGreaterThan(1);
  });

  it('keeps already-laid-out tile geometry stable when more photos append', () => {
    const initial = [
      photo('a', 100, 100),
      photo('b', 100, 100),
      photo('c', 100, 100),
      photo('d', 100, 100),
      photo('e', 100, 100),
      photo('f', 100, 100),
    ];
    const more = [...initial, photo('g', 100, 100), photo('h', 100, 100)];

    const before = flattenTiles(
      packJustifiedRows(initial, { ...OPTS, columnWidthFactors: [1, 1, 1] }, true),
    );
    const after = flattenTiles(
      packJustifiedRows(more, { ...OPTS, columnWidthFactors: [1, 1, 1] }, true),
    );

    expect(after.slice(0, before.length)).toEqual(before);
  });

  it('does not hold back trailing photos when more pages are expected', () => {
    const photos = [photo('a', 100, 100), photo('b', 100, 100), photo('c', 100, 100)];
    const withMore = packJustifiedRows(photos, OPTS, true);
    const withoutMore = packJustifiedRows(photos, OPTS, false);
    expect(withMore.packedPhotoCount).toBe(3);
    expect(withoutMore.packedPhotoCount).toBe(3);
    expect(flattenTiles(withMore)).toEqual(flattenTiles(withoutMore));
  });

  it('respects irregular column factors', () => {
    const result = packJustifiedRows(
      [photo('a', 100, 100), photo('b', 100, 100), photo('c', 100, 100)],
      { ...OPTS, columnWidthFactors: [1.2, 0.8, 1.0] },
      false,
    );
    const tiles = flattenTiles(result);
    expect(tiles[0]!.width).toBeCloseTo(480, 6);
    expect(tiles[1]!.width).toBeCloseTo(320, 6);
    expect(tiles[2]!.x).toBeCloseTo(800, 6);
    expect(tiles[2]!.width).toBeCloseTo(400, 6);
  });

  it('shrinks base column widths exactly with tileScale when the width divides evenly', () => {
    const columns = buildColumns({
      worldWidth: OPTS.worldWidth,
      factors: [1, 1, 1],
      tileScale: 0.75,
    });

    expect(columns).toHaveLength(4);
    expect(columns.map((column) => column.width)).toEqual([300, 300, 300, 300]);
  });

  it('merges a tiny tail column back into the previous column instead of leaving a skinny strip', () => {
    const columns = buildColumns({
      worldWidth: OPTS.worldWidth,
      factors: [1.22, 0.82, 1.08, 0.76, 1.12],
      tileScale: 0.75,
    });

    expect(columns).toHaveLength(6);
    expect(columns[columns.length - 1]!.width).toBeGreaterThan(250);
    expect(columns.reduce((sum, column) => sum + column.width, 0)).toBeCloseTo(OPTS.worldWidth, 6);
  });

  it('keeps vertical seams short instead of running down the whole wall', () => {
    const result = packJustifiedRows(createLargeAlbumFixture(300), WALL_OPTS, false);
    const tiles = flattenTiles(result);
    const runs = seamRuns(tiles);
    const tallestTile = Math.max(...tiles.map((t) => t.height));
    // Fixed columns gave five seams the full ~20,000px height of this wall.
    expect(Math.max(...runs)).toBeLessThan(result.contentHeight / 6);
    const mean = runs.reduce((sum, run) => sum + run, 0) / runs.length;
    expect(mean).toBeLessThan(tallestTile * 2.5);
  });

  it('stays gapless and non-overlapping while column boundaries shift', () => {
    const result = packJustifiedRows(createLargeAlbumFixture(300), WALL_OPTS, false);
    const tiles = flattenTiles(result);
    const floor = Math.min(
      ...[...new Set(tiles.map((t) => t.lane))].map((lane) =>
        Math.max(...tiles.filter((t) => t.lane === lane).map((t) => t.y + t.height)),
      ),
    );
    const coveredArea = tiles.reduce((sum, t) => {
      const visible = Math.max(0, Math.min(t.y + t.height, floor) - t.y);
      return sum + t.width * visible;
    }, 0);
    // Full coverage up to the lowest column bottom, and no tile overlaps.
    expect(coveredArea / (WALL_OPTS.worldWidth * floor)).toBeCloseTo(1, 6);
    for (let i = 0; i < tiles.length; i += 1) {
      for (let j = i + 1; j < tiles.length; j += 1) {
        const a = tiles[i]!;
        const b = tiles[j]!;
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        expect(overlapX > 0.01 && overlapY > 0.01, `${a.photoId} overlaps ${b.photoId}`).toBe(false);
      }
    }
  });

  it('keeps earlier tiles in place when more pages append, even after boundaries move', () => {
    const photos = createLargeAlbumFixture(200);
    const before = flattenTiles(packJustifiedRows(photos.slice(0, 120), WALL_OPTS, true));
    const after = flattenTiles(packJustifiedRows(photos, WALL_OPTS, true));
    const byId = new Map(after.map((tile) => [tile.photoId, tile]));
    for (const tile of before) expect(byId.get(tile.photoId)).toEqual(tile);
  });

  it('bounds extreme portrait tiles to a mosaic-safe displayed height', () => {
    const width = OPTS.worldWidth;
    const height = computeDisplayHeight(width, photo('portrait', 100, 400));
    expect(height).toBeCloseTo(width * 1.75, 6);
  });

  it('bounds extreme panoramas to a mosaic-safe displayed height', () => {
    const width = OPTS.worldWidth;
    const height = computeDisplayHeight(width, photo('panorama', 400, 100));
    expect(height).toBeCloseTo(width * 0.58, 6);
  });

  it('keeps a landscape-heavy repro mix within a bounded skyline spread', () => {
    const result = packJustifiedRows(
      [
        photo('l1', 160, 90),
        photo('l2', 160, 90),
        photo('l3', 160, 90),
        photo('l4', 160, 90),
        photo('p1', 90, 160),
        photo('l5', 160, 90),
        photo('l6', 160, 90),
        photo('l7', 160, 90),
      ],
      {
        ...OPTS,
        tileScale: 0.75,
        columnWidthFactors: [1.22, 0.82, 1.08, 0.76, 1.12],
      },
      false,
    );

    const heights = columnHeights(flattenTiles(result));
    expect(heights.at(-1)! - heights[0]!).toBeLessThan(700);
  });

  it('falls back to width/height when aspectRatio is missing or zero', () => {
    const malformed: PhotoQueryRecord = {
      ...photo('a', 200, 100),
      aspectRatio: 0,
    };
    const result = packJustifiedRows(
      [malformed],
      { ...OPTS, columnWidthFactors: [1, 1, 1] },
      false,
    );
    const tile = flattenTiles(result)[0]!;
    expect(tile.height).toBeCloseTo(348, 6);
  });

  it('falls back to uniform columns for empty or invalid factors', () => {
    const uniform = flattenTiles(
      packJustifiedRows(
        [photo('a', 100, 100), photo('b', 100, 100), photo('c', 100, 100)],
        OPTS,
        false,
      ),
    );
    const empty = flattenTiles(
      packJustifiedRows(
        [photo('a', 100, 100), photo('b', 100, 100), photo('c', 100, 100)],
        { ...OPTS, columnWidthFactors: [] },
        false,
      ),
    );
    const invalid = flattenTiles(
      packJustifiedRows(
        [photo('a', 100, 100), photo('b', 100, 100), photo('c', 100, 100)],
        { ...OPTS, columnWidthFactors: [0, Number.NaN, -1] },
        false,
      ),
    );
    expect(empty).toEqual(uniform);
    expect(invalid).toEqual(uniform);
  });

  it('returns virtualization bands with bounded portrait extents instead of giant towers', () => {
    const result = packJustifiedRows(
      [photo('portrait', 100, 400)],
      { ...OPTS, columnWidthFactors: [1] },
      false,
    );
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0]!.targetHeight).toBe(OPTS.maxRowHeight);
    expect(result.rows[0]!.height).toBeCloseTo(OPTS.worldWidth * 1.75, 6);
  });
});
