// Layout state contract.
//
// The justified-row layout engine itself lives in `features/wall/packer.ts`.
// This module exposes the snapshot shape the shell and debug overlay
// reason about: loaded photos, packed-row summary, content height, and
// the virtualization overscan window.

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
  /**
   * Packed rows. The full geometry lives inside the wall canvas; this
   * field captures only the count summary the debug overlay needs.
   */
  rows: readonly unknown[];
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
