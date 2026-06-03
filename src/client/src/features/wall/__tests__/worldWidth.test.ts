import { describe, expect, it } from 'vitest';
import {
  computeWorldWidth,
  DEFAULT_MOSAIC_COLUMN_FACTORS,
  WORLD_WIDTH_MAX,
  WORLD_WIDTH_MIN,
  WORLD_WIDTH_VIEWPORT_MULTIPLIER,
} from '../worldWidth.js';

describe('computeWorldWidth', () => {
  it('returns the minimum for non-positive or invalid viewport widths', () => {
    expect(computeWorldWidth(0)).toBe(WORLD_WIDTH_MIN);
    expect(computeWorldWidth(-10)).toBe(WORLD_WIDTH_MIN);
    expect(computeWorldWidth(Number.NaN)).toBe(WORLD_WIDTH_MIN);
  });

  it('clamps below the minimum', () => {
    expect(computeWorldWidth(100)).toBe(WORLD_WIDTH_MIN);
  });

  it('clamps above the maximum', () => {
    expect(computeWorldWidth(5000)).toBe(WORLD_WIDTH_MAX);
  });

  it('returns a bounded width that is intentionally wider than the viewport', () => {
    expect(computeWorldWidth(1024)).toBe(
      Math.floor(1024 * WORLD_WIDTH_VIEWPORT_MULTIPLIER),
    );
    expect(computeWorldWidth(1366.7)).toBe(
      Math.floor(1366.7 * WORLD_WIDTH_VIEWPORT_MULTIPLIER),
    );
  });
});

describe('DEFAULT_MOSAIC_COLUMN_FACTORS', () => {
  it('contains only positive finite multipliers', () => {
    expect(DEFAULT_MOSAIC_COLUMN_FACTORS.length).toBeGreaterThan(2);
    for (const factor of DEFAULT_MOSAIC_COLUMN_FACTORS) {
      expect(Number.isFinite(factor)).toBe(true);
      expect(factor).toBeGreaterThan(0);
    }
  });

  it('produces visible width variation across columns', () => {
    const min = Math.min(...DEFAULT_MOSAIC_COLUMN_FACTORS);
    const max = Math.max(...DEFAULT_MOSAIC_COLUMN_FACTORS);
    expect(max / min).toBeGreaterThan(1.4);
  });

  it('averages near 1 so overall density stays close to the prior baseline', () => {
    const avg =
      DEFAULT_MOSAIC_COLUMN_FACTORS.reduce((sum, factor) => sum + factor, 0) /
      DEFAULT_MOSAIC_COLUMN_FACTORS.length;
    expect(avg).toBeGreaterThan(0.92);
    expect(avg).toBeLessThan(1.08);
  });
});
