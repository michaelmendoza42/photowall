import { describe, expect, it } from 'vitest';
import { parseWallSpot } from '../wallSpot.js';

describe('parseWallSpot', () => {
  it('reads a saved spot', () => {
    expect(
      parseWallSpot(JSON.stringify({ photoId: 'a/b.jpg', zoom: 1.5, focusedPhotoId: 'a/c.jpg' })),
    ).toEqual({ photoId: 'a/b.jpg', zoom: 1.5, focusedPhotoId: 'a/c.jpg' });
  });

  it('keeps the spot but drops a bad zoom or focused photo', () => {
    expect(parseWallSpot(JSON.stringify({ photoId: 'a', zoom: -1, focusedPhotoId: 3 }))).toEqual({
      photoId: 'a',
      zoom: null,
      focusedPhotoId: null,
    });
  });

  it('ignores missing or broken data', () => {
    expect(parseWallSpot(null)).toBeNull();
    expect(parseWallSpot('{')).toBeNull();
    expect(parseWallSpot(JSON.stringify({ zoom: 2 }))).toBeNull();
    expect(parseWallSpot('"a"')).toBeNull();
  });
});
