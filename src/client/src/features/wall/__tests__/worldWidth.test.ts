import { describe, expect, it } from 'vitest';
import {
  computeWorldWidth,
  DEFAULT_MOSAIC_ROW_FACTORS,
  WORLD_WIDTH_MAX,
  WORLD_WIDTH_MIN,
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

  it('returns the floor of the viewport width inside bounds', () => {
    expect(computeWorldWidth(1024)).toBe(1024);
    expect(computeWorldWidth(1366.7)).toBe(1366);
  });
});

describe('DEFAULT_MOSAIC_ROW_FACTORS', () => {
  it('contains only positive finite multipliers', () => {
    expect(DEFAULT_MOSAIC_ROW_FACTORS.length).toBeGreaterThan(1);
    for (const f of DEFAULT_MOSAIC_ROW_FACTORS) {
      expect(Number.isFinite(f)).toBe(true);
      expect(f).toBeGreaterThan(0);
    }
  });

  it('produces visible mosaic variation — max/min ratio is meaningfully > 1', () => {
    const min = Math.min(...DEFAULT_MOSAIC_ROW_FACTORS);
    const max = Math.max(...DEFAULT_MOSAIC_ROW_FACTORS);
    // Tall rows should be at least 1.5× the height of short rows so the
    // mosaic rhythm is visible at a glance, not subliminal.
    expect(max / min).toBeGreaterThan(1.5);
  });

  it('averages near 1 so total content height stays close to the uniform baseline', () => {
    const avg =
      DEFAULT_MOSAIC_ROW_FACTORS.reduce((s, f) => s + f, 0) /
      DEFAULT_MOSAIC_ROW_FACTORS.length;
    expect(avg).toBeGreaterThan(0.92);
    expect(avg).toBeLessThan(1.08);
  });
});
