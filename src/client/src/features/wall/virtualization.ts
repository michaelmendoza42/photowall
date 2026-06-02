// Row virtualization math.
//
// The wall mounts only the rows currently visible (plus a small
// overscan buffer above and below) so the DOM size stays bounded
// regardless of how many photos the library holds. This module is the
// pure decision function — given the row geometry and the current
// scroll/camera offset, return the index range that should be mounted.

import type { PackedRow } from './packer.js';
import type { LayoutOverscan } from '../../state/layout.js';

export interface VisibleRange {
  /** Inclusive start index. */
  startIndex: number;
  /** Exclusive end index. */
  endIndex: number;
}

export interface VisibleRangeInput {
  rows: readonly PackedRow[];
  scrollTop: number;
  viewportHeight: number;
  overscan: LayoutOverscan;
}

const EMPTY_RANGE: VisibleRange = { startIndex: 0, endIndex: 0 };

/**
 * Compute the [start, end) row index range that should be mounted.
 *
 * The visible window is `[scrollTop, scrollTop + viewportHeight)` in
 * world coordinates. A row is visible when its vertical interval
 * `[offsetTop, offsetTop + height)` overlaps the visible window.
 * `overscan.rowsAbove` and `overscan.rowsBelow` extend the mounted
 * range outside the strict visible window so a scroll/pan does not
 * paint blank space before the next render mounts the new rows.
 *
 * Rows are assumed to be vertically sorted by `offsetTop` (the packer
 * always emits them this way). The scan is linear; row counts in the
 * MVP stay small enough that a binary search would be premature.
 */
export function computeVisibleRowRange(
  input: VisibleRangeInput,
): VisibleRange {
  const { rows, scrollTop, viewportHeight, overscan } = input;
  if (rows.length === 0 || viewportHeight <= 0) return EMPTY_RANGE;

  const top = Math.max(0, scrollTop);
  const bottom = top + viewportHeight;

  let start = 0;
  while (
    start < rows.length &&
    rows[start]!.offsetTop + rows[start]!.height <= top
  ) {
    start++;
  }
  if (start === rows.length) {
    // The viewport is below all known rows — nothing visible yet, but
    // mount the trailing overscan so the user sees content when the
    // next page lands.
    const startIndex = Math.max(0, rows.length - overscan.rowsAbove);
    return { startIndex, endIndex: rows.length };
  }

  let end = start;
  while (end < rows.length && rows[end]!.offsetTop < bottom) {
    end++;
  }

  return {
    startIndex: Math.max(0, start - overscan.rowsAbove),
    endIndex: Math.min(rows.length, end + overscan.rowsBelow),
  };
}
