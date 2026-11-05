import { describe, expect, it } from 'vitest';
import type { LibraryFacetsResponse } from '../../../../../shared/api/library.js';
import type { PhotoQueryRecord, ResolvedPhotoFilters } from '../../../../../shared/api/photos.js';
import {
  buildWallLayout,
  deriveGroupedCameraTarget,
  deriveGroupedWallFoundation,
} from '../groupedWall.js';

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

describe('deriveGroupedWallFoundation', () => {
  it('stays in single mode when only one album is derived', () => {
    const foundation = deriveGroupedWallFoundation({
      filters: filters({ folders: ['2024/a'] }),
      facets: FACETS,
      photos: [photo('a1', '2024/a')],
      snapshotId: 'snap-1',
      worldWidth: 1200,
    });

    expect(foundation.mode).toBe('single');
    expect(foundation.albums).toEqual([]);
  });

  it('shuffles album-local photo order deterministically per view', () => {
    const photos = [
      photo('a1', '2024/a'),
      photo('a2', '2024/a'),
      photo('a3', '2024/a'),
      photo('b1', '2024/b'),
      photo('b2', '2024/b'),
    ];

    const first = deriveGroupedWallFoundation({
      filters: filters({ folders: ['2024/a', '2024/b'] }),
      facets: FACETS,
      photos,
      snapshotId: 'snap-1',
      worldWidth: 1200,
    });
    const second = deriveGroupedWallFoundation({
      filters: filters({ folders: ['2024/a', '2024/b'] }),
      facets: FACETS,
      photos,
      snapshotId: 'snap-1',
      worldWidth: 1200,
    });

    expect(first.mode).toBe('grouped');
    expect(second).toEqual(first);

    if (first.mode === 'grouped') {
      const albumA = first.albums.find((album) => album.area.albumKey === 'folder:2024/a');
      expect(albumA?.photos.map((item) => item.id)).not.toEqual(['a1', 'a2', 'a3']);
    }
  });

  it('derives an initial grouped camera target near the topmost album area', () => {
    const photos = [
      photo('a1', '2024/a'),
      photo('a2', '2024/a'),
      photo('b1', '2024/b'),
      photo('b2', '2024/b'),
    ];

    const foundation = deriveGroupedWallFoundation({
      filters: filters({ folders: ['2024/a', '2024/b'] }),
      facets: FACETS,
      photos,
      snapshotId: 'snap-1',
      worldWidth: 1200,
    });

    const target = deriveGroupedCameraTarget({
      foundation,
      viewportWidth: 1000,
      viewportHeight: 600,
    });

    expect(foundation.mode).toBe('grouped');
    expect(target).not.toBeNull();
    expect(target?.x).toBeGreaterThanOrEqual(0);
    expect(target?.y).toBeGreaterThanOrEqual(0);
  });

  it('builds the runtime wall layout through the grouped path for multi-album views', () => {
    const photos = [
      photo('a1', '2024/a'),
      photo('a2', '2024/a'),
      photo('b1', '2024/b'),
      photo('b2', '2024/b'),
    ];

    const foundation = deriveGroupedWallFoundation({
      filters: filters({ folders: ['2024/a', '2024/b'] }),
      facets: FACETS,
      photos,
      snapshotId: 'snap-1',
      worldWidth: 1200,
    });

    const layout = buildWallLayout({
      photos,
      hasMore: false,
      foundation,
      options: {
        worldWidth: 1200,
        maxRowHeight: 460,
        columnWidthFactors: [1.22, 0.82, 1.08, 0.76, 1.12],
        tileScale: 0.75,
      },
    });

    expect(foundation.mode).toBe('grouped');
    expect(layout.packedPhotoCount).toBe(4);
    expect(layout.contentHeight).toBeGreaterThan(0);
    expect(layout.rows.length).toBeGreaterThan(0);
  });
});
