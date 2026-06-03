import { describe, expect, it } from 'vitest';
import {
  DRAG_THRESHOLD_PX,
  distanceSquared,
  hasCrossedThreshold,
} from '../dragGesture.js';

const ORIGIN = { startX: 100, startY: 200 };

describe('dragGesture', () => {
  it('exposes a non-zero default threshold so a single jittery pixel never registers as a drag', () => {
    expect(DRAG_THRESHOLD_PX).toBeGreaterThan(0);
  });

  it('reports zero distance when sample sits on the origin', () => {
    expect(
      distanceSquared(ORIGIN, { x: 100, y: 200 }),
    ).toBe(0);
  });

  it('computes squared euclidean distance from the origin', () => {
    expect(distanceSquared(ORIGIN, { x: 103, y: 204 })).toBe(9 + 16);
  });

  it('does not register a drag while inside the threshold', () => {
    // 3px in x → 9 < 16
    expect(
      hasCrossedThreshold(ORIGIN, { x: 103, y: 200 }),
    ).toBe(false);
  });

  it('registers a drag exactly at the threshold boundary', () => {
    // 4px in x → 16 === 16
    expect(
      hasCrossedThreshold(ORIGIN, { x: 104, y: 200 }),
    ).toBe(true);
  });

  it('registers a drag once any combined delta exceeds the threshold', () => {
    // 3px x + 3px y → 18 > 16
    expect(
      hasCrossedThreshold(ORIGIN, { x: 103, y: 203 }),
    ).toBe(true);
  });

  it('honours a caller-supplied threshold override', () => {
    expect(
      hasCrossedThreshold(ORIGIN, { x: 110, y: 200 }, 20),
    ).toBe(false);
    expect(
      hasCrossedThreshold(ORIGIN, { x: 120, y: 200 }, 20),
    ).toBe(true);
  });
});
