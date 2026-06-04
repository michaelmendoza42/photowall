import { describe, expect, it } from 'vitest';
import type { PackedRow } from '../packer.js';
import {
  computeVisibleRowRange,
  computeWrappedAxisCopies,
  computeWrappedVisibleRowSegments,
} from '../virtualization.js';

function row(
  index: number,
  offsetTop: number,
  height: number,
): PackedRow {
  return { index, offsetTop, height, targetHeight: height, tiles: [] };
}

const ROWS: PackedRow[] = Array.from({ length: 20 }, (_, i) =>
  row(i, i * 200, 200),
);
const NO_OVERSCAN = { rowsAbove: 0, rowsBelow: 0 };

describe('computeVisibleRowRange', () => {
  it('returns an empty range for an empty row list', () => {
    expect(
      computeVisibleRowRange({
        rows: [],
        scrollTop: 0,
        viewportHeight: 800,
        overscan: NO_OVERSCAN,
      }),
    ).toEqual({ startIndex: 0, endIndex: 0 });
  });

  it('returns an empty range when viewportHeight is zero', () => {
    expect(
      computeVisibleRowRange({
        rows: ROWS,
        scrollTop: 0,
        viewportHeight: 0,
        overscan: NO_OVERSCAN,
      }),
    ).toEqual({ startIndex: 0, endIndex: 0 });
  });

  it('mounts only the rows overlapping the viewport when overscan is zero', () => {
    // viewport [0, 800) → rows 0..3 are visible (each 200 tall).
    const range = computeVisibleRowRange({
      rows: ROWS,
      scrollTop: 0,
      viewportHeight: 800,
      overscan: NO_OVERSCAN,
    });
    expect(range).toEqual({ startIndex: 0, endIndex: 4 });
  });

  it('shifts the visible range as scrollTop advances', () => {
    // viewport [500, 1300) → rows 2..6 are visible.
    const range = computeVisibleRowRange({
      rows: ROWS,
      scrollTop: 500,
      viewportHeight: 800,
      overscan: NO_OVERSCAN,
    });
    expect(range).toEqual({ startIndex: 2, endIndex: 7 });
  });

  it('applies overscan above and below the strict visible window', () => {
    const range = computeVisibleRowRange({
      rows: ROWS,
      scrollTop: 1000,
      viewportHeight: 800,
      overscan: { rowsAbove: 2, rowsBelow: 3 },
    });
    expect(range).toEqual({ startIndex: 3, endIndex: 12 });
  });

  it('clamps overscan against the row list bounds', () => {
    const range = computeVisibleRowRange({
      rows: ROWS,
      scrollTop: 0,
      viewportHeight: 400,
      overscan: { rowsAbove: 5, rowsBelow: 5 },
    });
    expect(range.startIndex).toBe(0);
    expect(range.endIndex).toBe(7);
  });

  it('mounts the trailing overscan rows when the viewport is beyond all known rows', () => {
    const range = computeVisibleRowRange({
      rows: ROWS,
      scrollTop: 5000,
      viewportHeight: 800,
      overscan: { rowsAbove: 3, rowsBelow: 3 },
    });
    expect(range.endIndex).toBe(ROWS.length);
    expect(range.startIndex).toBe(ROWS.length - 3);
  });
});

describe('computeWrappedAxisCopies', () => {
  it('returns one copy when a large world fully covers the viewport away from seams', () => {
    expect(
      computeWrappedAxisCopies({
        period: 2000,
        viewportSize: 800,
        wrappedOffset: 200,
      }),
    ).toEqual([{ copyIndex: 0, offset: -200 }]);
  });

  it('returns the seam-crossing copies needed near the wrap boundary', () => {
    expect(
      computeWrappedAxisCopies({
        period: 2000,
        viewportSize: 800,
        wrappedOffset: 1700,
      }),
    ).toEqual([
      { copyIndex: 0, offset: -1700 },
      { copyIndex: 1, offset: 300 },
    ]);
  });

  it('repeats enough copies when the world period is smaller than the viewport', () => {
    expect(
      computeWrappedAxisCopies({
        period: 300,
        viewportSize: 1000,
        wrappedOffset: 50,
      }),
    ).toEqual([
      { copyIndex: 0, offset: -50 },
      { copyIndex: 1, offset: 250 },
      { copyIndex: 2, offset: 550 },
      { copyIndex: 3, offset: 850 },
    ]);
  });
});

describe('computeWrappedVisibleRowSegments', () => {
  it('returns one segment when the wrapped viewport stays inside one world copy', () => {
    const segments = computeWrappedVisibleRowSegments({
      rows: ROWS,
      contentHeight: 4000,
      wrappedScrollTop: 500,
      viewportHeight: 800,
      overscan: NO_OVERSCAN,
    });
    expect(segments).toEqual([
      {
        copyIndex: 0,
        copyOffset: -500,
        worldTop: 500,
        viewportHeight: 800,
        startIndex: 2,
        endIndex: 7,
      },
    ]);
  });

  it('splits into two segments when the viewport crosses the bottom seam', () => {
    const segments = computeWrappedVisibleRowSegments({
      rows: ROWS,
      contentHeight: 4000,
      wrappedScrollTop: 3700,
      viewportHeight: 800,
      overscan: NO_OVERSCAN,
    });

    expect(segments).toEqual([
      {
        copyIndex: 0,
        copyOffset: -3700,
        worldTop: 3700,
        viewportHeight: 300,
        startIndex: 18,
        endIndex: 20,
      },
      {
        copyIndex: 1,
        copyOffset: 300,
        worldTop: 0,
        viewportHeight: 500,
        startIndex: 0,
        endIndex: 3,
      },
    ]);
  });

  it('repeats multiple segments when the world is shorter than the viewport', () => {
    const rows = [row(0, 0, 200), row(1, 200, 200)];
    const segments = computeWrappedVisibleRowSegments({
      rows,
      contentHeight: 400,
      wrappedScrollTop: 100,
      viewportHeight: 1000,
      overscan: NO_OVERSCAN,
    });

    expect(segments).toEqual([
      {
        copyIndex: 0,
        copyOffset: -100,
        worldTop: 100,
        viewportHeight: 300,
        startIndex: 0,
        endIndex: 2,
      },
      {
        copyIndex: 1,
        copyOffset: 300,
        worldTop: 0,
        viewportHeight: 400,
        startIndex: 0,
        endIndex: 2,
      },
      {
        copyIndex: 2,
        copyOffset: 700,
        worldTop: 0,
        viewportHeight: 300,
        startIndex: 0,
        endIndex: 2,
      },
    ]);
  });
});
