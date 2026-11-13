import {
  CURATION_ALBUM_DISPLAY_PATH,
  CURATION_ALBUMS_PATH,
  CURATION_DEFAULT_VIEW_PATH,
  CURATION_VIP_PIN_PATH,
  CURATION_PIN_PATH,
  CURATION_RESCAN_PATH,
  CURATION_SESSION_PATH,
  SHARES_PATH,
  curationPhotoFeaturedPath,
  curationPhotoHidePath,
  curationPhotoRestorePath,
  curationPhotoPrivatePath,
  curationPhotoStarPath,
  shareResourcePath,
  type AlbumCurationResponse,
  type FrameChoice,
  type FrameMat,
  type WallDisplaySettings,
  CURATION_DISPLAY_PATH,
  curationPhotoFramePath,
  type CurationSessionResponse,
  type PhotoEditResponse,
  type PhotoMoveResponse,
  type ShareCreateRequest,
  type ShareRecord,
} from '../../../shared/api/curation.js';
import {
  curationPhotoCameraPath,
  curationPhotoEditPath,
  type PhotoCameraResponse,
  type PhotoEdit,
} from '../../../shared/api/edits.js';
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

export function setVipPin(pin: string): Promise<CurationSessionResponse> {
  return fetchJson(CURATION_VIP_PIN_PATH, { method: 'PUT', body: { pin } });
}

export function clearVipPin(): Promise<CurationSessionResponse> {
  return fetchJson(CURATION_VIP_PIN_PATH, { method: 'DELETE' });
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

/**
 * Feature or unfeature a photo. Featuring a photo whose album already has
 * one fails with a 409 ApiError whose body is a
 * PhotoFeaturedConflictResponse, unless `replace` is set.
 */
export function setPhotoFeatured(
  photoId: string,
  featured: boolean,
  replace = false,
  frame?: FrameChoice,
  mat?: FrameMat,
): Promise<{ photo: PhotoQueryRecord }> {
  return fetchJson(curationPhotoFeaturedPath(photoId), {
    method: 'POST',
    body: { featured, replace, ...(frame ? { frame } : {}), ...(mat ? { mat } : {}) },
  });
}

/** Pick a photo's frame and mat; random with the frame's own mat clears the pick. */
export function setPhotoFrame(
  photoId: string,
  frame: FrameChoice,
  mat: FrameMat,
): Promise<{ photo: PhotoQueryRecord }> {
  return fetchJson(curationPhotoFramePath(photoId), { method: 'POST', body: { frame, mat } });
}

/** The curator's defaults for wall spacing and photo-view frames. */
export function setDisplayDefaults(
  display: Partial<WallDisplaySettings>,
): Promise<AlbumCurationResponse> {
  return fetchJson(CURATION_DISPLAY_PATH, { method: 'PUT', body: display });
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

export function fetchPhotoCamera(photoId: string): Promise<PhotoCameraResponse> {
  return fetchJson(curationPhotoCameraPath(photoId));
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
