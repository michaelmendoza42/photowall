import { describe, expect, it } from 'vitest';
import {
  coverCropFrame,
  buildPixiSceneSprites,
  FAR_ZOOM_MAX,
  largestOnScreenVariant,
  selectTileVariant,
  type PixiSceneView,
} from '../pixiScene.js';

const VIEW: PixiSceneView = { width: 1000, height: 800, pixelRatio: 1 };

describe('selectTileVariant', () => {
  const tile = { onScreen: true, sourceLongEdge: 6000 };

  it('keeps the overview on thumbnails regardless of tile size', () => {
    expect(selectTileVariant({ ...tile, zoom: FAR_ZOOM_MAX, displayLongEdge: 3000 })).toBe('thumb');
    expect(selectTileVariant({ ...tile, zoom: 0.6, displayLongEdge: 3000 })).toBe('thumb');
  });

  it('keeps a featured hero tile screen-sharp even on the zoomed-out overview', () => {
    expect(
      selectTileVariant({ ...tile, zoom: FAR_ZOOM_MAX, displayLongEdge: 1500, featured: true }),
    ).toBe('modal');
    expect(selectTileVariant({ ...tile, zoom: 0.6, displayLongEdge: 700, featured: true })).toBe(
      'wall',
    );
    expect(
      selectTileVariant({ ...tile, zoom: 0.6, onScreen: false, displayLongEdge: 700, featured: true }),
    ).toBe('thumb');
  });

  it('picks the smallest tier covering the drawn size once zoomed in', () => {
    expect(selectTileVariant({ ...tile, zoom: 1.5, displayLongEdge: 500 })).toBe('thumb');
    expect(selectTileVariant({ ...tile, zoom: 1.5, displayLongEdge: 700 })).toBe('wall');
    expect(selectTileVariant({ ...tile, zoom: 1.5, displayLongEdge: 1500 })).toBe('modal');
    expect(selectTileVariant({ ...tile, zoom: 2.4, displayLongEdge: 3300 })).toBe('detail');
    expect(selectTileVariant({ ...tile, zoom: 2.4, displayLongEdge: 9000 })).toBe('detail');
  });

  it('tolerates slight upscaling before stepping up a tier', () => {
    expect(selectTileVariant({ ...tile, zoom: 2, displayLongEdge: 1900 })).toBe('modal');
    expect(selectTileVariant({ ...tile, zoom: 2, displayLongEdge: 2000 })).toBe('detail');
  });

  it('never asks for more pixels than the source has', () => {
    expect(
      selectTileVariant({ zoom: 2.4, onScreen: true, displayLongEdge: 3300, sourceLongEdge: 1200 }),
    ).toBe('modal');
    expect(
      selectTileVariant({ zoom: 2.4, onScreen: true, displayLongEdge: 3300, sourceLongEdge: 120 }),
    ).toBe('thumb');
  });

  it('leaves off-screen tiles on thumbnails', () => {
    expect(
      selectTileVariant({ zoom: 2.4, onScreen: false, displayLongEdge: 3300, sourceLongEdge: 6000 }),
    ).toBe('thumb');
  });
});

