import { describe, expect, it } from 'vitest';
import type { AlbumAreaDescriptor } from '../albumAreas.js';
import type { PhotoQueryRecord } from '../../../../../shared/api/photos.js';
import { packGroupedAlbums } from '../groupedPacker.js';
import { stableShufflePhotos } from '../shuffle.js';

function photo(id: string, directoryPath: string): PhotoQueryRecord {
  return {
    id,
    relativePath: `${directoryPath}/${id}.jpg`,
    directoryPath,
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

function area(albumKey: string, anchorX: number, anchorY: number): AlbumAreaDescriptor {
  return {
    albumKey,
    kind: 'folder',
    label: albumKey,
    sourcePath: albumKey.replace('folder:', ''),
    year: 2024,
    photoCountEstimate: 4,
    anchorX,
    anchorY,
    footprintWidth: 360,
    footprintHeight: 280,
    shuffleSeed: `shuffle:${albumKey}`,
    placementSeed: `placement:${albumKey}`,
  };
}

const OPTIONS = {
  worldWidth: 1200,
  maxRowHeight: 460,
  columnWidthFactors: [1.22, 0.82, 1.08, 0.76, 1.12],
  tileScale: 0.75,
} as const;

describe('packGroupedAlbums', () => {
  it('computes one explicit global content height from placed album envelopes', () => {
    const result = packGroupedAlbums(
      [
        {
          area: area('folder:2024/a', 260, 260),
          photos: stableShufflePhotos([
            photo('a1', '2024/a'),
            photo('a2', '2024/a'),
          ], 'a'),
        },
        {
          area: area('folder:2024/b', 860, 540),
          photos: stableShufflePhotos([
            photo('b1', '2024/b'),
            photo('b2', '2024/b'),
          ], 'b'),
        },
      ],
      OPTIONS,
    );

    expect(result.packedPhotoCount).toBe(4);
    expect(result.bounds.maxY).toBe(result.contentHeight);
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it('keeps already-packed grouped tiles stable when more photos append to an album', () => {
    const basePhotos = stableShufflePhotos([
      photo('a1', '2024/a'),
      photo('a2', '2024/a'),
      photo('a3', '2024/a'),
    ], 'seed:a');
    const morePhotos = stableShufflePhotos([
      ...basePhotos,
      photo('a4', '2024/a'),
      photo('a5', '2024/a'),
    ], 'seed:a');

    const before = packGroupedAlbums(
      [{ area: area('folder:2024/a', 260, 260), photos: basePhotos }],
      OPTIONS,
    );
    const after = packGroupedAlbums(
      [{ area: area('folder:2024/a', 260, 260), photos: morePhotos }],
      OPTIONS,
    );

    expect(after.tiles.slice(0, before.tiles.length)).toEqual(before.tiles);
  });
});
