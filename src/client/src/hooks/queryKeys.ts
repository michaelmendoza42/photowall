import type { PhotosQueryFilters } from '../../../shared/api/photos.js';

// Centralised query-key namespace. Keeping these stable lets the wall
// invalidate only the affected slice (e.g. photo pages for a filter
// change) without nuking the rest of the cache.
export const queryKeys = {
  libraryStatus: ['library', 'status'] as const,
  libraryFacets: ['library', 'facets'] as const,
  playlists: ['playlists'] as const,
  photoPage: (filters: PhotosQueryFilters, cursor: string | null) =>
    [
      'photos',
      'page',
      {
        years: [...(filters.years ?? [])].sort((a, b) => a - b),
        folders: [...(filters.folders ?? [])].sort(),
        playlistId: filters.playlistId ?? null,
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
        playlistId: filters.playlistId ?? null,
        limit,
      },
    ] as const,
} as const;
