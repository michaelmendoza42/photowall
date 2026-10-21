import { describe, expect, it } from 'vitest';
import type { PhotoRecord } from '../../scanner/types.js';
import { folderMatches, matchesFilters, slicePhotoPage } from '../photos.js';

function photo(overrides: Partial<PhotoRecord>): PhotoRecord {
  return {
    id: overrides.id ?? overrides.relativePath ?? 'id',
    relativePath: overrides.relativePath ?? 'photo.jpg',
    directoryPath: overrides.directoryPath ?? '',
    filename: overrides.filename ?? 'photo.jpg',
    width: 100,
    height: 100,
    aspectRatio: 1,
    fileSize: 1024,
    mtimeMs: 0,
    year: overrides.year ?? null,
    yearSource: overrides.yearSource ?? 'none',
    ...overrides,
  };
}

const sample: PhotoRecord[] = [
  photo({
    id: 'p1',
    relativePath: '2023/birthday-leo/img_020.jpg',
    directoryPath: '2023/birthday-leo',
    filename: 'img_020.jpg',
    year: 2023,
    yearSource: 'top-level',
  }),
  photo({
    id: 'p2',
    relativePath: '2024/travel-iceland/img_010.jpg',
    directoryPath: '2024/travel-iceland',
    filename: 'img_010.jpg',
    year: 2024,
    yearSource: 'top-level',
  }),
  photo({
    id: 'p3',
    relativePath: '2024/wedding-anna/img_001.jpg',
    directoryPath: '2024/wedding-anna',
    filename: 'img_001.jpg',
    year: 2024,
    yearSource: 'top-level',
  }),
  photo({
    id: 'p4',
    relativePath: '2024/wedding-anna/img_002.jpg',
    directoryPath: '2024/wedding-anna',
    filename: 'img_002.jpg',
    year: 2024,
    yearSource: 'top-level',
  }),
  photo({
    id: 'p5',
    relativePath: '2024/wedding-anna/img_003.jpg',
    directoryPath: '2024/wedding-anna',
    filename: 'img_003.jpg',
    year: 2024,
    yearSource: 'top-level',
  }),
];

describe('folderMatches', () => {
  it('treats the empty filter as matching everything', () => {
    expect(folderMatches('anything/here', '')).toBe(true);
  });

  it('matches an exact folder path', () => {
    expect(folderMatches('2024/wedding-anna', '2024/wedding-anna')).toBe(true);
  });

  it('matches a parent folder via the segment boundary', () => {
    expect(folderMatches('2024/wedding-anna', '2024')).toBe(true);
  });

  it('does not match a similarly-named prefix without a boundary', () => {
    expect(folderMatches('2024-old-import/x', '2024')).toBe(false);
  });
});

describe('matchesFilters', () => {
  it('rejects null year when a year filter is set', () => {
    const yearless = photo({
      relativePath: 'misc/x.jpg',
      directoryPath: 'misc',
      year: null,
    });
    expect(matchesFilters(yearless, { years: [2024], folders: [], excludeFolders: [], playlistId: null })).toBe(false);
  });

  it('carves excluded nested folders out of a selected folder', () => {
    const filters = {
      years: [],
      folders: ['2024'],
      excludeFolders: ['2024/wedding-anna'],
      playlistId: null,
    };
    expect(sample.filter((p) => matchesFilters(p, filters)).map((p) => p.directoryPath))
      .not.toContain('2024/wedding-anna');
    expect(
      sample.some((p) => p.directoryPath.startsWith('2024/') && matchesFilters(p, filters)),
    ).toBe(true);
  });

  it('AND-combines year and folder filters', () => {
    const target = sample[2]!; // 2024 wedding
    expect(
      matchesFilters(target, {
        years: [2024],
        folders: ['2024/wedding-anna'],
        excludeFolders: [],
        playlistId: null,
      }),
    ).toBe(true);
    expect(
      matchesFilters(target, {
        years: [2023],
        folders: ['2024/wedding-anna'],
        excludeFolders: [],
        playlistId: null,
      }),
    ).toBe(false);
    expect(
      matchesFilters(target, {
        years: [2024],
        folders: ['2023'],
        excludeFolders: [],
        playlistId: null,
      }),
    ).toBe(false);
  });
});

describe('slicePhotoPage deterministic pagination', () => {
  it('returns the first N matches and a non-null lastTuple', () => {
    const page = slicePhotoPage({
      photos: sample,
      filters: { years: [], folders: [], excludeFolders: [], playlistId: null },
      afterRelativePath: null,
      afterId: null,
      limit: 2,
    });
    expect(page.photos.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(page.exhausted).toBe(false);
    expect(page.totalMatching).toBe(5);
    expect(page.lastTuple).toEqual({
      relativePath: '2024/travel-iceland/img_010.jpg',
      id: 'p2',
    });
  });

  it('resumes after a cursor tuple deterministically', () => {
    const firstPage = slicePhotoPage({
      photos: sample,
      filters: { years: [], folders: [], excludeFolders: [], playlistId: null },
      afterRelativePath: null,
      afterId: null,
      limit: 2,
    });
    const nextPage = slicePhotoPage({
      photos: sample,
      filters: { years: [], folders: [], excludeFolders: [], playlistId: null },
      afterRelativePath: firstPage.lastTuple!.relativePath,
      afterId: firstPage.lastTuple!.id,
      limit: 2,
    });
    expect(nextPage.photos.map((p) => p.id)).toEqual(['p3', 'p4']);

    const finalPage = slicePhotoPage({
      photos: sample,
      filters: { years: [], folders: [], excludeFolders: [], playlistId: null },
      afterRelativePath: nextPage.lastTuple!.relativePath,
      afterId: nextPage.lastTuple!.id,
      limit: 2,
    });
    expect(finalPage.photos.map((p) => p.id)).toEqual(['p5']);
    expect(finalPage.exhausted).toBe(true);
  });

  it('paging the full list page-by-page returns each photo exactly once', () => {
    const seen: string[] = [];
    let afterPath: string | null = null;
    let afterId: string | null = null;
    let safety = 100;
    while (safety-- > 0) {
      const page = slicePhotoPage({
        photos: sample,
        filters: { years: [], folders: [], excludeFolders: [], playlistId: null },
        afterRelativePath: afterPath,
        afterId,
        limit: 2,
      });
      seen.push(...page.photos.map((p) => p.id));
      if (page.exhausted || page.lastTuple === null) break;
      afterPath = page.lastTuple.relativePath;
      afterId = page.lastTuple.id;
    }
    expect(seen).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('combines year and folder filters', () => {
    const page = slicePhotoPage({
      photos: sample,
      filters: { years: [2024], folders: ['2024/wedding-anna'], excludeFolders: [], playlistId: null },
      afterRelativePath: null,
      afterId: null,
      limit: 10,
    });
    expect(page.photos.map((p) => p.id)).toEqual(['p3', 'p4', 'p5']);
    expect(page.totalMatching).toBe(3);
    expect(page.exhausted).toBe(true);
  });

  it('reports totalMatching even when limit caps the page', () => {
    const page = slicePhotoPage({
      photos: sample,
      filters: { years: [2024], folders: [], excludeFolders: [], playlistId: null },
      afterRelativePath: null,
      afterId: null,
      limit: 1,
    });
    expect(page.photos).toHaveLength(1);
    expect(page.totalMatching).toBe(4);
    expect(page.exhausted).toBe(false);
  });
});
