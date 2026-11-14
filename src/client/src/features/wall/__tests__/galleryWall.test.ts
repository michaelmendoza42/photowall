import { describe, expect, it } from 'vitest';
import type { PhotoQueryRecord } from '../../../../../shared/api/photos.js';
import { buildWallLayout } from '../useRadialWallLayout.js';
import type { PackedTile } from '../packer.js';

function photo(index: number, seed: number, starredEvery = 9): PhotoQueryRecord {
  const r = (index * seed) % 100;
  const [width, height] = r < 62 ? [6000, 4000] : r < 92 ? [4000, 6000] : r < 97 ? [3000, 3000] : [6000, 2000];
  return {
    ...(index % starredEvery === 0 ? { starred: true } : {}),
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

const REFERENCE_WIDTH = 3200;
const COLUMN = (REFERENCE_WIDTH * 0.75) / 5;
const BOX = { width: 1275, height: 800 };
const framedWall = (photos: PhotoQueryRecord[], featured = new Set([photos[1]!.id])) =>
  buildWallLayout({ photos, referenceWidth: REFERENCE_WIDTH, featuredBox: BOX, featuredPhotoIds: featured, spacing: 'framed' });
const tilesOf = (layout: { rows: Array<{ tiles: PackedTile[] }> }) => layout.rows.flatMap((row) => row.tiles);

/** The longest stretch (px) any vertical gap between frames runs straight, featured photos' own sides aside. */
function longestSeam(tiles: readonly PackedTile[], gap: number, skip: ReadonlySet<string>): number {
  const edges = new Map<number, Array<[number, number]>>();
  for (const tile of tiles) {
    if (skip.has(tile.photoId)) continue;
    for (const x of [tile.x - gap / 2, tile.x + tile.width + gap / 2]) {
      const key = Math.round(x);
      const list = edges.get(key) ?? [];
      list.push([tile.y - gap / 2, tile.y + tile.height + gap / 2]);
      edges.set(key, list);
    }
  }
  const xs = [...edges.keys()];
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  let longest = 0;
  for (const [x, spans] of edges) {
    // The wall's own edges meet the loop: not a seam between frames.
    if (x <= left + 2 || x >= right - 2) continue;
    spans.sort((a, b) => a[0] - b[0]);
    let [start, end] = spans[0]!;
    for (const [from, to] of spans.slice(1)) {
      if (from <= end + 1) end = Math.max(end, to);
      else {
        longest = Math.max(longest, end - start);
        [start, end] = [from, to];
      }
    }
    longest = Math.max(longest, end - start);
  }
  return longest;
}

describe('framed gallery wall', () => {
  it('keeps every gap between frames from running straight for long', () => {
    for (const [count, seed] of [[300, 7919], [400, 104729], [250, 15485863]] as const) {
      const photos = Array.from({ length: count }, (_, index) => photo(index, seed));
      const wall = framedWall(photos);
      const seam = longestSeam(tilesOf(wall), wall.gap, wall.featuredPhotoIds);
      // The column wall it replaced ran gaps 12 to 16 columns straight.
      expect(seam / COLUMN).toBeLessThan(6.5);
    }
  });

  it('hangs every photo once, with few repeats filling out the wall', () => {
    const photos = Array.from({ length: 300 }, (_, index) => photo(index, 7919));
    const tiles = tilesOf(framedWall(photos));
    const originals = tiles.filter((tile) => !tile.duplicate).map((tile) => tile.photoId);
    expect(new Set(originals).size).toBe(photos.length);
    expect(originals.length).toBe(photos.length);
    expect(tiles.length - originals.length).toBeLessThan(photos.length * 0.08);
  });

  it('hangs the featured photo at the middle of the wall, where it opens', () => {
    const photos = Array.from({ length: 300 }, (_, index) => photo(index, 7919));
    const wall = framedWall(photos);
    const hero = tilesOf(wall).find((tile) => wall.featuredPhotoIds.has(tile.photoId))!;
    expect(Math.abs(hero.x + hero.width / 2 - wall.worldWidth / 2)).toBeLessThan(COLUMN);
    expect(Math.abs(hero.y + hero.height / 2 - wall.contentHeight / 2)).toBeLessThan(COLUMN);
  });

  it('packs frames in close around the featured photo, small ones where needed', () => {
    for (const [count, seed] of [[300, 7919], [400, 104729], [250, 15485863]] as const) {
      const photos = Array.from({ length: count }, (_, index) => photo(index, seed));
      const wall = framedWall(photos);
      const tiles = tilesOf(wall);
      const hero = tiles.find((tile) => wall.featuredPhotoIds.has(tile.photoId))!;
      const reach = wall.gap * 1.6;
      // How much of one side has a frame hung a gap away along it.
      const covered = (near: (t: PackedTile) => boolean, along: (t: PackedTile) => [number, number], from: number, to: number) => {
        const spans = tiles
          .filter((t) => t !== hero && near(t))
          .map(along)
          .map(([a, b]): [number, number] => [Math.max(a, from), Math.min(b, to)])
          .filter(([a, b]) => b > a)
          .sort((p, q) => p[0] - q[0]);
        let total = 0;
        let at = from;
        for (const [a, b] of spans) {
          if (b > at) {
            total += b - Math.max(a, at);
            at = b;
          }
        }
        return total / (to - from);
      };
      const across = (t: PackedTile): [number, number] => [t.x, t.x + t.width];
      const down = (t: PackedTile): [number, number] => [t.y, t.y + t.height];
      const sides = [
        covered((t) => Math.abs(hero.y - (t.y + t.height)) <= reach, across, hero.x, hero.x + hero.width),
        covered((t) => Math.abs(t.y - (hero.y + hero.height)) <= reach, across, hero.x, hero.x + hero.width),
        covered((t) => Math.abs(hero.x - (t.x + t.width)) <= reach, down, hero.y, hero.y + hero.height),
        covered((t) => Math.abs(t.x - (hero.x + hero.width)) <= reach, down, hero.y, hero.y + hero.height),
      ];
      // The gaps between the frames along a side are about a tenth of it.
      for (const side of sides) expect(side).toBeGreaterThan(0.7);
    }
  });

  it('lays out a large selection quickly', () => {
    const photos = Array.from({ length: 2000 }, (_, index) => photo(index, 7919));
    const started = performance.now();
    const wall = framedWall(photos);
    expect(performance.now() - started).toBeLessThan(3000);
    expect(tilesOf(wall).filter((tile) => !tile.duplicate)).toHaveLength(photos.length);
  });
});
