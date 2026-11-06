// Curation and share-link contracts.
//
// Curation is the curator-only side of the wall: hiding photos (which
// moves them into a `_hidden` folder beside them), putting albums in or
// out of storage, and choosing the default view viewers see before they
// pick albums themselves. Share links are open to everyone.

import type { PhotoQueryRecord } from './photos.js';

/** Name of the folder a hidden photo is moved into, inside its album. */
export const HIDDEN_FOLDER_NAME = '_hidden';

export const CURATION_SESSION_PATH = '/api/curation/session';
/** Choose the curator PIN, allowed only while none exists. */
export const CURATION_PIN_PATH = '/api/curation/pin';
/** Set (PUT) or turn off (DELETE) the VIP PIN that authorizes guests. */
export const CURATION_VIP_PIN_PATH = '/api/curation/vip-pin';
export const CURATION_ALBUMS_PATH = '/api/curation/albums';
export const CURATION_ALBUM_DISPLAY_PATH = '/api/curation/albums/display';
export const CURATION_DEFAULT_VIEW_PATH = '/api/curation/albums/default';
export const CURATION_RESCAN_PATH = '/api/curation/rescan';
export const SHARES_PATH = '/api/shares';

export function curationPhotoHidePath(photoId: string): string {
  return `/api/curation/photos/${encodeURIComponent(photoId)}/hide`;
}

export function curationPhotoRestorePath(photoId: string): string {
  return `/api/curation/photos/${encodeURIComponent(photoId)}/restore`;
}

export function curationPhotoStarPath(photoId: string): string {
  return `/api/curation/photos/${encodeURIComponent(photoId)}/star`;
}

export function curationPhotoPrivatePath(photoId: string): string {
  return `/api/curation/photos/${encodeURIComponent(photoId)}/private`;
}

export function shareResourcePath(id: string): string {
  return `${SHARES_PATH}/${encodeURIComponent(id)}`;
}

/**
 * A forward-slash, root-relative folder path ('' is the library root),
 * with no `.` or `..` segments.
 */
export const FOLDER_PATH_PATTERN = /^(?!(?:.*\/)?\.\.?(?:\/|$))([^/]+(\/[^/]+)*)?$/u;

/**
 * Request header a curator sends to see the wall as a guest would. It
 * changes only which photos come back, never what the curator may do.
 */
export const VIEW_AS_HEADER = 'x-photo-wall-view';
export const VIEW_AS_GUEST = 'guest';

/** Query parameter a share link uses on the wall's own URL. */
export const SHARE_URL_PARAM = 's';

export interface CurationSessionResponse {
  /** Curation is on once the server has a curator PIN (from env or chosen on /curate). */
  enabled: boolean;
  /** This browser holds a curator session. */
  curator: boolean;
  /** This browser entered the VIP PIN: an authorized guest, who sees private photos. */
  vip: boolean;
  /** A VIP PIN is set. Told only to the curator; false for everyone else. */
  vipPinSet: boolean;
  /** The server may move photos inside the library (hide/restore). */
  libraryWrites: boolean;
}

export interface CurationLoginRequest {
  pin: string;
}

export interface VipPinRequest {
  pin: string;
}

export interface AlbumCurationResponse {
  /** Folders whose own photos viewers can see. Everything else is in storage. */
  onDisplay: string[];
  /** Folders a viewer's wall shows before they pick albums. */
  defaultView: string[];
  /** The Starred album is part of the default view. */
  defaultStarred: boolean;
}

export interface AlbumDisplayUpdateRequest {
  /** The folder to change, together with every folder beneath it. */
  folder: string;
  onDisplay: boolean;
}

export interface DefaultViewUpdateRequest {
  folders: string[];
  /** Include the Starred album; unchanged when left out. */
  starred?: boolean;
}

export interface PhotoStarRequest {
  starred: boolean;
}

export interface PhotoPrivateRequest {
  private: boolean;
}

export interface PhotoMoveResponse {
  /** The photo at its new location (its id changes with its path). */
  photo: PhotoQueryRecord;
  snapshotId: string;
}

export interface PhotoEditResponse {
  /** The photo as everyone now sees it (edited size and recipe). */
  photo: PhotoQueryRecord;
}

export type CurationErrorCode =
  | 'curation_disabled'
  | 'curator_required'
  | 'pin_invalid'
  | 'pin_already_set'
  | 'vip_pin_invalid'
  | 'setup_code_invalid'
  | 'library_writes_disabled'
  | 'photo_not_found'
  | 'photo_not_hidden'
  | 'photo_already_hidden'
  | 'destination_exists'
  | 'cross_device'
  | 'move_failed'
  | 'folder_invalid'
  | 'edit_invalid'
  | 'share_invalid'
  | 'share_not_found';

export interface CurationErrorResponse {
  error: CurationErrorCode;
  detail?: string;
}

export interface ShareCreateRequest {
  folders: string[];
  excludeFolders: string[];
  /** Photo the wall centers on when the link opens. */
  anchorPhotoId: string | null;
  zoom: number | null;
  /** The view includes the Starred album. */
  starred?: boolean;
}

export interface ShareRecord extends ShareCreateRequest {
  id: string;
  createdAt: string;
}

/**
 * Segment depth of the deepest `_hidden` folder on `directoryPath`
 * (`a/_hidden` is 2), or -1 when the path is not inside one.
 */
export function hiddenFolderDepth(directoryPath: string): number {
  if (directoryPath === '') return -1;
  const segments = directoryPath.split('/');
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i] === HIDDEN_FOLDER_NAME) return i + 1;
  }
  return -1;
}

export function isInHiddenFolder(directoryPath: string): boolean {
  return hiddenFolderDepth(directoryPath) >= 0;
}
