// Layout state contract.
//
// The real justified-row layout engine lands in phase3-task2. This file
// pins down the shape that engine will produce so the wall shell (and
// the debug overlay) can already reason about it: loaded photos, row
// list, content height, and the virtualization overscan window.

import type { PhotoQueryRecord } from '../../../shared/api/photos.js';

export interface PhotoRowPlaceholder {
  /** Row index from the top of the wall (0-based). */
  index: number;
  /** Y offset of the row top relative to the world origin, in CSS px. */
  offsetTop: number;
  /** Row height in CSS px. */
  height: number;
  /** Photos packed into this row, in left-to-right render order. */
  photoIds: string[];
}

export interface LayoutOverscan {
  /** Number of rows kept mounted above the visible window. */
  rowsAbove: number;
  /** Number of rows kept mounted below the visible window. */
  rowsBelow: number;
}

export const DEFAULT_OVERSCAN: LayoutOverscan = {
  rowsAbove: 2,
  rowsBelow: 4,
};

export interface LayoutState {
  /** All photos currently fed into the packer, in deterministic order. */
  photos: PhotoQueryRecord[];
  /** Packed rows. Empty until the layout engine runs. */
  rows: PhotoRowPlaceholder[];
  /** Sum of row heights; drives the world's vertical extent. */
  contentHeight: number;
  /** Virtualization window relative to the visible row range. */
  overscan: LayoutOverscan;
}

export const INITIAL_LAYOUT: LayoutState = {
  photos: [],
  rows: [],
  contentHeight: 0,
  overscan: DEFAULT_OVERSCAN,
};

export function withLoadedPhotos(
  state: LayoutState,
  photos: PhotoQueryRecord[],
): LayoutState {
  return { ...state, photos };
}
