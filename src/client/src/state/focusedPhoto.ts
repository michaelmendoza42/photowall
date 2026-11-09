// Focused-photo state contract.
//
// Focused-view state is intentionally separate from camera/layout state so the
// wall keeps panning, paging, and virtualization concerns isolated from
// the open/close lifecycle of the focused-photo view. Helpers return
// the same reference when no observable change happened so React state
// setters can bail out without re-rendering the wall underneath.

import type { PhotoQueryRecord } from '../../../shared/api/photos.js';

export interface FocusedPhotoState {
  /** Currently focused photo, or `null` when the focused view is closed. */
  photo: PhotoQueryRecord | null;
}

export const INITIAL_FOCUSED_PHOTO_STATE: FocusedPhotoState = {
  photo: null,
};

/** True when a photo is focused (i.e., the focused view is open). */
export function isFocusedPhotoOpen(state: FocusedPhotoState): boolean {
  return state.photo !== null;
}

/**
 * Open the focused view on a specific photo. Returns the same reference
 * when the same photo is already focused so re-emitting an open does
 * not churn React state.
 */
export function openFocusedPhoto(
  state: FocusedPhotoState,
  photo: PhotoQueryRecord,
): FocusedPhotoState {
  if (state.photo && state.photo.id === photo.id) {
    return state;
  }
  return { photo };
}

/** Close the focused view. Identity-preserving when already closed. */
export function closeFocusedPhoto(state: FocusedPhotoState): FocusedPhotoState {
  if (state.photo === null) return state;
  return INITIAL_FOCUSED_PHOTO_STATE;
}

/**
 * Show a changed copy of the focused photo (starred, made private,
 * edited). Leaves the state alone when a different photo is open.
 */
export function updateFocusedPhoto(
  state: FocusedPhotoState,
  photo: PhotoQueryRecord,
): FocusedPhotoState {
  return state.photo?.id === photo.id ? { photo } : state;
}
