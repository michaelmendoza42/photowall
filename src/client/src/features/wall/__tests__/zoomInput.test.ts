import { describe, expect, it } from 'vitest';
import {
  MAX_WALL_ZOOM,
  MAX_WHEEL_ZOOM_STEP,
  MIN_WALL_ZOOM,
  pinchZoom,
  stepZoom,
  wheelZoom,
} from '../zoomInput.js';

/** Replays a trackpad pinch as the small ctrl+wheel events browsers send. */
function replayPinch(zoom: number, totalDeltaY: number, events = 30): number {
  let current = zoom;
  for (let index = 0; index < events; index += 1) {
    current = wheelZoom(current, totalDeltaY / events);
  }
  return current;
}

describe('wheelZoom (trackpad pinch)', () => {
  it('covers the whole zoom range in one pinch that doubles finger spread', () => {
    // ~70 deltaY ≈ ln(2) × 100, a pinch that doubles or halves finger spread.
    expect(replayPinch(MIN_WALL_ZOOM, -75)).toBe(MAX_WALL_ZOOM);
    expect(replayPinch(MAX_WALL_ZOOM, 75)).toBe(MIN_WALL_ZOOM);
  });

  it('caps a single mouse-wheel notch to a button-sized step', () => {
    expect(wheelZoom(1, -100)).toBeCloseTo(MAX_WHEEL_ZOOM_STEP);
    expect(wheelZoom(1, 100)).toBeCloseTo(1 / MAX_WHEEL_ZOOM_STEP);
  });

  it('clamps to the supported zoom range', () => {
    expect(wheelZoom(MAX_WALL_ZOOM, -10)).toBe(MAX_WALL_ZOOM);
    expect(wheelZoom(MIN_WALL_ZOOM, 10)).toBe(MIN_WALL_ZOOM);
  });
});

describe('pinchZoom (touch)', () => {
  it('covers the whole zoom range in one spread or pinch of about 2.3× finger distance', () => {
    expect(pinchZoom(MIN_WALL_ZOOM, 2.4)).toBe(MAX_WALL_ZOOM);
    expect(pinchZoom(MAX_WALL_ZOOM, 1 / 2.4)).toBe(MIN_WALL_ZOOM);
  });

  it('composes across touch moves the same as one move', () => {
    const stepwise = pinchZoom(pinchZoom(1, 1.2), 1.25);
    expect(stepwise).toBeCloseTo(pinchZoom(1, 1.5));
  });

  it('ignores invalid distance ratios', () => {
    expect(pinchZoom(1.3, 0)).toBe(1.3);
    expect(pinchZoom(1.3, Number.NaN)).toBe(1.3);
  });
});

describe('stepZoom (zoom buttons)', () => {
  it('multiplies and clamps', () => {
    expect(stepZoom(1, 1.25)).toBeCloseTo(1.25);
    expect(stepZoom(MAX_WALL_ZOOM, 1.25)).toBe(MAX_WALL_ZOOM);
  });
});
