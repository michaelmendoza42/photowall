import { describe, expect, it } from 'vitest';
import {
  INITIAL_CAMERA,
  INITIAL_VIEWPORT,
  INITIAL_WORLD,
  withViewport,
  withWorldBounds,
} from '../camera.js';

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
