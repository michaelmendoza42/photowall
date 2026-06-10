import { describe, expect, it } from 'vitest';
import {
  buildPixiSceneSprites,
  FAR_ZOOM_MAX,
  NEAR_ZOOM_MIN,
  selectPixiSceneVariant,
} from '../pixiScene.js';

describe('selectPixiSceneVariant', () => {
  it('uses thumb at far zoom', () => {
    expect(selectPixiSceneVariant(FAR_ZOOM_MAX)).toBe('thumb');
    expect(selectPixiSceneVariant(0.5)).toBe('thumb');
  });

  it('uses wall in the middle zoom band', () => {
    expect(selectPixiSceneVariant(1)).toBe('wall');
  });

  it('uses modal at near zoom', () => {
    expect(selectPixiSceneVariant(NEAR_ZOOM_MIN)).toBe('modal');
    expect(selectPixiSceneVariant(2.2)).toBe('modal');
  });
});

describe('buildPixiSceneSprites', () => {
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
    );

    expect(sprites).toEqual([
      {
        key: 'a',
        x: 40,
        y: 150,
        width: 200,
        height: 150,
        photoId: 'photo-1',
        src: '/api/media/photo-1?variant=wall&format=webp',
        variant: 'wall',
        sourceWidth: 1600,
        sourceHeight: 900,
      },
      {
        key: 'b',
        x: 10,
        y: 325,
        width: 90,
        height: 60,
        photoId: 'photo-2',
        src: '/api/media/photo-2?variant=wall&format=webp',
        variant: 'wall',
        sourceWidth: null,
        sourceHeight: null,
      },
    ]);
  });
});
