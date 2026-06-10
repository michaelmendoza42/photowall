import { describe, expect, it } from 'vitest';
import type { PhotoQueryRecord } from '../../../../../shared/api/photos.js';
import { stableShufflePhotos } from '../shuffle.js';

function photo(id: string): PhotoQueryRecord {
  return {
    id,
    relativePath: `2024/album/${id}.jpg`,
    directoryPath: '2024/album',
    filename: `${id}.jpg`,
    width: 160,
    height: 90,
    aspectRatio: 160 / 90,
    fileSize: 1000,
    mtimeMs: 0,
    year: 2024,
    yearSource: 'top-level',
  };
}

describe('stableShufflePhotos', () => {
  const photos = [photo('a1'), photo('a2'), photo('a3'), photo('a4'), photo('a5')];

  it('returns the same shuffled order for the same album-local seed', () => {
    expect(stableShufflePhotos(photos, 'view|album-a')).toEqual(
      stableShufflePhotos(photos, 'view|album-a'),
    );
  });

  it('produces a non-source-order album-local shuffle', () => {
    expect(stableShufflePhotos(photos, 'view|album-a').map((item) => item.id)).not.toEqual(
      photos.map((item) => item.id),
    );
  });

  it('changes order when the album-local seed changes', () => {
    expect(stableShufflePhotos(photos, 'view|album-a').map((item) => item.id)).not.toEqual(
      stableShufflePhotos(photos, 'view|album-b').map((item) => item.id),
    );
  });
});
