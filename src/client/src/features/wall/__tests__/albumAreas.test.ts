import { describe, expect, it } from 'vitest';
import type { LibraryFacetsResponse } from '../../../../../shared/api/library.js';
import type { PhotoQueryRecord, ResolvedPhotoFilters } from '../../../../../shared/api/photos.js';
import {
  bucketPhotosByAlbum,
  deriveAlbumAreas,
  resolvePhotoAlbumKey,
} from '../albumAreas.js';

function photo(
  id: string,
  directoryPath: string,
  year = 2024,
): PhotoQueryRecord {
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
  years: [{ year: 2024, photoCount: 9 }],
  folders: [
    { path: '', depth: 0, directPhotoCount: 0, photoCount: 9 },
    { path: '2024', depth: 1, directPhotoCount: 1, photoCount: 9 },
    { path: '2024/trip', depth: 2, directPhotoCount: 4, photoCount: 4 },
    { path: '2024/family', depth: 2, directPhotoCount: 3, photoCount: 3 },
    { path: '2024/trip/day-1', depth: 3, directPhotoCount: 2, photoCount: 2 },
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

describe('deriveAlbumAreas', () => {
  it('derives one album per selected folder and stays in grouped mode only when more than one album exists', () => {
    const areas = deriveAlbumAreas({
      filters: filters({ folders: ['2024/trip', '2024/family'] }),
      facets: FACETS,
      photos: [],
      snapshotId: 'snap-1',
      worldWidth: 1200,
    });

    expect(areas.grouped).toBe(true);
    expect(areas.albums.map((album) => album.albumKey)).toEqual([
      'folder:2024/family',
      'folder:2024/trip',
    ]);
  });

  it('derives immediate child albums for a selected year and adds a synthetic year-root bucket when needed', () => {
    const areas = deriveAlbumAreas({
      filters: filters({ years: [2024] }),
      facets: FACETS,
      photos: [photo('root', '2024')],
      snapshotId: 'snap-1',
      worldWidth: 1200,
    });

    expect(areas.grouped).toBe(true);
    expect(areas.albums.map((album) => album.albumKey)).toEqual([
      'folder:2024/family',
      'folder:2024/trip',
      'year-root:2024',
    ]);
  });

  it('produces stable anchor placement for the same view inputs', () => {
    const first = deriveAlbumAreas({
      filters: filters({ folders: ['2024/trip', '2024/family'] }),
      facets: FACETS,
      photos: [],
      snapshotId: 'snap-1',
      worldWidth: 1200,
    });
    const second = deriveAlbumAreas({
      filters: filters({ folders: ['2024/trip', '2024/family'] }),
      facets: FACETS,
      photos: [],
      snapshotId: 'snap-1',
      worldWidth: 1200,
    });

    expect(second).toEqual(first);
  });

  it('resolves overlapping selected folders to the most specific selected album', () => {
    const areas = deriveAlbumAreas({
      filters: filters({ folders: ['2024/trip', '2024/trip/day-1'] }),
      facets: FACETS,
      photos: [],
      snapshotId: 'snap-1',
      worldWidth: 1200,
    });

    expect(
      resolvePhotoAlbumKey(photo('nested', '2024/trip/day-1'), areas.albums),
    ).toBe('folder:2024/trip/day-1');
    expect(
      resolvePhotoAlbumKey(photo('base', '2024/trip'), areas.albums),
    ).toBe('folder:2024/trip');
  });

  it('expands a selected top-level folder into one area per child album', () => {
    const areas = deriveAlbumAreas({
      filters: filters({ folders: ['2024'] }),
      facets: FACETS,
      photos: [],
      snapshotId: 'snap-1',
      worldWidth: 1200,
    });

    expect(areas.grouped).toBe(true);
    expect(areas.albums.map((album) => album.albumKey).sort()).toEqual([
      'folder:2024',
      'folder:2024/family',
      'folder:2024/trip',
    ]);
    expect(
      resolvePhotoAlbumKey(photo('nested', '2024/trip/day-1'), areas.albums),
    ).toBe('folder:2024/trip');
  });

  it('leaves deselected nested folders out of the album areas', () => {
    const areas = deriveAlbumAreas({
      filters: filters({
        folders: ['2024'],
        excludeFolders: ['2024/family', '2024/trip/day-1'],
      }),
      facets: FACETS,
      photos: [],
      snapshotId: 'snap-1',
      worldWidth: 1200,
    });

    expect(areas.albums.map((album) => album.albumKey).sort()).toEqual([
      'folder:2024',
      'folder:2024/trip',
    ]);
    expect(
      areas.albums.find((album) => album.albumKey === 'folder:2024/trip')?.photoCountEstimate,
    ).toBe(4);
  });

  it('buckets photos by derived album key', () => {
    const photos = [
      photo('trip-a', '2024/trip'),
      photo('trip-b', '2024/trip/day-1'),
      photo('family-a', '2024/family'),
    ];
    const areas = deriveAlbumAreas({
      filters: filters({ folders: ['2024/trip', '2024/family'] }),
      facets: FACETS,
      photos,
      snapshotId: 'snap-1',
      worldWidth: 1200,
    });

    const buckets = bucketPhotosByAlbum(photos, areas.albums);
    expect((buckets.get('folder:2024/trip') ?? []).map((item) => item.id)).toEqual([
      'trip-a',
      'trip-b',
    ]);
    expect((buckets.get('folder:2024/family') ?? []).map((item) => item.id)).toEqual([
      'family-a',
    ]);
  });
});

describe('the Starred album area', () => {
  const starred = (p: PhotoQueryRecord): PhotoQueryRecord => ({ ...p, starred: true });

  it('is the only area when only Starred is picked, so the wall stays single', () => {
    const areas = deriveAlbumAreas({
      filters: filters({ starred: true }),
      facets: FACETS,
      photos: [starred(photo('a', '2024/trip')), starred(photo('b', '2024/family'))],
      snapshotId: 'snap-1',
      worldWidth: 1200,
    });
    expect(areas.albums.map((album) => album.albumKey)).toEqual(['starred']);
    expect(areas.grouped).toBe(false);
  });

  it('holds starred photos no picked album covers', () => {
    const inTrip = starred(photo('a', '2024/trip'));
    const fromFamily = starred(photo('b', '2024/family'));
    const plain = photo('c', '2024/trip');
    const areas = deriveAlbumAreas({
      filters: filters({ folders: ['2024/trip'], starred: true }),
      facets: FACETS,
      photos: [inTrip, fromFamily, plain],
      snapshotId: 'snap-1',
      worldWidth: 1200,
    });
    expect(areas.grouped).toBe(true);
    expect(resolvePhotoAlbumKey(inTrip, areas.albums)).toBe('folder:2024/trip');
    expect(resolvePhotoAlbumKey(fromFamily, areas.albums)).toBe('starred');
    expect(bucketPhotosByAlbum([inTrip, fromFamily, plain], areas.albums).get('starred')).toEqual([
      fromFamily,
    ]);
  });
});
