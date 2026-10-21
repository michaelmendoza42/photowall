import { describe, expect, it } from 'vitest';
import type { PhotoQueryRecord } from '../../../../../shared/api/photos.js';
import type { CameraState } from '../../../state/camera.js';
import {
  buildFocusNavigation,
  cameraCenteredOnTile,
  stepFocusOrder,
} from '../focusNavigation.js';
import { buildPackedRows, packJustifiedRows, type PackedTile } from '../packer.js';

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

const SHAPES: Array<[number, number]> = [
  [1600, 1200],
  [1200, 1600],
  [2000, 1000],
  [1000, 1000],
  [900, 1600],
];

function packedWall(count: number) {
  const photos = Array.from({ length: count }, (_, index) => {
    const [w, h] = SHAPES[index % SHAPES.length]!;
    return photo(`p${index}`, w, h);
  });
  return packJustifiedRows(photos, { worldWidth: 1800, maxRowHeight: 480, tileScale: 1 }, false);
}

function touches(a: PackedTile, b: PackedTile): boolean {
  const near = (x: number, y: number) => Math.abs(x - y) <= 0.5;
  const xOverlap = a.x < b.x + b.width && b.x < a.x + a.width;
  const yOverlap = a.y < b.y + b.height && b.y < a.y + a.height;
  const stacked = xOverlap && (near(a.y + a.height, b.y) || near(b.y + b.height, a.y));
  const sideBySide = yOverlap && (near(a.x + a.width, b.x) || near(b.x + b.width, a.x));
  return stacked || sideBySide;
}

describe('buildFocusNavigation', () => {
  it('visits every packed photo exactly once', () => {
    const packed = packedWall(60);
    const { order } = buildFocusNavigation(packed.rows);
    const ids = packed.rows.flatMap((row) => row.tiles.map((tile) => tile.photoId));
    expect(order).toHaveLength(ids.length);
    expect(new Set(order)).toEqual(new Set(ids));
  });

  it('serpentines rightward along two-photo bands, then drops a band', () => {
    const tile = (lane: number, row: number): PackedTile => ({
      photoId: `l${lane}r${row}`, x: lane * 100, y: row * 100, width: 100, height: 100,
      sourceWidth: 1, sourceHeight: 1, lane, mosaic: 0,
    });
    const tiles = [0, 1, 2, 3].flatMap((lane) => [0, 1, 2, 3].map((row) => tile(lane, row)));
    const { order } = buildFocusNavigation(buildPackedRows(tiles, 400, 480));
    expect(order).toEqual([
      'l0r0', 'l0r1', 'l1r1', 'l1r0', 'l2r0', 'l2r1', 'l3r1', 'l3r0',
      'l0r2', 'l0r3', 'l1r3', 'l1r2', 'l2r2', 'l2r3', 'l3r3', 'l3r2',
    ]);
  });

  it('only steps left when dropping to the next band on a packed wall', () => {
    const packed = packedWall(60);
    const { order, tilesById } = buildFocusNavigation(packed.rows);
    const tiles = order.map((id) => tilesById.get(id)!);
    const centerY = (t: PackedTile) => t.y + t.height / 2;
    const leftSteps = tiles.filter((t, i) => i > 0 && t.lane < tiles[i - 1]!.lane);
    // Each left step wraps to the start of the next band, lower on the wall.
    for (const t of leftSteps) {
      const prev = tiles[tiles.indexOf(t) - 1]!;
      expect(centerY(t), `${prev.photoId} -> ${t.photoId}`).toBeGreaterThan(centerY(prev));
    }
    const lanes = new Set(tiles.map((t) => t.lane)).size;
    // Far fewer wraps than steps: most steps travel right or along a column.
    expect(leftSteps.length).toBeLessThan(tiles.length / lanes);
  });

  it('finishes one album area before moving to the next', () => {
    const tile = (photoId: string, x: number, y: number, mosaic: number): PackedTile => ({
      photoId, x, y, width: 100, height: 100, sourceWidth: 1, sourceHeight: 1,
      lane: Math.floor(x / 100), mosaic,
    });
    // Album A: two columns at the top. Album B: two columns lower down,
    // interleaved in x with A so an x-only sort would zigzag between them.
    const tiles = [
      tile('a1', 0, 0, 0), tile('a2', 0, 100, 0), tile('a3', 100, 0, 0), tile('a4', 100, 100, 0),
      tile('b1', 50, 600, 1), tile('b2', 50, 700, 1), tile('b3', 150, 600, 1), tile('b4', 150, 700, 1),
    ];
    const { order } = buildFocusNavigation(buildPackedRows(tiles, 800, 480));
    expect(order).toEqual(['a1', 'a2', 'a4', 'a3', 'b1', 'b2', 'b4', 'b3']);
  });
});

describe('stepFocusOrder', () => {
  const order = ['a', 'b', 'c', 'd'];

  it('steps forward and back, wrapping at the ends', () => {
    expect(stepFocusOrder(order, 'b', 'next')).toBe('c');
    expect(stepFocusOrder(order, 'b', 'previous')).toBe('a');
    expect(stepFocusOrder(order, 'd', 'next')).toBe('a');
    expect(stepFocusOrder(order, 'a', 'previous')).toBe('d');
  });

  it('cycles through every photo before repeating', () => {
    const seen: string[] = [];
    let id = 'c';
    for (let i = 0; i < order.length; i += 1) {
      id = stepFocusOrder(order, id, 'next')!;
      seen.push(id);
    }
    expect(seen).toEqual(['d', 'a', 'b', 'c']);
  });

  it('returns null for unknown photos or a single-photo wall', () => {
    expect(stepFocusOrder(order, 'z', 'next')).toBeNull();
    expect(stepFocusOrder(['a'], 'a', 'next')).toBeNull();
  });
});

describe('cameraCenteredOnTile', () => {
  const camera: CameraState = {
    x: 0,
    y: 0,
    viewport: { width: 1200, height: 800 },
    world: { width: 2400, height: 1600 },
  };
  const tile = { x: 900, y: 500, width: 200, height: 200 };

  it('centers the tile in the viewport at the current zoom', () => {
    expect(cameraCenteredOnTile(camera, tile, 1)).toEqual({ x: 400, y: 200 });
    // At 2x the viewport spans 600x400 world px.
    expect(cameraCenteredOnTile(camera, tile, 2)).toEqual({ x: 700, y: 400 });
  });

  it('moves to the nearest wrapped copy of the tile', () => {
    const target = cameraCenteredOnTile({ ...camera, x: 2300, y: 1500 }, { ...tile, x: 100, y: 100 }, 1);
    expect(target).toEqual({ x: 2000, y: 1400 });
  });
});
