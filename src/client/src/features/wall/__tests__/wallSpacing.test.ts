import { describe, expect, it } from 'vitest';
import type { PhotoQueryRecord } from '../../../../../shared/api/photos.js';
import { buildWallLayout } from '../useRadialWallLayout.js';
import { galleryFrameGeometry } from '../wallSpacing.js';
import { galleryMouldingRatio } from '../featuredFrames.js';
import type { PackedTile } from '../packer.js';

function photo(index: number): PhotoQueryRecord {
  const r = (index * 7919) % 100;
  const [width, height] =
    r < 62 ? [6000, 4000] : r < 92 ? [4000, 6000] : r < 97 ? [3000, 3000] : [6000, 2000];
  return {
    id: `p${index}`,
    relativePath: `2024/album/${index}.jpg`,
    directoryPath: '2024/album',
    filename: `${index}.jpg`,
    width,
    height,
    aspectRatio: width / height,
    fileSize: 1,
    mtimeMs: 0,
    year: 2024,
    yearSource: 'top-level',
  };
}

const PHOTOS = Array.from({ length: 160 }, (_, index) => photo(index));
const BOX = { width: 1440, height: 900 };
const layoutFor = (spacing: 'none' | 'spaced' | 'framed') =>
  buildWallLayout({ photos: PHOTOS, referenceWidth: 3600, featuredBox: BOX, spacing });
const tilesOf = (layout: { rows: Array<{ tiles: PackedTile[] }> }) =>
  layout.rows.flatMap((row) => row.tiles);

describe('wall spacing', () => {
  it('spaces the gapless wall out evenly without moving it', () => {
    const none = layoutFor('none');
    const spaced = layoutFor('spaced');
    expect(none.gap).toBe(0);
    expect(spaced.gap).toBeGreaterThan(0);
    expect(spaced.worldWidth).toBeCloseTo(none.worldWidth, 6);
    // Interior tiles (not stretched past the edge on the gapless wall) are
    // the same cells, half a gap in on every side.
    const byKey = (t: PackedTile) => `${t.photoId}:${t.lane}`;
    const spacedTiles = new Map(tilesOf(spaced).map((t) => [byKey(t), t]));
    let compared = 0;
    for (const tile of tilesOf(none)) {
      if (tile.layer) continue;
      const other = spacedTiles.get(byKey(tile));
      if (!other) continue;
      compared += 1;
      expect(other.x).toBeCloseTo(tile.x + spaced.gap / 2, 6);
      expect(other.width).toBeCloseTo(tile.width - spaced.gap, 6);
    }
    expect(compared).toBeGreaterThan(100);
  });

  it('frames every photo uncropped, with even gaps between frames', () => {
    const framed = layoutFor('framed');
    expect(framed.gap).toBeGreaterThan(layoutFor('spaced').gap);
    const tiles = tilesOf(framed).filter((t) => !framed.featuredPhotoIds.has(t.photoId));
    const byId = new Map(PHOTOS.map((p) => [p.id, p]));
    for (const tile of tiles) {
      const source = byId.get(tile.photoId)!;
      // Tiles keep the photo's real size for drawing.
      expect(tile.sourceWidth).toBe(source.width);
      for (const mat of ['frame', 'none'] as const) {
        const { photo } = galleryFrameGeometry(tile, source, galleryMouldingRatio('walnut'), mat);
        expect(photo.width / photo.height).toBeCloseTo(source.aspectRatio, 6);
        expect(photo.x).toBeGreaterThanOrEqual(tile.x - 1e-6);
        expect(photo.x + photo.width).toBeLessThanOrEqual(tile.x + tile.width + 1e-6);
      }
    }
    // Neighbours in a column sit exactly one gap apart.
    const byLane = new Map<number, PackedTile[]>();
    for (const tile of tilesOf(framed)) {
      const list = byLane.get(tile.lane) ?? [];
      list.push(tile);
      byLane.set(tile.lane, list);
    }
    let gaps = 0;
    for (const lane of byLane.values()) {
      lane.sort((a, b) => a.y - b.y);
      for (let i = 1; i < lane.length; i += 1) {
        const above = lane[i - 1]!;
        const below = lane[i]!;
        if (Math.abs(above.x - below.x) > 1 || Math.abs(above.width - below.width) > 1) continue;
        expect(below.y - (above.y + above.height)).toBeCloseTo(framed.gap, 6);
        gaps += 1;
      }
    }
    expect(gaps).toBeGreaterThan(50);
  });

  it('keeps mats close to even: framed cells are shaped for framed photos', () => {
    const framed = layoutFor('framed');
    const byId = new Map(PHOTOS.map((p) => [p.id, p]));
    const imbalance = tilesOf(framed)
      .filter((t) => !t.duplicate && !framed.featuredPhotoIds.has(t.photoId))
      .map((tile) => {
        const source = byId.get(tile.photoId)!;
        const { photo, moulding } = galleryFrameGeometry(tile, source, galleryMouldingRatio('gilded'), 'frame');
        const matX = photo.x - tile.x - moulding;
        const matY = photo.y - tile.y - moulding;
        return Math.abs(matX - matY) / Math.max(photo.width, photo.height);
      })
      .sort((a, b) => a - b);
    expect(imbalance[Math.floor(imbalance.length / 2)]!).toBeLessThan(0.03);
    expect(imbalance[Math.floor(imbalance.length * 0.9)]!).toBeLessThan(0.2);
  });

  it('lays out nothing until the wall knows its size', () => {
    const unknown = buildWallLayout({ photos: PHOTOS, referenceWidth: 3600, featuredBox: null, spacing: 'framed' });
    expect(unknown.rows).toEqual([]);
  });
});
