// Infinite photo-page query hook.
//
// The wall consumes the paginated `/api/photos` endpoint as the camera
// approaches the loaded frontier. TanStack's `useInfiniteQuery` already
// owns the pagination state machine: it tracks page params, dedupes
// in-flight fetches, exposes `hasNextPage`/`isFetchingNextPage`, and
// flattens results across pages.

import {
  useInfiniteQuery,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';
import type {
  PhotosQueryFilters,
  PhotosQueryResponse,
  PhotosQuerySuccessResponse,
} from '../../../shared/api/photos.js';
import { PHOTOS_PAGE_DEFAULT_LIMIT } from '../../../shared/api/photos.js';
import { fetchPhotosPage } from '../api/photos.js';
import { queryKeys } from './queryKeys.js';

export interface UseInfinitePhotosOptions {
  filters: PhotosQueryFilters;
  limit?: number;
  enabled?: boolean;
  /** A curator previewing the wall as a guest. */
  viewAsGuest?: boolean;
}

export type InfinitePhotosResult = UseInfiniteQueryResult<
  { pages: PhotosQueryResponse[]; pageParams: (string | null)[] },
  Error
>;

export function useInfinitePhotos(
  options: UseInfinitePhotosOptions,
): InfinitePhotosResult {
  const limit = options.limit ?? PHOTOS_PAGE_DEFAULT_LIMIT;
  return useInfiniteQuery({
    queryKey: [...queryKeys.photoPages(options.filters, limit), options.viewAsGuest ? 'guest' : 'own'],
    queryFn: ({ pageParam, signal }) =>
      fetchPhotosPage(
        {
          filters: options.filters,
          cursor: pageParam,
          limit,
        },
        signal,
        options.viewAsGuest ?? false,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: PhotosQueryResponse) => {
      if ('error' in lastPage) return undefined;
      return lastPage.nextCursor ?? undefined;
    },
    enabled: options.enabled ?? true,
    staleTime: 5_000,
  });
}

/**
 * Filter a page list down to successful pages only. Subsequent pages
 * may return a `snapshot_changed` error response when the snapshot
 * rolls during pagination; mixing that into the wall's photo array
 * would mean rendering pre-rotation rows against post-rotation media
 * urls. The wall instead resets when it detects this case.
 */
export function flattenPhotoPages(
  pages: readonly PhotosQueryResponse[] | undefined,
): PhotosQuerySuccessResponse[] {
  if (!pages) return [];
  const out: PhotosQuerySuccessResponse[] = [];
  for (const page of pages) {
    if ('error' in page) break;
    out.push(page);
  }
  return out;
}
