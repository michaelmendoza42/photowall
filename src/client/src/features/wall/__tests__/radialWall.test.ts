import { describe, expect, it } from 'vitest';
import type { PhotoQueryRecord } from '../../../../../shared/api/photos.js';
import {
  buildRadialWallLayout,
  EDGE_REACH_CAP,
  groupPhotosByDirectory,
  type RadialWallGroup,
  type RadialWallLayout,
} from '../radialWall.js';
import type { PackedTile } from '../packer.js';
import { DEFAULT_MOSAIC_COLUMN_FACTORS } from '../worldWidth.js';
import { featuredPhotoRect, featuredTileAspect } from '../featuredGeometry.js';

function photo(group: number, index: number): PhotoQueryRecord {
  // Mostly 3:2 landscape, about a third portrait, a few squares and panoramas.
  const r = (index * 7919 + group * 31) % 100;
  const [width, height] =
    r < 62 ? [6000, 4000] : r < 92 ? [4000, 6000] : r < 97 ? [3000, 3000] : [6000, 2000];
  return {
    id: `g${group}-${index}`,
    relativePath: `2024/album-${group}/${index}.jpg`,
    directoryPath: `2024/album-${group}`,
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

function groups(sizes: readonly number[]): RadialWallGroup[] {
  return sizes.map((size, group) => ({
    key: `g${group}`,
    photos: Array.from({ length: size }, (_, index) => photo(group, index)),
  }));
}

function layout(input: RadialWallGroup[]): RadialWallLayout {
  return buildRadialWallLayout({
    groups: input,
    referenceWidth: 3600,
    maxRowHeight: 460,
    columnWidthFactors: DEFAULT_MOSAIC_COLUMN_FACTORS,
  });
}

function tilesOf(result: RadialWallLayout): PackedTile[] {
  return result.rows.flatMap((row) => row.tiles);
}

function originalsOf(result: RadialWallLayout): PackedTile[] {
  return tilesOf(result).filter((tile) => !tile.duplicate);
}

/** A tile clipped to the world rectangle: its share of the gapless core. */
function clipped(tile: PackedTile, result: RadialWallLayout) {
  const x0 = Math.max(0, tile.x);
  const y0 = Math.max(0, tile.y);
  const x1 = Math.min(result.worldWidth, tile.x + tile.width);
  const y1 = Math.min(result.contentHeight, tile.y + tile.height);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function center(tile: PackedTile): { x: number; y: number } {
  return { x: tile.x + tile.width / 2, y: tile.y + tile.height / 2 };
}

const ONE_ALBUM = groups([261]);
const THREE_ALBUMS = groups([261, 80, 40]);

describe('buildRadialWallLayout', () => {
  it('places every photo exactly once, plus repeats on the edge', () => {
    const result = layout(THREE_ALBUMS);
    const ids = originalsOf(result).map((tile) => tile.photoId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(381);
    expect(result.packedPhotoCount).toBe(381);
    const repeats = tilesOf(result).filter((tile) => tile.duplicate);
    expect(repeats.length).toBeGreaterThan(0);
    for (const tile of repeats) expect(ids).toContain(tile.photoId);
  });

  it('covers the whole world with no gaps or overlaps, so it loops cleanly', () => {
    const result = layout(THREE_ALBUMS);
    // Edge tiles reach past the world; inside it they still tile exactly.
    const tiles = tilesOf(result).map((tile) => ({ ...tile, ...clipped(tile, result) }));
    const area = tiles.reduce((sum, tile) => sum + tile.width * tile.height, 0);
    expect(area / (result.worldWidth * result.contentHeight)).toBeCloseTo(1, 6);
    for (const tile of tiles) {
      expect(tile.x).toBeGreaterThanOrEqual(-0.01);
      expect(tile.y).toBeGreaterThanOrEqual(-0.01);
      expect(tile.x + tile.width).toBeLessThanOrEqual(result.worldWidth + 0.01);
      expect(tile.y + tile.height).toBeLessThanOrEqual(result.contentHeight + 0.01);
    }
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

  it('sprawls out about as wide as it is tall instead of a tall strip', () => {
    for (const input of [ONE_ALBUM, THREE_ALBUMS]) {
      const result = layout(input);
      const ratio = result.worldWidth / result.contentHeight;
      expect(ratio).toBeGreaterThan(0.75);
      expect(ratio).toBeLessThan(1.35);
    }
  });

  it('puts earlier photos nearer the center, so every direction brings new ones', () => {
    const result = layout(ONE_ALBUM);
    const byId = new Map(originalsOf(result).map((tile) => [tile.photoId, tile]));
    const cx = result.worldWidth / 2;
    const cy = result.contentHeight / 2;
    const distance = (id: string) => {
      const c = center(byId.get(id)!);
      return Math.hypot(c.x - cx, c.y - cy);
    };
    const ids = ONE_ALBUM[0]!.photos.map((p) => p.id);
    const firstTenth = ids.slice(0, 26).map(distance);
    const lastTenth = ids.slice(-26).map(distance);
    const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean(firstTenth)).toBeLessThan(mean(lastTenth) * 0.4);

    // Rank by order vs distance from the center is strongly correlated.
    const ranks = ids.map((_, index) => index);
    const distances = ids.map(distance);
    const mr = mean(ranks);
    const md = mean(distances);
    let cov = 0;
    let vr = 0;
    let vd = 0;
    ranks.forEach((rank, index) => {
      cov += (rank - mr) * (distances[index]! - md);
      vr += (rank - mr) ** 2;
      vd += (distances[index]! - md) ** 2;
    });
    expect(cov / Math.sqrt(vr * vd)).toBeGreaterThan(0.9);
  });

  it('keeps each album together in its own part of the wall', () => {
    const result = layout(THREE_ALBUMS);
    const tiles = originalsOf(result);
    for (const group of THREE_ALBUMS) {
      const own = tiles.filter((tile) => tile.photoId.startsWith(`${group.key}-`));
      const nearestOwnCenter = own.filter((tile) => {
        const c = center(tile);
        let best = '';
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const [key, groupCenter] of result.groupCenters) {
          const d = Math.hypot(c.x - groupCenter.x, c.y - groupCenter.y);
          if (d < bestDistance) {
            bestDistance = d;
            best = key;
          }
        }
        return best === group.key;
      });
      // Scattered at random this would be about one in three.
      expect(nearestOwnCenter.length / own.length).toBeGreaterThan(0.65);
    }
  });

  it('pulls starred photos toward the center within their own album', () => {
    // Star every 9th photo, so most stars sit late in each album's order.
    const starred = THREE_ALBUMS.map((group) => ({
      ...group,
      photos: group.photos.map((p, index) => (index % 9 === 8 ? { ...p, starred: true } : p)),
    }));
    const plain = layout(THREE_ALBUMS);
    const result = layout(starred);
    // Only which photo shows where changes; the tiles stay put.
    const rects = (r: RadialWallLayout) =>
      tilesOf(r).map((tile) => [tile.x, tile.y, tile.width, tile.height].join(','));
    expect(rects(result)).toEqual(rects(plain));

    const byId = new Map(originalsOf(result).map((tile) => [tile.photoId, tile]));
    const cx = result.worldWidth / 2;
    const cy = result.contentHeight / 2;
    const distance = (id: string) => {
      const c = center(byId.get(id)!);
      return Math.hypot(c.x - cx, c.y - cy);
    };
    for (const group of starred) {
      const shapes = new Set(group.photos.map((p) => p.aspectRatio));
      for (const shape of shapes) {
        const same = group.photos.filter((p) => p.aspectRatio === shape);
        const stars = same.filter((p) => p.starred).map((p) => distance(p.id));
        const rest = same.filter((p) => !p.starred).map((p) => distance(p.id));
        if (stars.length === 0 || rest.length === 0) continue;
        expect(Math.max(...stars)).toBeLessThanOrEqual(Math.min(...rest));
      }
    }
  });

  it('starts the largest share of the first album at the center', () => {
    const result = layout(THREE_ALBUMS);
    const first = result.groupCenters.get('g0')!;
    const distance = Math.hypot(first.x - result.worldWidth / 2, first.y - result.contentHeight / 2);
    expect(distance).toBeLessThan(Math.min(result.worldWidth, result.contentHeight) * 0.2);
  });

  it('keeps crop low: photos mostly land in tiles of their own shape', () => {
    const tiles = originalsOf(layout(THREE_ALBUMS));
    const crops = tiles.map((tile) => {
      const photoAspect = tile.sourceWidth / tile.sourceHeight;
      const tileAspect = tile.width / tile.height;
      return 1 - Math.min(photoAspect, tileAspect) / Math.max(photoAspect, tileAspect);
    });
    const mean = crops.reduce((a, b) => a + b, 0) / crops.length;
    expect(mean).toBeLessThan(0.12);
    expect(crops.filter((crop) => crop > 0.4).length / crops.length).toBeLessThan(0.03);
  });

  it('keeps every original photo off the outer edge', () => {
    const result = layout(THREE_ALBUMS);
    for (const tile of originalsOf(result)) {
      expect(tile.x).toBeGreaterThan(0.5);
      expect(tile.y).toBeGreaterThan(0.5);
      expect(tile.x + tile.width).toBeLessThan(result.worldWidth - 0.5);
      expect(tile.y + tile.height).toBeLessThan(result.contentHeight - 0.5);
    }
  });

  it('lets edge tiles reach past the edge, over only the other side\'s repeats', () => {
    const result = layout(THREE_ALBUMS);
    const tiles = tilesOf(result);
    const W = result.worldWidth;
    const H = result.contentHeight;
    const reaching = tiles.filter(
      (tile) => tile.x < 0 || tile.y < 0 || tile.x + tile.width > W || tile.y + tile.height > H,
    );
    // Rough edges, not straight ones: plenty of tiles reach out, by varied amounts.
    expect(reaching.length).toBeGreaterThan(20);
    const leftReach = new Set(tiles.filter((t) => t.x < 0).map((t) => Math.round(-t.x)));
    expect(leftReach.size).toBeGreaterThan(5);
    for (const tile of reaching) {
      expect(tile.duplicate).toBe(true);
      // Where the loop puts it beside the opposite edge, it overlaps only repeats.
      for (const [dx, dy] of [[W, 0], [-W, 0], [0, H], [0, -H], [W, H], [-W, -H], [W, -H], [-W, H]] as const) {
        const moved = { x: tile.x + dx, y: tile.y + dy, width: tile.width, height: tile.height };
        for (const other of tiles) {
          if (other.duplicate) continue;
          const overlapX = Math.min(moved.x + moved.width, other.x + other.width) - Math.max(moved.x, other.x);
          const overlapY = Math.min(moved.y + moved.height, other.y + other.height) - Math.max(moved.y, other.y);
          expect(overlapX > 0.5 && overlapY > 0.5, `${tile.photoId} covers original ${other.photoId}`).toBe(false);
        }
      }
    }
  });

  it('never covers an edge tile down to a sliver', () => {
    const result = layout(THREE_ALBUMS);
    const tiles = tilesOf(result);
    const W = result.worldWidth;
    const H = result.contentHeight;
    const spans = (a0: number, a1: number, b0: number, b1: number) =>
      Math.min(a1, b1) - Math.max(a0, b0) > 0.5;
    // Corner tiles also reach sideways; checking the rest keeps slots exact.
    const inX = tiles.filter((t) => t.x >= 0 && t.x + t.width <= W);
    const inY = tiles.filter((t) => t.y >= 0 && t.y + t.height <= H);
    for (const top of inX.filter((t) => t.y < 0)) {
      for (const bottom of inX.filter((t) => t.y + t.height > H)) {
        if (!spans(top.x, top.x + top.width, bottom.x, bottom.x + bottom.width)) continue;
        const topSlot = top.y + top.height;
        const bottomSlot = H - bottom.y;
        expect(-top.y).toBeLessThanOrEqual(bottomSlot * EDGE_REACH_CAP + 0.01);
        expect(bottom.y + bottom.height - H).toBeLessThanOrEqual(topSlot * EDGE_REACH_CAP + 0.01);
      }
    }
    for (const left of inY.filter((t) => t.x < 0)) {
      for (const right of inY.filter((t) => t.x + t.width > W)) {
        if (!spans(left.y, left.y + left.height, right.y, right.y + right.height)) continue;
        expect(-left.x).toBeLessThanOrEqual((W - right.x) * EDGE_REACH_CAP + 0.01);
        expect(right.x + right.width - W).toBeLessThanOrEqual((left.x + left.width) * EDGE_REACH_CAP + 0.01);
      }
    }
  });

  it('draws some edge tiles over and some under the other side', () => {
    const layers = new Set(
      tilesOf(layout(THREE_ALBUMS)).filter((tile) => tile.layer).map((tile) => tile.layer),
    );
    expect(layers).toEqual(new Set([1, 2]));
  });

  it('is deterministic', () => {
    expect(tilesOf(layout(THREE_ALBUMS))).toEqual(tilesOf(layout(THREE_ALBUMS)));
  });

  it('returns an empty layout for no photos', () => {
    const result = layout([]);
    expect(result.packedPhotoCount).toBe(0);
    expect(result.rows).toEqual([]);
  });

  it('handles a single photo', () => {
    const result = layout(groups([1]));
    expect(originalsOf(result)).toHaveLength(1);
    expect(result.worldWidth).toBeGreaterThan(0);
    expect(result.contentHeight).toBeGreaterThan(0);
  });
});

/** Each album features one photo from late in its order. */
function featuring(input: RadialWallGroup[], index = 40): RadialWallGroup[] {
  return input.map((group) => {
    const pick = group.photos[Math.min(index, group.photos.length - 1)]!;
    const featured = { ...pick, featured: true };
    return {
      ...group,
      photos: group.photos.map((p) => (p === pick ? featured : p)),
      featured,
    };
  });
}

function assertGapless(result: RadialWallLayout): void {
  const tiles = tilesOf(result).map((tile) => ({ ...tile, ...clipped(tile, result) }));
  const area = tiles.reduce((sum, tile) => sum + tile.width * tile.height, 0);
  expect(area / (result.worldWidth * result.contentHeight)).toBeCloseTo(1, 6);
  for (let i = 0; i < tiles.length; i += 1) {
    for (let j = i + 1; j < tiles.length; j += 1) {
      const a = tiles[i]!;
      const b = tiles[j]!;
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      expect(overlapX > 0.01 && overlapY > 0.01, `${a.photoId} overlaps ${b.photoId}`).toBe(false);
    }
  }
}

/** 90% of a 1600×1000 viewport, the size the reference width suits. */
const FEATURED_BOX = { width: 1440, height: 900 };

function featuredLayout(input: RadialWallGroup[], box = FEATURED_BOX): RadialWallLayout {
  return buildRadialWallLayout({
    groups: input,
    referenceWidth: 3600,
    maxRowHeight: 460,
    columnWidthFactors: DEFAULT_MOSAIC_COLUMN_FACTORS,
    featuredBox: box,
  });
}

function heroOf(result: RadialWallLayout, id: string): PackedTile {
  return originalsOf(result).find((tile) => tile.photoId === id)!;
}

describe('featured photos', () => {
  it('draws each album\'s featured photo once, uncropped, filling the viewport box', () => {
    const input = featuring(THREE_ALBUMS);
    const result = featuredLayout(input);
    expect([...result.featuredPhotoIds].sort()).toEqual(
      input.map((group) => group.featured!.id).sort(),
    );
    const ids = originalsOf(result).map((tile) => tile.photoId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(381);
    for (const group of input) {
      const tiles = tilesOf(result).filter((tile) => tile.photoId === group.featured!.id);
      // Only the hero shows it: no repeats on the edge.
      expect(tiles).toHaveLength(1);
      const hero = tiles[0]!;
      // The tile is the frame: as large as fits the box, one way exactly.
      expect(hero.width).toBeLessThanOrEqual(FEATURED_BOX.width + 0.01);
      expect(hero.height).toBeLessThanOrEqual(FEATURED_BOX.height + 0.01);
      expect(
        Math.max(hero.width / FEATURED_BOX.width, hero.height / FEATURED_BOX.height),
      ).toBeCloseTo(1, 3);
      // Inside the frame the photo keeps its own shape: never cropped.
      const inner = featuredPhotoRect(hero, group.featured!);
      expect(inner.width / inner.height).toBeCloseTo(group.featured!.aspectRatio, 6);
      expect(inner.x).toBeGreaterThan(hero.x);
      expect(inner.y).toBeGreaterThan(hero.y);
      // Shaped so the frame holds it with no mat left over.
      expect(hero.width / hero.height).toBeCloseTo(
        featuredTileAspect(group.featured!.aspectRatio),
        3,
      );
    }
  });

  it('keeps the wall gapless and the hero off the outer edge', () => {
    for (const input of [featuring(ONE_ALBUM), featuring(THREE_ALBUMS), featuring(groups([60]), 5)]) {
      const result = featuredLayout(input);
      expect(result.featuredPhotoIds.size).toBe(input.length);
      assertGapless(result);
      for (const id of result.featuredPhotoIds) {
        const tile = heroOf(result, id);
        expect(tile.x).toBeGreaterThan(0);
        expect(tile.y).toBeGreaterThan(0);
        expect(tile.x + tile.width).toBeLessThan(result.worldWidth);
        expect(tile.y + tile.height).toBeLessThan(result.contentHeight);
      }
    }
  });

  it('puts a single album\'s featured photo at the center of the wall, where it opens', () => {
    for (const size of [20, 40, 70, 150, 261, 600]) {
      for (const index of [0, 3, 11]) {
        const label = `${size} photos, featuring #${index}`;
        const result = featuredLayout(featuring(groups([size]), index));
        const id = [...result.featuredPhotoIds][0];
        expect(id, label).toBeDefined();
        const tile = heroOf(result, id!);
        const hero = center(tile);
        // Close enough that it fills most of the screen the wall opens on
        // (small albums leave little wall around it to center it in).
        expect(Math.abs(hero.x - result.worldWidth / 2) / tile.width, label).toBeLessThan(
          size >= 70 ? 0.02 : 0.2,
        );
        expect(Math.abs(hero.y - result.contentHeight / 2) / tile.height, label).toBeLessThan(0.3);
      }
    }
  });

  it('works for portrait and panorama photos and smaller screens', () => {
    for (const [width, height] of [[4000, 6000], [6000, 2000], [3000, 3000]] as const) {
      const [group] = groups([150]);
      const featured = { ...group!.photos[7]!, width, height, aspectRatio: width / height };
      const photos = group!.photos.map((p, i) => (i === 7 ? featured : p));
      for (const box of [FEATURED_BOX, { width: 700, height: 1200 }]) {
        const result = featuredLayout([{ ...group!, photos, featured }], box);
        expect(result.featuredPhotoIds.has(featured.id), `${width}x${height}`).toBe(true);
        assertGapless(result);
        const hero = heroOf(result, featured.id);
        const inner = featuredPhotoRect(hero, featured);
        expect(inner.width / inner.height).toBeCloseTo(width / height, 6);
      }
    }
  });

  it('keeps each hero inside its own album\'s part of the wall', () => {
    const input = featuring(THREE_ALBUMS);
    const result = featuredLayout(input);
    for (const group of input) {
      const hero = center(heroOf(result, group.featured!.id));
      const own = result.groupCenters.get(group.key)!;
      const nearest = [...result.groupCenters].sort(
        ([, a], [, b]) =>
          Math.hypot(a.x - hero.x, a.y - hero.y) - Math.hypot(b.x - hero.x, b.y - hero.y),
      )[0]!;
      expect(nearest[1]).toEqual(own);
    }
  });

  it('lays featured photos out like any other without a viewport box', () => {
    const result = layout(featuring(THREE_ALBUMS));
    expect(result.featuredPhotoIds.size).toBe(0);
    expect(originalsOf(result)).toHaveLength(381);
  });

  it('ignores a featured photo that is not in the group', () => {
    const [group] = groups([80]);
    const result = featuredLayout([{ ...group!, featured: photo(9, 0) }]);
    expect(result.featuredPhotoIds.size).toBe(0);
    expect(originalsOf(result)).toHaveLength(80);
  });

  it('lays out tiny albums rather than failing', () => {
    for (const size of [1, 2, 3, 8]) {
      const result = featuredLayout(featuring(groups([size]), 1));
      expect(originalsOf(result), `${size} photos`).toHaveLength(size);
      assertGapless(result);
    }
  });
});

describe('groupPhotosByDirectory', () => {
  it('groups by folder in order of first appearance', () => {
    const photos = [photo(1, 0), photo(0, 0), photo(1, 1)];
    expect(groupPhotosByDirectory(photos).map((group) => [group.key, group.photos.length])).toEqual([
      ['2024/album-1', 2],
      ['2024/album-0', 1],
    ]);
  });
});
