import type { PhotosQueryFilters } from '../../../shared/api/photos.js';

// Centralised query-key namespace. Keeping these stable lets the wall
// invalidate only the affected slice (e.g. photo pages for a filter
// change) without nuking the rest of the cache.
export const queryKeys = {
  libraryStatus: ['library', 'status'] as const,
  libraryFacets: ['library', 'facets'] as const,
  curationSession: ['curation', 'session'] as const,
  curationAlbums: ['curation', 'albums'] as const,
  // Only the retired playlist files still use this; drop it with them.
  playlists: ['playlists'] as const,
  photoPage: (filters: PhotosQueryFilters, cursor: string | null) =>
    [
      'photos',
      'page',
      {
        years: [...(filters.years ?? [])].sort((a, b) => a - b),
        folders: [...(filters.folders ?? [])].sort(),
        excludeFolders: [...(filters.excludeFolders ?? [])].sort(),
        starred: filters.starred === true,
        cursor,
      },
    ] as const,
  photoPages: (filters: PhotosQueryFilters, limit: number) =>
    [
      'photos',
      'pages',
      {
        years: [...(filters.years ?? [])].sort((a, b) => a - b),
        folders: [...(filters.folders ?? [])].sort(),
        excludeFolders: [...(filters.excludeFolders ?? [])].sort(),
        starred: filters.starred === true,
        limit,
      },
    ] as const,
} as const;
