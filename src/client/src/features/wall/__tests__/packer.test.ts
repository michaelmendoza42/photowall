import { describe, expect, it } from 'vitest';
import type { PhotoQueryRecord } from '../../../../../shared/api/photos.js';
import { packJustifiedRows } from '../packer.js';

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

  it('packs photos into a single justified row that fills the world width', () => {
    const photos = [
      photo('a', 150, 100), // ar=1.5
      photo('b', 150, 100), // ar=1.5
      photo('c', 150, 100), // ar=1.5
    ];
    // 3 * 1.5 * 300 = 1350 > 1200 → crosses on the 3rd, full row of 3.
    const result = packJustifiedRows(photos, OPTS, false);

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0]!;
    expect(row.tiles).toHaveLength(3);
    // Sum of tile widths must equal worldWidth exactly (last tile
    // pinned to the right edge to avoid float drift).
    const sumWidth = row.tiles.reduce((s, t) => s + t.width, 0);
    expect(sumWidth).toBeCloseTo(1200, 6);
    // Row height is worldWidth / sumAR = 1200 / 4.5 ≈ 266.67.
    expect(row.height).toBeCloseTo(1200 / 4.5, 6);
    expect(row.offsetTop).toBe(0);
    // Tiles laid out left-to-right starting at x=0.
    expect(row.tiles[0]!.x).toBe(0);
    expect(row.tiles[1]!.x).toBeCloseTo(row.tiles[0]!.width, 6);
    expect(row.tiles[2]!.x).toBeCloseTo(
      row.tiles[0]!.width + row.tiles[1]!.width,
      6,
    );
    expect(result.contentHeight).toBeCloseTo(row.height, 6);
    expect(result.packedPhotoCount).toBe(3);
  });

  it('produces multiple stacked rows with monotonically increasing offsetTop', () => {
    const photos = [
      photo('a', 150, 100), // row 1 — ar=1.5
      photo('b', 150, 100), // row 1 — ar=1.5
      photo('c', 150, 100), // row 1 — ar=1.5 → 1350>1200, justify
      photo('d', 150, 100), // row 2 — ar=1.5
      photo('e', 150, 100), // row 2 — ar=1.5
      photo('f', 150, 100), // row 2 — ar=1.5 → 1350>1200, justify
    ];
    const result = packJustifiedRows(photos, OPTS, false);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.offsetTop).toBe(0);
    expect(result.rows[1]!.offsetTop).toBeCloseTo(result.rows[0]!.height, 6);
    expect(result.contentHeight).toBeCloseTo(
      result.rows[0]!.height + result.rows[1]!.height,
      6,
    );
    // Each row tile y matches its row offsetTop.
    for (const r of result.rows) {
      for (const t of r.tiles) {
        expect(t.y).toBe(r.offsetTop);
      }
    }
  });

  it('holds back a trailing incomplete row when more photos are expected', () => {
    const photos = [
      photo('a', 200, 100), // ar=2
      photo('b', 200, 100), // ar=2 → 2*2*300=1200, exactly fills → row 1 complete
      photo('c', 100, 200), // ar=0.5 → incomplete tail, hold back when hasMore
    ];
    const withMore = packJustifiedRows(photos, OPTS, true);
    expect(withMore.rows).toHaveLength(1);
    expect(withMore.packedPhotoCount).toBe(2);

    const withoutMore = packJustifiedRows(photos, OPTS, false);
    expect(withoutMore.rows).toHaveLength(2);
    expect(withoutMore.packedPhotoCount).toBe(3);
    // Orphan tail row uses the target row height, not justified.
    expect(withoutMore.rows[1]!.height).toBeCloseTo(OPTS.targetRowHeight, 6);
  });

  it('keeps already-laid-out row geometry stable when more photos append', () => {
    const initial = [
      photo('a', 200, 100),
      photo('b', 200, 100),
      photo('c', 200, 100),
    ];
    const more = [...initial, photo('d', 200, 100), photo('e', 200, 100)];

    const before = packJustifiedRows(initial, OPTS, true);
    const after = packJustifiedRows(more, OPTS, true);

    // The first row is complete in both packs; its geometry must
    // match byte-for-byte. This is the key stability guarantee.
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('caps row height at maxRowHeight for unusually wide single-tile rows', () => {
    // One ultra-wide photo whose unscaled width at target height
    // already exceeds the world width — the row would otherwise
    // scale up to fit and produce an awkwardly tall single tile.
    const photos = [photo('panorama', 10_000, 1000)]; // ar=10
    const result = packJustifiedRows(
      photos,
      { worldWidth: 1200, targetRowHeight: 300, maxRowHeight: 400 },
      false,
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.height).toBeLessThanOrEqual(400);
    // Tile still fills the world width — gapless guarantee.
    expect(result.rows[0]!.tiles[0]!.width).toBeCloseTo(1200, 6);
  });

  it('falls back to width/height when aspectRatio is missing or zero', () => {
    const malformed: PhotoQueryRecord = {
      ...photo('a', 200, 100),
      aspectRatio: 0,
    };
    const result = packJustifiedRows([malformed], OPTS, false);
    // Should not throw and should pack as a single (orphan) row.
    expect(result.rows).toHaveLength(1);
    // ar fallback is 200/100 = 2.
    expect(result.rows[0]!.tiles[0]!.width).toBeCloseTo(2 * 300, 6);
  });
});
