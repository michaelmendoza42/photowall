import { describe, expect, it } from 'vitest';
import type { LibraryFacetsResponse } from '../../../../../shared/api/library.js';
import type { PhotoQueryRecord, ResolvedPhotoFilters } from '../../../../../shared/api/photos.js';
import { deriveActiveAlbumAreaCount } from '../activeAlbumAreaCount.js';

function photo(id: string, directoryPath: string, year = 2024): PhotoQueryRecord {
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
    year,
    yearSource: 'top-level',
  };
}

const FACETS: LibraryFacetsResponse = {
  schemaVersion: 1,
  snapshotId: 'snap-1',
  scannedAt: '2026-06-04T00:00:00.000Z',
  years: [{ year: 2024, photoCount: 6 }],
  folders: [
    { path: '', depth: 0, directPhotoCount: 0, photoCount: 6 },
    { path: '2024', depth: 1, directPhotoCount: 0, photoCount: 6 },
    { path: '2024/a', depth: 2, directPhotoCount: 3, photoCount: 3 },
    { path: '2024/b', depth: 2, directPhotoCount: 3, photoCount: 3 },
  ],
};

function filters(partial: Partial<ResolvedPhotoFilters>): ResolvedPhotoFilters {
  return {
    years: [],
    folders: [],
    excludeFolders: [],
    ...partial,
  };
}

describe('deriveActiveAlbumAreaCount', () => {
  it('returns 1 for the default wall', () => {
    expect(
      deriveActiveAlbumAreaCount({
        filters: filters({}),
        facets: FACETS,
        photos: [photo('a1', '2024/a')],
        snapshotId: 'snap-1',
        worldWidth: 1200,
      }),
    ).toBe(1);
  });

  it('keeps a single-folder context as one album area', () => {
    expect(
      deriveActiveAlbumAreaCount({
        filters: filters({ folders: ['2024/a'] }),
        facets: FACETS,
        photos: [photo('a1', '2024/a')],
        snapshotId: 'snap-1',
        worldWidth: 1200,
      }),
    ).toBe(1);
  });

  it('returns multiple areas for a year-wide multi-album context', () => {
    expect(
      deriveActiveAlbumAreaCount({
        filters: filters({ years: [2024] }),
        facets: FACETS,
        photos: [photo('a1', '2024/a'), photo('b1', '2024/b')],
        snapshotId: 'snap-1',
        worldWidth: 1200,
      }),
    ).toBe(2);
  });

  it('returns multiple areas for a multi-album shared selection', () => {
    expect(
      deriveActiveAlbumAreaCount({
        filters: filters({
          folders: ['2024/a', '2024/b'],
          excludeFolders: [],
        }),
        facets: FACETS,
        photos: [photo('a1', '2024/a'), photo('b1', '2024/b')],
        snapshotId: 'snap-1',
        worldWidth: 1200,
      }),
    ).toBe(2);
  });

  it('stays conservative for year filters until facets are available', () => {
    expect(
      deriveActiveAlbumAreaCount({
        filters: filters({ years: [2024] }),
        facets: null,
        photos: [photo('a1', '2024/a')],
        snapshotId: 'snap-1',
        worldWidth: 1200,
      }),
    ).toBe(2);
  });
});
