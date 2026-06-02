import { describe, expect, it } from 'vitest';
import {
  computeWorldWidth,
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
