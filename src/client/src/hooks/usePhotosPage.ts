import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type {
  PhotosQueryFilters,
  PhotosQueryResponse,
} from '../../../shared/api/photos.js';
import { fetchPhotosPage } from '../api/photos.js';
import { queryKeys } from './queryKeys.js';

export interface UsePhotosPageOptions {
  filters: PhotosQueryFilters;
  cursor?: string | null;
  limit?: number;
  enabled?: boolean;
}

/**
 * First-page (or arbitrary-cursor) photo query.
 *
 * Phase 3 only needs the first page wired for the shell to prove backend
 * data is reaching the UI. Later tasks layer cursor pagination on top
 * using this same hook signature.
 */
export function usePhotosPage(
  options: UsePhotosPageOptions,
): UseQueryResult<PhotosQueryResponse> {
  const cursor = options.cursor ?? null;
  return useQuery({
    queryKey: queryKeys.photoPage(options.filters, cursor),
    queryFn: ({ signal }) =>
      fetchPhotosPage(
        {
          filters: options.filters,
          cursor,
          ...(options.limit !== undefined ? { limit: options.limit } : {}),
        },
        signal,
      ),
    enabled: options.enabled ?? true,
    staleTime: 5_000,
  });
}
