import { describe, expect, it } from 'vitest';
import { DEFAULT_OVERSCAN, INITIAL_LAYOUT } from '../layout.js';

describe('layout state contract', () => {
  it('initialises with an empty packer and zero content height', () => {
    expect(INITIAL_LAYOUT.photos).toEqual([]);
    expect(INITIAL_LAYOUT.rows).toEqual([]);
    expect(INITIAL_LAYOUT.contentHeight).toBe(0);
  });

  it('exposes default overscan rows above and below the visible window', () => {
    expect(DEFAULT_OVERSCAN.rowsAbove).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_OVERSCAN.rowsBelow).toBeGreaterThanOrEqual(
      DEFAULT_OVERSCAN.rowsAbove,
    );
  });

  it('exposes the same overscan object on the initial layout', () => {
    expect(INITIAL_LAYOUT.overscan).toBe(DEFAULT_OVERSCAN);
  });
});
