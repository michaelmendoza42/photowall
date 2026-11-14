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

export function curationPhotoFeaturedPath(photoId: string): string {
  return `/api/curation/photos/${encodeURIComponent(photoId)}/featured`;
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
  /** The curator's defaults for the wall and photo view; viewers may override them. */
  display: WallDisplaySettings;
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
  /** Default wall spacing and photo-view frames. */
  display: WallDisplaySettings;
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

/**
 * Standard frames a photo can hang in, on a framed wall, in the photo view
 * and when featured: modern ones first, then museum classics. The client
 * draws them.
 */
export const STANDARD_FRAME_STYLES = [
  'gallery-black',
  'white-gallery',
  'natural-oak',
  'walnut',
  'shadow-box',
  'brushed-silver',
  'gilded',
  'baroque',
] as const;
/** Fancy frames: ornate museum frames with a double mat and a gilt slip. */
export const FANCY_FRAME_STYLES = ['museum-gilt', 'silver-leaf', 'carved-mahogany', 'florentine'] as const;
export const FRAME_STYLES = [...STANDARD_FRAME_STYLES, ...FANCY_FRAME_STYLES] as const;
export type FrameStyle = (typeof FRAME_STYLES)[number];
/**
 * A frame, or a random one picked again on every page load: `random` from
 * the frames the curator set random frames to come from, `random-fancy`
 * from the fancy frames.
 */
export type FrameChoice = FrameStyle | 'random' | 'random-fancy';
export const FRAME_CHOICES: readonly FrameChoice[] = [
  'random',
  ...STANDARD_FRAME_STYLES,
  'random-fancy',
  ...FANCY_FRAME_STYLES,
];

/** Which frames a `random` frame comes from. */
export const RANDOM_FRAME_POOLS = ['standard', 'fancy', 'both'] as const;
export type RandomFramePool = (typeof RANDOM_FRAME_POOLS)[number];

/** Mats inside a frame; `frame` keeps the frame style's own mat. */
export const FRAME_MATS = ['frame', 'none', 'white', 'cream', 'grey', 'black', 'linen', 'velvet'] as const;
export type FrameMat = (typeof FRAME_MATS)[number];

/** How a photo is framed on a framed wall, in the photo view, and when featured. */
export interface PhotoFrame {
  frame: FrameChoice;
  mat: FrameMat;
}

/**
 * How the wall is hung: photos edge to edge, spaced apart, or spaced
 * apart in frames.
 */
export const WALL_SPACINGS = ['none', 'spaced', 'framed'] as const;
export type WallSpacing = (typeof WALL_SPACINGS)[number];

/** The curator's defaults for how the wall and photo view look. */
export interface WallDisplaySettings {
  spacing: WallSpacing;
  /** The photo view shows each photo in its frame. */
  lightboxFrames: boolean;
  /** Which frames photos without a picked frame hang in. Curator only. */
  randomFrames: RandomFramePool;
}

export const DEFAULT_WALL_DISPLAY: WallDisplaySettings = {
  spacing: 'none',
  lightboxFrames: false,
  randomFrames: 'standard',
};

export const CURATION_DISPLAY_PATH = '/api/curation/display';

export function curationPhotoFramePath(photoId: string): string {
  return `/api/curation/photos/${encodeURIComponent(photoId)}/frame`;
}

export interface PhotoFrameRequest {
  frame: FrameChoice;
  mat: FrameMat;
}

export interface PhotoFeaturedRequest {
  featured: boolean;
  /** Replace the album's current featured photo, if it has one. */
  replace?: boolean;
  /**
   * Its frame; featuring without one keeps the current frame, or uses
   * `random` for a newly featured photo.
   */
  frame?: FrameChoice;
  /** Its mat; kept when left out. */
  mat?: FrameMat;
}

/**
 * 409 reply to featuring a photo whose album already has a featured photo
 * (without `replace`): that photo, so the curator can confirm replacing it.
 */
export interface PhotoFeaturedConflictResponse {
  error: 'featured_exists';
  current: PhotoQueryRecord;
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
  | 'share_not_found'
  | 'featured_exists'
  | 'frame_invalid'
  | 'display_invalid';

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
