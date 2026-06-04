import { describe, expect, it } from 'vitest';
import { shouldLoadNextPage } from '../dynamicLoading.js';

const BASE = {
  travelY: 0,
  viewportHeight: 800,
  contentHeight: 3000,
  thresholdPx: 600,
  isFetchingNext: false,
  hasNextPage: true,
};

describe('shouldLoadNextPage', () => {
  it('returns false while a previous fetch is in flight', () => {
    expect(shouldLoadNextPage({ ...BASE, isFetchingNext: true })).toBe(false);
  });

  it('returns false when there are no more pages', () => {
    expect(shouldLoadNextPage({ ...BASE, hasNextPage: false })).toBe(false);
  });

  it('returns false when viewportHeight is zero', () => {
    expect(shouldLoadNextPage({ ...BASE, viewportHeight: 0 })).toBe(false);
  });

  it('returns true when the loaded content does not yet fill the viewport+threshold (initial-load priming)', () => {
    // contentHeight 400 < viewport 800 → remaining is negative,
    // which is well below the threshold.
    expect(
      shouldLoadNextPage({
        ...BASE,
        travelY: 0,
        viewportHeight: 800,
        contentHeight: 400,
      }),
    ).toBe(true);
  });

  it('returns false when there is still plenty of content below the viewport', () => {
    // travel=0, viewport=800, content=3000 → remaining = 2200 > 600.
    expect(shouldLoadNextPage(BASE)).toBe(false);
  });

  it('returns true once absolute downward travel approaches the frontier within the threshold', () => {
    // travel=1800, viewport=800 → bottom=2600, content=3000.
    // remaining=400, threshold=600 → load.
    expect(
      shouldLoadNextPage({ ...BASE, travelY: 1800 }),
    ).toBe(true);
  });

  it('returns true exactly at the threshold boundary', () => {
    // remaining = 3000 - (1600 + 800) = 600, threshold = 600 → load.
    expect(
      shouldLoadNextPage({ ...BASE, travelY: 1600 }),
    ).toBe(true);
  });

  it('returns true when travel moves past the loaded frontier', () => {
    expect(
      shouldLoadNextPage({ ...BASE, travelY: 5000 }),
    ).toBe(true);
  });

  it('does not depend on wrapped render position after upward loops', () => {
    // Still negative absolute travel even if the wrapped render position
    // would land near the bottom of the wall.
    expect(
      shouldLoadNextPage({ ...BASE, travelY: -1200 }),
    ).toBe(false);
  });
});
