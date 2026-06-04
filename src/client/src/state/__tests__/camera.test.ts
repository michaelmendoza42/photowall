import { describe, expect, it } from 'vitest';
import {
  INITIAL_CAMERA,
  INITIAL_VIEWPORT,
  INITIAL_WORLD,
  clampCamera,
  maxOffsetX,
  maxOffsetY,
  panBy,
  panTo,
  projectCamera,
  rebaseWrappedTravel,
  withViewport,
  withWorldBounds,
  wrapTravelOffset,
} from '../camera.js';

const READY_CAMERA = {
  x: 0,
  y: 0,
  viewport: { width: 1000, height: 800 },
  world: { width: 1600, height: 4000 },
};

describe('camera state contract', () => {
  it('starts at origin with an empty viewport and unknown world height', () => {
    expect(INITIAL_CAMERA.x).toBe(0);
    expect(INITIAL_CAMERA.y).toBe(0);
    expect(INITIAL_CAMERA.viewport).toEqual(INITIAL_VIEWPORT);
    expect(INITIAL_CAMERA.world).toEqual(INITIAL_WORLD);
    expect(INITIAL_CAMERA.world.height).toBeNull();
  });

  it('replaces only the viewport without touching offsets or world', () => {
    const next = withViewport(INITIAL_CAMERA, { width: 1440, height: 900 });
    expect(next.viewport).toEqual({ width: 1440, height: 900 });
    expect(next.x).toBe(INITIAL_CAMERA.x);
    expect(next.y).toBe(INITIAL_CAMERA.y);
    expect(next.world).toBe(INITIAL_CAMERA.world);
  });

  it('replaces only the world bounds without touching the viewport', () => {
    const next = withWorldBounds(INITIAL_CAMERA, { width: 1280, height: 8000 });
    expect(next.world).toEqual({ width: 1280, height: 8000 });
    expect(next.viewport).toBe(INITIAL_CAMERA.viewport);
  });
});

describe('world extent helpers', () => {
  it('reports zero max offsets while world or viewport are unmeasured', () => {
    expect(maxOffsetX(INITIAL_CAMERA)).toBe(0);
    expect(maxOffsetY(INITIAL_CAMERA)).toBe(0);
  });

  it('reports the world-minus-viewport extent once bounds are known', () => {
    expect(maxOffsetX(READY_CAMERA)).toBe(600);
    expect(maxOffsetY(READY_CAMERA)).toBe(3200);
  });

  it('clamps to zero when the world is smaller than the viewport', () => {
    const narrow = {
      ...READY_CAMERA,
      world: { width: 800, height: 500 },
    };
    expect(maxOffsetX(narrow)).toBe(0);
    expect(maxOffsetY(narrow)).toBe(0);
  });
});

describe('wrap projection helpers', () => {
  it('wraps positive travel into the current world period', () => {
    expect(wrapTravelOffset(2500, 2000)).toBe(500);
  });

  it('wraps negative travel into the positive render interval', () => {
    expect(wrapTravelOffset(-250, 2000)).toBe(1750);
  });

  it('returns zero when the world period is not usable', () => {
    expect(wrapTravelOffset(123, 0)).toBe(0);
  });

  it('projects both axes from continuous travel state', () => {
    const projected = projectCamera({
      ...READY_CAMERA,
      x: 1900,
      y: -250,
    });
    expect(projected.x).toBe(300);
    expect(projected.y).toBe(3750);
  });

  it('rebases travel across a growing world while preserving the wrapped view', () => {
    // One completed 2000px cycle + 500px into the world.
    const rebased = rebaseWrappedTravel(2500, 2000, 3000);
    expect(rebased).toBe(3500);
    expect(wrapTravelOffset(rebased, 3000)).toBe(500);
  });
});

describe('clampCamera', () => {
  it('returns the same reference when travel offsets are already finite', () => {
    const base = { ...READY_CAMERA, x: 100, y: 200 };
    expect(clampCamera(base)).toBe(base);
  });

  it('normalizes non-finite travel offsets to zero', () => {
    const drifted = { ...READY_CAMERA, x: Number.NaN, y: Number.POSITIVE_INFINITY };
    const clamped = clampCamera(drifted);
    expect(clamped.x).toBe(0);
    expect(clamped.y).toBe(0);
  });
});

describe('withWorldBounds', () => {
  it('preserves the current wrapped x/y projection when periods grow', () => {
    const base = {
      ...READY_CAMERA,
      x: 2500,
      y: 4500,
    };
    const before = projectCamera(base);
    const next = withWorldBounds(base, { width: 2400, height: 5000 });
    const after = projectCamera(next);
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    expect(next.x).toBe(3300);
    expect(next.y).toBe(5500);
  });

  it('normalizes negative world bounds instead of propagating them', () => {
    const next = withWorldBounds(READY_CAMERA, { width: -10, height: -20 });
    expect(next.world.width).toBe(0);
    expect(next.world.height).toBe(0);
  });
});

describe('panBy / panTo', () => {
  it('adds the travel delta without clamping to the world frontier', () => {
    const next = panBy(READY_CAMERA, { dx: 2500, dy: 5000 });
    expect(next.x).toBe(2500);
    expect(next.y).toBe(5000);
  });

  it('allows negative travel so the wall can wrap in both directions', () => {
    const next = panBy(READY_CAMERA, { dx: -200, dy: -200 });
    expect(next.x).toBe(-200);
    expect(next.y).toBe(-200);
  });

  it('panTo jumps to an absolute travel position without bounded clamping', () => {
    const next = panTo(READY_CAMERA, { x: 100_000, y: -100 });
    expect(next.x).toBe(100_000);
    expect(next.y).toBe(-100);
  });

  it('panBy preserves identity when the delta yields no change', () => {
    expect(panBy(READY_CAMERA, { dx: 0, dy: 0 })).toBe(READY_CAMERA);
  });
});
