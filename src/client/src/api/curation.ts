import {
  CURATION_ALBUM_DISPLAY_PATH,
  CURATION_ALBUMS_PATH,
  CURATION_DEFAULT_VIEW_PATH,
  CURATION_PIN_PATH,
  CURATION_RESCAN_PATH,
  CURATION_SESSION_PATH,
  SHARES_PATH,
  curationPhotoHidePath,
  curationPhotoRestorePath,
  curationPhotoPrivatePath,
  curationPhotoStarPath,
  shareResourcePath,
  type AlbumCurationResponse,
  type CurationSessionResponse,
  type PhotoEditResponse,
  type PhotoMoveResponse,
  type ShareCreateRequest,
  type ShareRecord,
} from '../../../shared/api/curation.js';
import { curationPhotoEditPath, type PhotoEdit } from '../../../shared/api/edits.js';
import type { PhotoQueryRecord } from '../../../shared/api/photos.js';
import { fetchJson } from './http.js';

export function fetchCurationSession(signal?: AbortSignal): Promise<CurationSessionResponse> {
  return fetchJson(CURATION_SESSION_PATH, { signal });
}

export function loginCurator(pin: string): Promise<CurationSessionResponse> {
  return fetchJson(CURATION_SESSION_PATH, { method: 'POST', body: { pin } });
}

export function chooseCuratorPin(pin: string, code: string): Promise<CurationSessionResponse> {
  return fetchJson(CURATION_PIN_PATH, { method: 'POST', body: { pin, code } });
}

export function logoutCurator(): Promise<CurationSessionResponse> {
  return fetchJson(CURATION_SESSION_PATH, { method: 'DELETE' });
}

export function fetchAlbumCuration(signal?: AbortSignal): Promise<AlbumCurationResponse> {
  return fetchJson(CURATION_ALBUMS_PATH, { signal });
}

export function setAlbumDisplay(
  folder: string,
  onDisplay: boolean,
): Promise<AlbumCurationResponse> {
  return fetchJson(CURATION_ALBUM_DISPLAY_PATH, {
    method: 'PUT',
    body: { folder, onDisplay },
  });
}

export function setDefaultView(
  folders: string[],
  starred?: boolean,
): Promise<AlbumCurationResponse> {
  return fetchJson(CURATION_DEFAULT_VIEW_PATH, { method: 'PUT', body: { folders, starred } });
}

export function setPhotoPrivate(
  photoId: string,
  isPrivate: boolean,
): Promise<{ photo: PhotoQueryRecord }> {
  return fetchJson(curationPhotoPrivatePath(photoId), {
    method: 'POST',
    body: { private: isPrivate },
  });
}

export function starPhoto(photoId: string, starred: boolean): Promise<{ photo: PhotoQueryRecord }> {
  return fetchJson(curationPhotoStarPath(photoId), { method: 'POST', body: { starred } });
}

export function hidePhoto(photoId: string): Promise<PhotoMoveResponse> {
  return fetchJson(curationPhotoHidePath(photoId), { method: 'POST', body: {} });
}

export function restorePhoto(photoId: string): Promise<PhotoMoveResponse> {
  return fetchJson(curationPhotoRestorePath(photoId), { method: 'POST', body: {} });
}

export function savePhotoEdit(photoId: string, edit: PhotoEdit): Promise<PhotoEditResponse> {
  return fetchJson(curationPhotoEditPath(photoId), { method: 'PUT', body: { edit } });
}

export function revertPhotoEdit(photoId: string): Promise<PhotoEditResponse> {
  return fetchJson(curationPhotoEditPath(photoId), { method: 'DELETE' });
}

export function rescanLibrary(): Promise<{ started: boolean }> {
  return fetchJson(CURATION_RESCAN_PATH, { method: 'POST', body: {} });
}

export function createShare(input: ShareCreateRequest): Promise<ShareRecord> {
  return fetchJson(SHARES_PATH, { method: 'POST', body: input });
}

export function fetchShare(id: string, signal?: AbortSignal): Promise<ShareRecord> {
  return fetchJson(shareResourcePath(id), { signal });
}
