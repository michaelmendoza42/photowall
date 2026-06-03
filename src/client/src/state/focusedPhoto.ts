// Focused-photo modal state contract.
//
// Modal state is intentionally separate from camera/layout state so the
// wall keeps panning, paging, and virtualization concerns isolated from
// the open/close lifecycle of the focused-photo view. Helpers return
// the same reference when no observable change happened so React state
// setters can bail out without re-rendering the wall underneath.

import type { PhotoQueryRecord } from '../../../shared/api/photos.js';

export interface FocusedPhotoState {
  /** Currently focused photo, or `null` when the modal is closed. */
  photo: PhotoQueryRecord | null;
}

export const INITIAL_FOCUSED_PHOTO_STATE: FocusedPhotoState = { photo: null };

/** True when a photo is focused (i.e., the modal is open). */
export function isFocusedPhotoOpen(state: FocusedPhotoState): boolean {
  return state.photo !== null;
}

/**
 * Open the modal on a specific photo. Returns the same reference when
 * the same photo is already focused so re-emitting an open does not
 * churn React state.
 */
export function openFocusedPhoto(
  state: FocusedPhotoState,
  photo: PhotoQueryRecord,
): FocusedPhotoState {
  if (state.photo && state.photo.id === photo.id) return state;
  return { photo };
}

/** Close the modal. Identity-preserving when already closed. */
export function closeFocusedPhoto(state: FocusedPhotoState): FocusedPhotoState {
  if (state.photo === null) return state;
  return INITIAL_FOCUSED_PHOTO_STATE;
}
