import { describe, expect, it } from 'vitest';
import { shouldLoadNextPage } from '../dynamicLoading.js';

const BASE = {
  scrollTop: 0,
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
        scrollTop: 0,
        viewportHeight: 800,
        contentHeight: 400,
      }),
    ).toBe(true);
  });

  it('returns false when there is still plenty of content below the viewport', () => {
    // scroll=0, viewport=800, content=3000 → remaining = 2200 > 600.
    expect(shouldLoadNextPage(BASE)).toBe(false);
  });

  it('returns true once the viewport approaches the frontier within the threshold', () => {
    // scroll=1800, viewport=800 → bottom=2600, content=3000.
    // remaining=400, threshold=600 → load.
    expect(
      shouldLoadNextPage({ ...BASE, scrollTop: 1800 }),
    ).toBe(true);
  });

  it('returns true exactly at the threshold boundary', () => {
    // remaining = 3000 - (1600 + 800) = 600, threshold = 600 → load.
    expect(
      shouldLoadNextPage({ ...BASE, scrollTop: 1600 }),
    ).toBe(true);
  });

  it('returns true when scrolled past the loaded frontier', () => {
    expect(
      shouldLoadNextPage({ ...BASE, scrollTop: 5000 }),
    ).toBe(true);
  });
});
