import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type {
  LibraryFacetsResponse,
  LibraryStatusResponse,
} from '../../../shared/api/library.js';
import { fetchLibraryFacets, fetchLibraryStatus } from '../api/library.js';
import { queryKeys } from './queryKeys.js';

const STATUS_REFETCH_MS = 5_000;

export function useLibraryStatus(): UseQueryResult<LibraryStatusResponse> {
  return useQuery({
    queryKey: queryKeys.libraryStatus,
    queryFn: ({ signal }) => fetchLibraryStatus(signal),
    // Status is the "is the backend alive and what does it know" probe
    // for the shell. A short refetch interval keeps the empty/error
    // states honest if the scanner finishes after the page loaded.
    refetchInterval: STATUS_REFETCH_MS,
    refetchIntervalInBackground: false,
    staleTime: 1_000,
  });
}

export function useLibraryFacets(
  enabled = true,
): UseQueryResult<LibraryFacetsResponse> {
  return useQuery({
    queryKey: queryKeys.libraryFacets,
    queryFn: ({ signal }) => fetchLibraryFacets(signal),
    enabled,
    staleTime: 30_000,
  });
}
