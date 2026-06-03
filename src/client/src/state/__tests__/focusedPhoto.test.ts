import { describe, expect, it } from 'vitest';
import {
  INITIAL_FOCUSED_PHOTO_STATE,
  closeFocusedPhoto,
  isFocusedPhotoOpen,
  openFocusedPhoto,
} from '../focusedPhoto.js';
import type { PhotoQueryRecord } from '../../../../shared/api/photos.js';

function makePhoto(id: string): PhotoQueryRecord {
  return {
    id,
    relativePath: `${id}.jpg`,
    directoryPath: '',
    filename: `${id}.jpg`,
    width: 1600,
    height: 1200,
    aspectRatio: 1600 / 1200,
    fileSize: 1024,
    mtimeMs: 0,
    year: null,
    yearSource: 'none',
  };
}

const PHOTO_A = makePhoto('a');
const PHOTO_B = makePhoto('b');

describe('focused-photo state contract', () => {
  it('starts closed with no focused photo', () => {
    expect(INITIAL_FOCUSED_PHOTO_STATE.photo).toBeNull();
    expect(isFocusedPhotoOpen(INITIAL_FOCUSED_PHOTO_STATE)).toBe(false);
  });

  it('open transitions to the focused photo', () => {
    const next = openFocusedPhoto(INITIAL_FOCUSED_PHOTO_STATE, PHOTO_A);
    expect(next.photo).toBe(PHOTO_A);
    expect(isFocusedPhotoOpen(next)).toBe(true);
  });

  it('open is identity-preserving when the same photo is already focused', () => {
    const opened = openFocusedPhoto(INITIAL_FOCUSED_PHOTO_STATE, PHOTO_A);
    const reopened = openFocusedPhoto(opened, PHOTO_A);
    expect(reopened).toBe(opened);
  });

  it('open switches focus when a different photo is requested', () => {
    const opened = openFocusedPhoto(INITIAL_FOCUSED_PHOTO_STATE, PHOTO_A);
    const next = openFocusedPhoto(opened, PHOTO_B);
    expect(next).not.toBe(opened);
    expect(next.photo).toBe(PHOTO_B);
  });

  it('close clears the focused photo', () => {
    const opened = openFocusedPhoto(INITIAL_FOCUSED_PHOTO_STATE, PHOTO_A);
    const closed = closeFocusedPhoto(opened);
    expect(closed.photo).toBeNull();
    expect(isFocusedPhotoOpen(closed)).toBe(false);
  });

  it('close is identity-preserving when already closed', () => {
    const closed = closeFocusedPhoto(INITIAL_FOCUSED_PHOTO_STATE);
    expect(closed).toBe(INITIAL_FOCUSED_PHOTO_STATE);
  });
});