describe('buildPixiSceneSprites', () => {
  it('hangs a featured hero tile in its frame, with the photo inside uncropped', () => {
    const tile = {
      key: 'hero',
      rowOffsetTop: 100,
      x: 40,
      y: 20,
      width: 1200,
      height: 700,
      photoId: 'hero',
      sourceWidth: 6000,
      sourceHeight: 3000,
      featured: true,
      frame: 'walnut' as const,
    };
    const [sprite] = buildPixiSceneSprites([tile], 1, VIEW);
    expect(sprite!.frame).toEqual({ x: 40, y: 120, width: 1200, height: 700, style: 'walnut' });
    // The photo keeps its 2:1 shape inside the frame.
    expect(sprite!.width / sprite!.height).toBeCloseTo(2, 6);
    expect(sprite!.x).toBeGreaterThan(40);
    expect(sprite!.y).toBeGreaterThan(120);
    expect(sprite!.x + sprite!.width).toBeLessThan(40 + 1200);
    expect(sprite!.y + sprite!.height).toBeLessThan(120 + 700);
    const [plain] = buildPixiSceneSprites([{ ...tile, frame: undefined }], 1, VIEW);
    expect(plain!.frame).toBeUndefined();
    expect(plain!.width).toBe(1200);
  });

  it('converts row-local wall tiles into absolute sprite descriptors', () => {
    const sprites = buildPixiSceneSprites(
      [
        {
          key: 'a',
          rowOffsetTop: 120,
          x: 40,
          y: 30,
          width: 200,
          height: 150,
          photoId: 'photo-1',
          sourceWidth: 1600,
          sourceHeight: 900,
          sourceMtimeMs: 1234,
        },
        {
          key: 'b',
          rowOffsetTop: 320,
          x: 10,
          y: 5,
          width: 90,
          height: 60,
          photoId: 'photo-2',
        },
      ],
      1,
      VIEW,
    );

    expect(sprites).toEqual([
      {
        key: 'a',
        x: 40,
        y: 150,
        width: 200,
        height: 150,
        photoId: 'photo-1',
        src: '/api/media/photo-1?variant=thumb&format=webp&v=1234',
        variant: 'thumb',
        sourceWidth: 1600,
        sourceHeight: 900,
        onScreen: true,
        priority: expect.any(Number),
      },
      {
        key: 'b',
        x: 10,
        y: 325,
        width: 90,
        height: 60,
        photoId: 'photo-2',
        src: '/api/media/photo-2?variant=thumb&format=webp',
        variant: 'thumb',
        sourceWidth: null,
        sourceHeight: null,
        onScreen: true,
        priority: expect.any(Number),
      },
    ]);
  });

  it('uses a custom media source resolver when provided', () => {
    const sprites = buildPixiSceneSprites(
      [
        {
          key: 'custom',
          rowOffsetTop: 8,
          x: 12,
          y: 4,
          width: 120,
          height: 80,
          photoId: 'custom:photo-7',
          sourceWidth: 900,
          sourceHeight: 600,
        },
      ],
      2,
      { ...VIEW, pixelRatio: 3 },
      ({ photo, variant }) =>
        `data:image/svg+xml,${encodeURIComponent(`${photo.id}:${variant}:${photo.width}x${photo.height}`)}`,
    );

    expect(sprites).toEqual([
      expect.objectContaining({
        key: 'custom',
        y: 12,
        variant: 'modal',
        src: 'data:image/svg+xml,custom%3Aphoto-7%3Amodal%3A900x600',
      }),
    ]);
  });

  it('sizes tiers by drawn device pixels and loads on-screen tiles nearest the center first', () => {
    const base = { rowOffsetTop: 0, y: 0, width: 400, height: 300, sourceWidth: 4000, sourceHeight: 3000 };
    const sprites = buildPixiSceneSprites(
      [
        { ...base, key: 'center', photoId: 'c', x: 50 },
        { ...base, key: 'edge', photoId: 'e', x: -150 },
        { ...base, key: 'offscreen', photoId: 'o', x: 600 },
      ],
      2,
      { ...VIEW, pixelRatio: 2 },
    );
    const byKey = new Map(sprites.map((sprite) => [sprite.key, sprite]));

    // 400 world px × zoom 2 × DPR 2 = 1600 device px.
    expect(byKey.get('center')).toMatchObject({ onScreen: true, variant: 'modal' });
    expect(byKey.get('edge')).toMatchObject({ onScreen: true, variant: 'modal' });
    expect(byKey.get('offscreen')).toMatchObject({ onScreen: false, variant: 'thumb' });
    expect(byKey.get('center')!.priority).toBeGreaterThan(byKey.get('edge')!.priority);
    expect(byKey.get('edge')!.priority).toBeGreaterThan(byKey.get('offscreen')!.priority);
    expect(largestOnScreenVariant(sprites)).toBe('modal');
  });
});

describe('coverCropFrame', () => {
  it('crops the sides of a wide photo shown in a taller tile, keeping its aspect ratio', () => {
    const frame = coverCropFrame({ width: 3000, height: 2000 }, { width: 300, height: 300 });
    expect(frame).toEqual({ x: 500, y: 0, width: 2000, height: 2000 });
  });

  it('crops top and bottom of a tall photo shown in a wider tile', () => {
    const frame = coverCropFrame({ width: 2000, height: 3000 }, { width: 400, height: 300 });
    expect(frame.x).toBe(0);
    expect(frame.width).toBe(2000);
    expect(frame.height).toBeCloseTo(1500, 6);
    expect(frame.y).toBeCloseTo(750, 6);
  });

  it('uses the whole image when the shapes already match', () => {
    expect(coverCropFrame({ width: 1600, height: 1200 }, { width: 400, height: 300 })).toEqual({
      x: 0, y: 0, width: 1600, height: 1200,
    });
  });

  it('always matches the tile shape so the photo is never stretched', () => {
    for (const [tw, th] of [[300, 520], [610, 290], [455, 455]] as const) {
      const frame = coverCropFrame({ width: 4000, height: 6000 }, { width: tw, height: th });
      expect(frame.width / frame.height).toBeCloseTo(tw / th, 6);
    }
  });
});
