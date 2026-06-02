import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { PlaylistListResponse } from '../../../shared/api/playlists.js';
import { fetchPlaylists } from '../api/playlists.js';
import { queryKeys } from './queryKeys.js';

export function usePlaylists(): UseQueryResult<PlaylistListResponse> {
  return useQuery({
    queryKey: queryKeys.playlists,
    queryFn: ({ signal }) => fetchPlaylists(signal),
    staleTime: 60_000,
  });
}
