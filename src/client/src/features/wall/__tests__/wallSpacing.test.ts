import { describe, expect, it } from 'vitest';
import type { PhotoQueryRecord } from '../../../../../shared/api/photos.js';
import { buildWallLayout, MONTAGE_MAX_AREA_SHARE } from '../useRadialWallLayout.js';
import { computeWorldWidth } from '../worldWidth.js';
import { galleryFrameGeometry } from '../wallSpacing.js';
import { galleryMouldingRatio } from '../featuredFrames.js';
import type { PackedTile } from '../packer.js';

function photo(index: number, starredEvery = 0): PhotoQueryRecord {
  const r = (index * 7919) % 100;
  const [width, height] =
    r < 62 ? [6000, 4000] : r < 92 ? [4000, 6000] : r < 97 ? [3000, 3000] : [6000, 2000];
  return {
    ...(starredEvery > 0 && index % starredEvery === 0 ? { starred: true } : {}),
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
    // No two frames overlap or crowd closer than a gap.
    const all = tilesOf(framed);
    for (let a = 0; a < all.length; a += 1) {
      for (let b = a + 1; b < all.length; b += 1) {
        const p = all[a]!;
        const q = all[b]!;
        const apartX = Math.max(q.x - (p.x + p.width), p.x - (q.x + q.width));
        const apartY = Math.max(q.y - (p.y + p.height), p.y - (q.y + q.height));
        expect(Math.max(apartX, apartY)).toBeGreaterThan(framed.gap - 1e-6);
      }
    }
    // Frames hung right under one another sit exactly one gap apart.
    let gaps = 0;
    for (const above of all) {
      const below = all
        .filter((t) => t.y >= above.y + above.height && t.x < above.x + above.width && t.x + t.width > above.x)
        .sort((a, b) => a.y - b.y)[0];
      if (!below) continue;
      if (Math.abs(below.y - (above.y + above.height) - framed.gap) < 1e-6) gaps += 1;
    }
    expect(gaps / all.length).toBeGreaterThan(0.8);
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

  it('hangs favorites near the middle of a framed wall, two columns wide where room allows', () => {
    const photos = Array.from({ length: 300 }, (_, index) => photo(index, 9));
    const framed = buildWallLayout({ photos, referenceWidth: 3600, featuredBox: BOX, spacing: 'framed' });
    const tiles = tilesOf(framed).filter((t) => !t.duplicate && !framed.featuredPhotoIds.has(t.photoId));
    const byId = new Map(photos.map((p) => [p.id, p]));
    // The mean column width at this reference width (3600 × 0.75 / 5 factors).
    const columnWidth = (3600 * 0.75) / 5;
    const spans = tiles.filter((t) => t.width > columnWidth * 1.6);
    const wanted = tiles.filter((t) => {
      const p = byId.get(t.photoId)!;
      return p.starred || p.aspectRatio >= 1.9;
    });
    // Near the middle comes first: with one photo in nine a favorite there
    // isn't room near it for all of them two columns wide, so some hang at
    // the usual size rather than far out.
    expect(spans.length / wanted.length).toBeGreaterThan(0.2);
    // Favorites hang nearest the middle, where the wall grows out from.
    const middle = { x: framed.worldWidth / 2, y: framed.contentHeight / 2 };
    const distance = (t: PackedTile) => Math.hypot(t.x + t.width / 2 - middle.x, t.y + t.height / 2 - middle.y);
    const byDistance = tiles.map(distance).sort((a, b) => a - b);
    const rank = (t: PackedTile) => byDistance.findIndex((d) => d >= distance(t)) / byDistance.length;
    const favoriteRanks = tiles.filter((t) => byId.get(t.photoId)!.starred).map(rank).sort((a, b) => a - b);
    expect(favoriteRanks[Math.floor(favoriteRanks.length / 2)]!).toBeLessThan(0.15);
    // Even the furthest, with this many favorites hanging larger, is in the
    // nearer half.
    expect(favoriteRanks[favoriteRanks.length - 1]!).toBeLessThan(0.5);
    for (const span of spans) {
      const p = byId.get(span.photoId)!;
      expect(p.starred || p.aspectRatio >= 1.9).toBe(true);
    }
    // So favorites hang larger than the rest.
    const area = (t: PackedTile) => t.width * t.height;
    const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    expect(
      median(tiles.filter((t) => byId.get(t.photoId)!.starred).map(area)) /
        median(tiles.filter((t) => !byId.get(t.photoId)!.starred).map(area)),
    ).toBeGreaterThan(1.75);
    // Other spacings don't change sizes for favorites.
    const spaced = layoutFor('spaced');
    expect(tilesOf(spaced).every((t) => t.width < columnWidth * 1.6 || spaced.featuredPhotoIds.has(t.photoId))).toBe(true);
  });

  it('keeps every framed photo from getting small', () => {
    const framed = layoutFor('framed');
    const mean = (3600 * 0.75) / 5;
    const smallest = Math.min(
      ...tilesOf(framed)
        .filter((t) => !framed.featuredPhotoIds.has(t.photoId))
        .map((t) => ((t.width + framed.gap) * (t.height + framed.gap)) / (mean * mean)),
    );
    expect(smallest).toBeGreaterThan(0.25);
  });

  it('fills 90% of the screen with the featured frame on a framed wall', () => {
    const photos = PHOTOS.map((p, index) => (index === 0 ? { ...p, featured: true } : p));
    const ids = new Set([photos[0]!.id]);
    const box = BOX;
    for (const spacing of ['framed', 'spaced'] as const) {
      const layout = buildWallLayout({ photos, referenceWidth: 3600, featuredBox: box, featuredPhotoIds: ids, spacing });
      const hero = tilesOf(layout).find((t) => ids.has(t.photoId) && !t.duplicate)!;
      // Frame included, it fits the box and fills it one way.
      expect(hero.width).toBeLessThanOrEqual(box.width + 1e-6);
      expect(hero.height).toBeLessThanOrEqual(box.height + 1e-6);
      const fill = Math.max(hero.width / box.width, hero.height / box.height);
      if (spacing === 'framed') expect(fill).toBeCloseTo(1, 3);
      // Other spacings keep their gap inside the box.
      else expect(fill).toBeLessThan(1);
    }
  });

  it('never hangs another photo even half the size of the featured one', () => {
    const photos = Array.from({ length: 300 }, (_, index) => photo(index, 9)).map((p, index) =>
      index === 1 ? { ...p, featured: true } : p,
    );
    const ids = new Set([photos[1]!.id]);
    for (const viewport of [{ width: 1000, height: 548 }, { width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const box = { width: viewport.width * 0.9, height: viewport.height * 0.9 };
      for (const spacing of ['none', 'spaced', 'framed'] as const) {
        const layout = buildWallLayout({
          photos,
          referenceWidth: computeWorldWidth(viewport.width),
          featuredBox: box,
          featuredPhotoIds: ids,
          spacing,
        });
        const tiles = tilesOf(layout);
        const hero = tiles.find((t) => ids.has(t.photoId))!;
        expect(hero).toBeDefined();
        const largest = Math.max(...tiles.filter((t) => t !== hero && !ids.has(t.photoId)).map((t) => t.width * t.height));
        expect(largest / (hero.width * hero.height)).toBeLessThanOrEqual(MONTAGE_MAX_AREA_SHARE + 1e-3);
      }
    }
  });

  it('lays out nothing until the wall knows its size', () => {
    const unknown = buildWallLayout({ photos: PHOTOS, referenceWidth: 3600, featuredBox: null, spacing: 'framed' });
    expect(unknown.rows).toEqual([]);
  });
});
