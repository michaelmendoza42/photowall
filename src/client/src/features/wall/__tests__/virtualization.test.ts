import { describe, expect, it } from 'vitest';
import type { PackedRow } from '../packer.js';
import { computeVisibleRowRange } from '../virtualization.js';

function row(
  index: number,
  offsetTop: number,
  height: number,
): PackedRow {
  return { index, offsetTop, height, tiles: [] };
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
    // viewport [500, 1300) → rows 2..6 (rows 2 starts at 400, ends at 600).
    const range = computeVisibleRowRange({
      rows: ROWS,
      scrollTop: 500,
      viewportHeight: 800,
      overscan: NO_OVERSCAN,
    });
    // rows whose offsetTop+height > 500: row 2 starts at 400 ends at 600.
    // rows whose offsetTop < 1300: row 6 starts at 1200.
    // So [2, 7) inclusive of row 6.
    expect(range).toEqual({ startIndex: 2, endIndex: 7 });
  });

  it('applies overscan above and below the strict visible window', () => {
    const range = computeVisibleRowRange({
      rows: ROWS,
      scrollTop: 1000,
      viewportHeight: 800,
      overscan: { rowsAbove: 2, rowsBelow: 3 },
    });
    // strict visible: rows whose offsetTop+height>1000 and offsetTop<1800.
    // row 5 starts 1000 (excluded by `<=`), row 5 ends 1200 (>1000) → included.
    // Actually `offsetTop + height <= top` is the SKIP condition; row 4
    // ends at 1000 → 1000<=1000 → skipped. So start=5. End: row 8 starts
    // at 1600 (<1800), row 9 starts at 1800 (not <1800) → end=9.
    // After overscan: start=max(0,5-2)=3, end=min(20, 9+3)=12.
    expect(range).toEqual({ startIndex: 3, endIndex: 12 });
  });

  it('clamps overscan against the row list bounds', () => {
    const range = computeVisibleRowRange({
      rows: ROWS,
      scrollTop: 0,
      viewportHeight: 400,
      overscan: { rowsAbove: 5, rowsBelow: 5 },
    });
    // Strict [0, 2). Overscan above can't go below 0; below adds 5.
    expect(range.startIndex).toBe(0);
    expect(range.endIndex).toBe(7);
  });

  it('mounts the trailing overscan rows when the viewport is beyond all known rows', () => {
    // World content ends at row index 19 (top 3800 + height 200 = 4000).
    // Viewport at 5000 is past everything; we still keep a few rows
    // mounted so the user sees content when the next page arrives.
    const range = computeVisibleRowRange({
      rows: ROWS,
      scrollTop: 5000,
      viewportHeight: 800,
      overscan: { rowsAbove: 3, rowsBelow: 3 },
    });
    expect(range.endIndex).toBe(ROWS.length);
    expect(range.startIndex).toBe(ROWS.length - 3);
  });

  it('keeps the mounted DOM bounded relative to viewport size', () => {
    const range = computeVisibleRowRange({
      rows: ROWS,
      scrollTop: 1000,
      viewportHeight: 800,
      overscan: { rowsAbove: 2, rowsBelow: 4 },
    });
    const mounted = range.endIndex - range.startIndex;
    // Visible window covers ~4 rows (each 200 tall, viewport 800).
    // Plus 2 above and 4 below overscan → at most ~10 rows mounted.
    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThanOrEqual(12);
  });
});
