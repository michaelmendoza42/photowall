import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  PlaylistCreateRequest,
  PlaylistListResponse,
  PlaylistRecord,
  PlaylistUpdateRequest,
} from '../../../shared/api/playlists.js';
import {
  createPlaylist,
  deletePlaylist,
  fetchPlaylists,
  updatePlaylist,
} from '../api/playlists.js';
import { queryKeys } from './queryKeys.js';

export function usePlaylists(): UseQueryResult<PlaylistListResponse> {
  return useQuery({
    queryKey: queryKeys.playlists,
    queryFn: ({ signal }) => fetchPlaylists(signal),
    staleTime: 60_000,
  });
}

export function useCreatePlaylist(): UseMutationResult<
  PlaylistRecord,
  Error,
  PlaylistCreateRequest
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PlaylistCreateRequest) => createPlaylist(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.playlists });
    },
  });
}

export interface UpdatePlaylistInput {
  id: string;
  patch: PlaylistUpdateRequest;
}

export function useUpdatePlaylist(): UseMutationResult<
  PlaylistRecord,
  Error,
  UpdatePlaylistInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdatePlaylistInput) =>
      updatePlaylist(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.playlists });
    },
  });
}

export function useDeletePlaylist(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePlaylist(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.playlists });
    },
  });
}
