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

  it('records the per-row effective target height', () => {
    const photos = Array.from({ length: 6 }, (_, i) =>
      photo(`p${i}`, 150, 100),
    );
    const result = packJustifiedRows(photos, OPTS, false);
    for (const row of result.rows) {
      expect(row.targetHeight).toBeCloseTo(OPTS.targetRowHeight, 6);
    }
  });
});

describe('packJustifiedRows — rowHeightFactors (mosaic rhythm)', () => {
  // Photos with the same aspect ratio so any variation in row height
  // comes from the per-row factor, not the input geometry.
  const SQUARE_PHOTOS = Array.from({ length: 60 }, (_, i) =>
    photo(`p${i}`, 100, 100),
  );

  it('produces visibly varied row heights when factors differ', () => {
    const factors = [1.0, 0.6, 1.4, 0.8] as const;
    const result = packJustifiedRows(
      SQUARE_PHOTOS,
      { ...OPTS, rowHeightFactors: factors },
      false,
    );
    expect(result.rows.length).toBeGreaterThan(4);

    const heights = result.rows.slice(0, 4).map((r) => r.height);
    // Factor pattern is tall/short/tall/short → row heights mirror it.
    expect(heights[0]).toBeGreaterThan(heights[1]!);
    expect(heights[2]).toBeGreaterThan(heights[3]!);

    const min = Math.min(...heights);
    const max = Math.max(...heights);
    // Real variation, not noise from rounding.
    expect(max / min).toBeGreaterThan(1.5);
  });

  it('keeps the gapless guarantee for every justified row under variation', () => {
    const result = packJustifiedRows(
      SQUARE_PHOTOS,
      {
        ...OPTS,
        rowHeightFactors: [1.0, 0.7, 1.3, 0.85, 1.15],
      },
      false,
    );
    // All but possibly the trailing tail row should sum exactly to
    // worldWidth (last tile pinned to the right edge).
    for (let i = 0; i < result.rows.length - 1; i++) {
      const row = result.rows[i]!;
      const sum = row.tiles.reduce((s, t) => s + t.width, 0);
      expect(sum).toBeCloseTo(OPTS.worldWidth, 6);
    }
  });

  it('keeps already-laid-out rows stable when more photos append under variation', () => {
    const factors = [1.0, 0.65, 1.35, 0.82, 1.2];
    const initial = SQUARE_PHOTOS.slice(0, 30);
    const more = SQUARE_PHOTOS;

    const before = packJustifiedRows(
      initial,
      { ...OPTS, rowHeightFactors: factors },
      true,
    );
    const after = packJustifiedRows(
      more,
      { ...OPTS, rowHeightFactors: factors },
      true,
    );

    // All rows present in `before` (which are complete because hasMore
    // held back any tail) must appear byte-for-byte in `after`.
    expect(after.rows.length).toBeGreaterThanOrEqual(before.rows.length);
    for (let i = 0; i < before.rows.length; i++) {
      expect(after.rows[i]).toEqual(before.rows[i]);
    }
  });

  it('cycles factors by row index — row N and row N+factors.length use the same target', () => {
    const factors = [1.0, 0.7, 1.3];
    const result = packJustifiedRows(
      SQUARE_PHOTOS,
      { ...OPTS, rowHeightFactors: factors },
      false,
    );
    // Need at least two full cycles for the assertion to be meaningful.
    expect(result.rows.length).toBeGreaterThanOrEqual(factors.length * 2);
    for (let i = 0; i + factors.length < result.rows.length; i++) {
      expect(result.rows[i]!.targetHeight).toBeCloseTo(
        result.rows[i + factors.length]!.targetHeight,
        6,
      );
    }
  });

  it('treats an empty or all-invalid factors array as uniform rows', () => {
    const uniform = packJustifiedRows(SQUARE_PHOTOS, OPTS, false);
    const empty = packJustifiedRows(
      SQUARE_PHOTOS,
      { ...OPTS, rowHeightFactors: [] },
      false,
    );
    const invalid = packJustifiedRows(
      SQUARE_PHOTOS,
      { ...OPTS, rowHeightFactors: [0, Number.NaN, -1] },
      false,
    );
    expect(empty.rows.map((r) => r.height)).toEqual(
      uniform.rows.map((r) => r.height),
    );
    expect(invalid.rows.map((r) => r.height)).toEqual(
      uniform.rows.map((r) => r.height),
    );
  });

  it('caps the effective target at maxRowHeight when a factor would overshoot it', () => {
    // factor 5 × target 300 = 1500, well above maxRowHeight=480.
    const result = packJustifiedRows(
      SQUARE_PHOTOS,
      { ...OPTS, rowHeightFactors: [5, 1] },
      false,
    );
    // Every other row uses the capped target.
    for (let i = 0; i < result.rows.length; i += 2) {
      expect(result.rows[i]!.targetHeight).toBeCloseTo(OPTS.maxRowHeight, 6);
    }
  });
});
