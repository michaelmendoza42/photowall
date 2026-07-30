// Row virtualization + wrap math.
//
// The wall mounts only the rows currently visible (plus a small
// overscan buffer above and below) so the DOM size stays bounded even
// while the camera loops across wrap seams. This module keeps the pure
// geometry helpers isolated from React.

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

export interface WrappedAxisCopy {
  /** Sequential copy index in the current viewport slice. */
  copyIndex: number;
  /** Pixel offset where this world copy starts inside the viewport. */
  offset: number;
}

export interface WrappedAxisCopyInput {
  period: number;
  viewportSize: number;
  /** Wrapped offset inside `[0, period)`. */
  wrappedOffset: number;
}

export interface WrappedVisibleRowSegmentsInput {
  rows: readonly PackedRow[];
  contentHeight: number;
  wrappedScrollTop: number;
  viewportHeight: number;
  overscan: LayoutOverscan;
}

export interface WrappedVisibleRowSegment extends VisibleRange {
  /** Vertical world-copy ordinal in the current viewport slice. */
  copyIndex: number;
  /** Pixel offset where this copy's world origin lands in the viewport. */
  copyOffset: number;
  /** Segment top inside the underlying world copy. */
  worldTop: number;
  /** Visible segment height for this specific copy. */
  viewportHeight: number;
}

const EMPTY_RANGE: VisibleRange = { startIndex: 0, endIndex: 0 };

/**
 * Compute the [start, end) row index range that should be mounted.
 *
 * The visible window is `[scrollTop, scrollTop + viewportHeight)` in
 * world coordinates. A row is visible when its vertical interval
 * `[offsetTop, offsetTop + height)` overlaps the visible window.
 * `overscan.rowsAbove` and `overscan.rowsBelow` extend the mounted
 * range outside the strict visible window so a pan does not paint blank
 * space before the next render mounts the new rows.
 */
export function computeVisibleRowRange(
  input: VisibleRangeInput,
): VisibleRange {
  const { rows, scrollTop, viewportHeight, overscan } = input;
  if (rows.length === 0 || viewportHeight <= 0) return EMPTY_RANGE;

  const top = Math.max(0, scrollTop);
  const bottom = top + viewportHeight;

  const start = firstRowEndingAfter(rows, top);
  if (start === rows.length) {
    const startIndex = Math.max(0, rows.length - overscan.rowsAbove);
    return { startIndex, endIndex: rows.length };
  }

  const end = firstRowStartingAtOrAfter(rows, bottom, start);

  return {
    startIndex: Math.max(0, start - overscan.rowsAbove),
    endIndex: Math.min(rows.length, end + overscan.rowsBelow),
  };
}

function firstRowEndingAfter(rows: readonly PackedRow[], top: number): number {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    const row = rows[mid]!;
    if (row.offsetTop + row.height <= top) low = mid + 1;
    else high = mid;
  }
  return low;
}

function firstRowStartingAtOrAfter(
  rows: readonly PackedRow[],
  bottom: number,
  low = 0,
): number {
  let high = rows.length;
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (rows[mid]!.offsetTop < bottom) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * Compute the repeated world-copy offsets needed to fill one viewport
 * axis when the camera is near a wrap seam or when the world period is
 * smaller than the viewport itself.
 */
export function computeWrappedAxisCopies(
  input: WrappedAxisCopyInput,
): WrappedAxisCopy[] {
  const { period, viewportSize, wrappedOffset } = input;
  if (period <= 0 || viewportSize <= 0) return [];

  const normalizedOffset = normalizeWrappedOffset(wrappedOffset, period);
  const copies: WrappedAxisCopy[] = [];
  let offset = -normalizedOffset;
  let copyIndex = 0;

  while (offset < viewportSize) {
    copies.push({ copyIndex, offset });
    offset += period;
    copyIndex += 1;
  }

  return copies;
}

/**
 * Split the viewport into one or more vertical wrapped segments, then
 * compute the mounted row range for each segment independently.
 */
export function computeWrappedVisibleRowSegments(
  input: WrappedVisibleRowSegmentsInput,
): WrappedVisibleRowSegment[] {
  const {
    rows,
    contentHeight,
    wrappedScrollTop,
    viewportHeight,
    overscan,
  } = input;

  if (rows.length === 0 || contentHeight <= 0 || viewportHeight <= 0) {
    return [];
  }

  const copies = computeWrappedAxisCopies({
    period: contentHeight,
    viewportSize: viewportHeight,
    wrappedOffset: wrappedScrollTop,
  });

  return copies.flatMap((copy) => {
    const visibleTop = Math.max(0, copy.offset);
    const visibleBottom = Math.min(viewportHeight, copy.offset + contentHeight);
    const segmentHeight = visibleBottom - visibleTop;
    if (segmentHeight <= 0) return [];

    const worldTop = visibleTop - copy.offset;
    const range = computeVisibleRowRange({
      rows,
      scrollTop: worldTop,
      viewportHeight: segmentHeight,
      overscan,
    });

    if (range.startIndex === range.endIndex) return [];

    return [{
      copyIndex: copy.copyIndex,
      copyOffset: copy.offset,
      worldTop,
      viewportHeight: segmentHeight,
      startIndex: range.startIndex,
      endIndex: range.endIndex,
    }];
  });
}

function normalizeWrappedOffset(value: number, period: number): number {
  if (!Number.isFinite(value) || period <= 0) return 0;
  const wrapped = value % period;
  return wrapped < 0 ? wrapped + period : wrapped;
}
