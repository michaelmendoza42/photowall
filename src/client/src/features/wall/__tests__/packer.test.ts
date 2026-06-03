import { describe, expect, it } from 'vitest';
import type { PhotoQueryRecord } from '../../../../../shared/api/photos.js';
import { packJustifiedRows, type PackedTile } from '../packer.js';

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
  targetRowHeight: 300,
  maxRowHeight: 480,
};

function flattenTiles(result: ReturnType<typeof packJustifiedRows>): PackedTile[] {
  return result.rows.flatMap((row) => row.tiles);
}

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
    // Follow-on placements land at different Y values because each next
    // photo targets the shortest current column.
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

  it('caps very tall portrait tiles at maxRowHeight', () => {
    const result = packJustifiedRows(
      [photo('portrait', 100, 400)],
      { ...OPTS, columnWidthFactors: [1] },
      false,
    );
    const tile = flattenTiles(result)[0]!;
    expect(tile.height).toBeLessThanOrEqual(OPTS.maxRowHeight);
    expect(tile.width).toBeCloseTo(OPTS.worldWidth, 6);
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
    expect(tile.height).toBeCloseTo(200, 6);
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

  it('returns virtualization bands with nominal targetHeight equal to maxRowHeight', () => {
    const result = packJustifiedRows(
      Array.from({ length: 9 }, (_, index) => photo(`p${index}`, 100, 100)),
      { ...OPTS, columnWidthFactors: [1, 1, 1] },
      false,
    );
    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows) {
      expect(row.targetHeight).toBe(OPTS.maxRowHeight);
    }
  });
});
