import type { PhotoQueryRecord } from '../../../../../../shared/api/photos.js';

/** Deterministic, metadata-only library used to prove viewport work stays bounded. */
export function createLargeAlbumFixture(count: number): PhotoQueryRecord[] {
  return Array.from({ length: count }, (_, index) => {
    const width = 1200 + ((index * 37) % 900);
    const height = 800 + ((index * 53) % 700);
    const id = `large-album-${String(index).padStart(5, '0')}`;
    return {
      id,
      relativePath: `2024/large-album/${id}.jpg`,
      directoryPath: '2024/large-album',
      filename: `${id}.jpg`,
      width,
      height,
      aspectRatio: width / height,
      fileSize: 1_000_000 + index,
      mtimeMs: 1_700_000_000_000 + index,
      year: 2024,
      yearSource: 'top-level',
    };
  });
}
