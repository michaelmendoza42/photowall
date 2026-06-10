import { describe, expect, it } from 'vitest';
import type { GroupedWallFoundation } from '../groupedWall.js';
import { shouldLoadNextGroupedCompletenessPage } from '../groupedLoading.js';

const GROUPED_FOUNDATION: GroupedWallFoundation = {
  mode: 'grouped',
  viewKey: 'snap-1|years=|folders=2024/a,2024/b|playlist=none',
  estimatedWorldHeight: 1200,
  albums: [
    {
      area: {
        albumKey: 'folder:2024/a',
        kind: 'folder',
        label: 'a',
        sourcePath: '2024/a',
        year: 2024,
        photoCountEstimate: 3,
        anchorX: 300,
        anchorY: 260,
        footprintWidth: 320,
        footprintHeight: 260,
        shuffleSeed: 'shuffle-a',
        placementSeed: 'place-a',
      },
      photos: [
        {
          id: 'a1',
          relativePath: '2024/a/a1.jpg',
          directoryPath: '2024/a',
          filename: 'a1.jpg',
          width: 160,
          height: 90,
          aspectRatio: 160 / 90,
          fileSize: 1000,
          mtimeMs: 0,
          year: 2024,
          yearSource: 'top-level',
        },
      ],
    },
    {
      area: {
        albumKey: 'folder:2024/b',
        kind: 'folder',
        label: 'b',
        sourcePath: '2024/b',
        year: 2024,
        photoCountEstimate: 3,
        anchorX: 900,
        anchorY: 420,
        footprintWidth: 320,
        footprintHeight: 260,
        shuffleSeed: 'shuffle-b',
        placementSeed: 'place-b',
      },
      photos: [],
    },
  ],
};

describe('shouldLoadNextGroupedCompletenessPage', () => {
  it('returns false for non-grouped foundations', () => {
    expect(
      shouldLoadNextGroupedCompletenessPage({
        foundation: {
          mode: 'single',
          viewKey: 'single',
          estimatedWorldHeight: 0,
          albums: [],
        },
        loadedPhotoCount: 1,
        hasNextPage: true,
        isFetchingNextPage: false,
      }),
    ).toBe(false);
  });

  it('returns false until the first page has yielded some photos', () => {
    expect(
      shouldLoadNextGroupedCompletenessPage({
        foundation: GROUPED_FOUNDATION,
        loadedPhotoCount: 0,
        hasNextPage: true,
        isFetchingNextPage: false,
      }),
    ).toBe(false);
  });

  it('returns false when pagination is exhausted or already fetching', () => {
    expect(
      shouldLoadNextGroupedCompletenessPage({
        foundation: GROUPED_FOUNDATION,
        loadedPhotoCount: 1,
        hasNextPage: false,
        isFetchingNextPage: false,
      }),
    ).toBe(false);

    expect(
      shouldLoadNextGroupedCompletenessPage({
        foundation: GROUPED_FOUNDATION,
        loadedPhotoCount: 1,
        hasNextPage: true,
        isFetchingNextPage: true,
      }),
    ).toBe(false);
  });

  it('returns true when a grouped view still has an empty selected album', () => {
    expect(
      shouldLoadNextGroupedCompletenessPage({
        foundation: GROUPED_FOUNDATION,
        loadedPhotoCount: 1,
        hasNextPage: true,
        isFetchingNextPage: false,
      }),
    ).toBe(true);
  });

  it('returns false once every selected grouped album has photos', () => {
    expect(
      shouldLoadNextGroupedCompletenessPage({
        foundation: {
          ...GROUPED_FOUNDATION,
          albums: GROUPED_FOUNDATION.albums.map((album) => ({
            ...album,
            photos: album.photos.length > 0 ? album.photos : [
              {
                id: 'b1',
                relativePath: '2024/b/b1.jpg',
                directoryPath: '2024/b',
                filename: 'b1.jpg',
                width: 120,
                height: 80,
                aspectRatio: 120 / 80,
                fileSize: 1000,
                mtimeMs: 0,
                year: 2024,
                yearSource: 'top-level',
              },
            ],
          })),
        },
        loadedPhotoCount: 2,
        hasNextPage: true,
        isFetchingNextPage: false,
      }),
    ).toBe(false);
  });
});
