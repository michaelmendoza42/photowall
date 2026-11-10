import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  AlbumCurationResponse,
  CurationSessionResponse,
  FeaturedFrameChoice,
} from '../../../shared/api/curation.js';
import {
  chooseCuratorPin,
  clearVipPin,
  fetchAlbumCuration,
  fetchCurationSession,
  hidePhoto,
  loginCurator,
  logoutCurator,
  rescanLibrary,
  restorePhoto,
  revertPhotoEdit,
  savePhotoEdit,
  setAlbumDisplay,
  setDefaultView,
  setVipPin,
  setPhotoPrivate,
  starPhoto,
  setPhotoFeatured,
} from '../api/curation.js';
import type { PhotoEdit } from '../../../shared/api/edits.js';
import { queryKeys } from './queryKeys.js';

export function useCurationSession(): UseQueryResult<CurationSessionResponse> {
  return useQuery({
    queryKey: queryKeys.curationSession,
    queryFn: ({ signal }) => fetchCurationSession(signal),
    staleTime: 60_000,
  });
}

export function useAlbumCuration(enabled: boolean): UseQueryResult<AlbumCurationResponse> {
  return useQuery({
    queryKey: queryKeys.curationAlbums,
    queryFn: ({ signal }) => fetchAlbumCuration(signal),
    enabled,
    staleTime: 30_000,
  });
}

/** What the wall shows depends on who is looking and what is on display. */
function refreshWall(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ['photos'] });
  void qc.invalidateQueries({ queryKey: queryKeys.libraryFacets });
}

export function useCuratorLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pin: string) => loginCurator(pin),
    onSuccess: (session) => {
      qc.setQueryData(queryKeys.curationSession, session);
      refreshWall(qc);
    },
  });
}

export function useChooseCuratorPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { pin: string; code: string }) => chooseCuratorPin(input.pin, input.code),
    onSuccess: (session) => {
      qc.setQueryData(queryKeys.curationSession, session);
      refreshWall(qc);
    },
  });
}

export function useCuratorLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => logoutCurator(),
    onSuccess: (session) => {
      qc.setQueryData(queryKeys.curationSession, session);
      qc.removeQueries({ queryKey: queryKeys.curationAlbums });
      refreshWall(qc);
    },
  });
}

/** Set, change or turn off the VIP PIN; old authorized browsers are signed out. */
export function useSetVipPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pin: string) => setVipPin(pin),
    onSuccess: (session) => qc.setQueryData(queryKeys.curationSession, session),
  });
}

export function useClearVipPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => clearVipPin(),
    onSuccess: (session) => qc.setQueryData(queryKeys.curationSession, session),
  });
}

export function useSetAlbumDisplay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { folder: string; onDisplay: boolean }) =>
      setAlbumDisplay(input.folder, input.onDisplay),
    onSuccess: (albums) => {
      qc.setQueryData(queryKeys.curationAlbums, albums);
      // A curator previewing as a guest sees the change on the wall.
      refreshWall(qc);
    },
  });
}

export function useSetDefaultView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { folders: string[]; starred?: boolean }) =>
      setDefaultView(input.folders, input.starred),
    onSuccess: (albums) => {
      qc.setQueryData(queryKeys.curationAlbums, albums);
      refreshWall(qc);
    },
  });
}

export function useMovePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { photoId: string; action: 'hide' | 'restore' }) =>
      input.action === 'hide' ? hidePhoto(input.photoId) : restorePhoto(input.photoId),
    onSuccess: () => refreshWall(qc),
  });
}

/** Save or revert a light edit; the wall reloads to pick up its new size. */
export function usePhotoEdit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { photoId: string; edit: PhotoEdit | null }) =>
      input.edit ? savePhotoEdit(input.photoId, input.edit) : revertPhotoEdit(input.photoId),
    onSuccess: () => refreshWall(qc),
  });
}

export function useStarPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { photoId: string; starred: boolean }) =>
      starPhoto(input.photoId, input.starred),
    onSuccess: () => refreshWall(qc),
  });
}

export function useSetPhotoFeatured() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      photoId: string;
      featured: boolean;
      replace?: boolean;
      frame?: FeaturedFrameChoice;
    }) => setPhotoFeatured(input.photoId, input.featured, input.replace, input.frame),
    onSuccess: () => refreshWall(qc),
  });
}

export function useSetPhotoPrivate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { photoId: string; private: boolean }) =>
      setPhotoPrivate(input.photoId, input.private),
    onSuccess: () => refreshWall(qc),
  });
}

export function useRescanLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => rescanLibrary(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.libraryStatus }),
  });
}
