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
  withViewport,
  withWorldBounds,
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

describe('camera bounds math', () => {
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

describe('clampCamera', () => {
  it('returns the same reference when already in bounds', () => {
    const base = { ...READY_CAMERA, x: 100, y: 200 };
    expect(clampCamera(base)).toBe(base);
  });

  it('clamps negative offsets to zero', () => {
    const drifted = { ...READY_CAMERA, x: -50, y: -30 };
    const clamped = clampCamera(drifted);
    expect(clamped.x).toBe(0);
    expect(clamped.y).toBe(0);
  });

  it('clamps offsets past the loaded frontier to the max', () => {
    const drifted = { ...READY_CAMERA, x: 10_000, y: 50_000 };
    const clamped = clampCamera(drifted);
    expect(clamped.x).toBe(maxOffsetX(READY_CAMERA));
    expect(clamped.y).toBe(maxOffsetY(READY_CAMERA));
  });

  it('treats unmeasured world height as zero', () => {
    const stillScanning = {
      ...READY_CAMERA,
      world: { width: 1600, height: null as number | null },
      y: 250,
    };
    const clamped = clampCamera(stillScanning);
    expect(clamped.y).toBe(0);
  });

  it('reclamps after a shrinking viewport changes the max offset', () => {
    const base = { ...READY_CAMERA, x: 600, y: 3200 };
    const next = withViewport(base, { width: 1600, height: 4000 });
    // World now fits entirely in the viewport → both offsets clamp to 0.
    expect(next.x).toBe(0);
    expect(next.y).toBe(0);
  });

  it('reclamps after world shrinks below the current camera position', () => {
    const base = { ...READY_CAMERA, x: 500, y: 3000 };
    const next = withWorldBounds(base, { width: 1200, height: 1500 });
    expect(next.x).toBe(maxOffsetX(next));
    expect(next.y).toBe(maxOffsetY(next));
  });
});

describe('panBy / panTo', () => {
  it('adds the delta and clamps to world bounds', () => {
    const next = panBy(READY_CAMERA, { dx: 250, dy: 1000 });
    expect(next.x).toBe(250);
    expect(next.y).toBe(1000);
  });

  it('panBy never drifts past zero on the left/top edge', () => {
    const next = panBy(READY_CAMERA, { dx: -200, dy: -200 });
    expect(next.x).toBe(0);
    expect(next.y).toBe(0);
  });

  it('panBy never drifts past the loaded frontier', () => {
    const next = panBy(READY_CAMERA, { dx: 10_000, dy: 10_000 });
    expect(next.x).toBe(maxOffsetX(READY_CAMERA));
    expect(next.y).toBe(maxOffsetY(READY_CAMERA));
  });

  it('panTo jumps to an absolute position then clamps', () => {
    const next = panTo(READY_CAMERA, { x: 100_000, y: -100 });
    expect(next.x).toBe(maxOffsetX(READY_CAMERA));
    expect(next.y).toBe(0);
  });

  it('panBy preserves identity when delta + clamp yields no change', () => {
    const atTopLeft = { ...READY_CAMERA, x: 0, y: 0 };
    expect(panBy(atTopLeft, { dx: -50, dy: -50 })).toBe(atTopLeft);
  });
});
