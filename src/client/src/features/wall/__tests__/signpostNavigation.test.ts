import { describe, expect, it } from 'vitest';
import type { CameraState } from '../../../state/camera.js';
import { computeWrapAwareCameraTarget, easeOutCubic } from '../signpostNavigation.js';

const CAMERA: CameraState = {
  x: 0,
  y: 0,
  viewport: { width: 1200, height: 800 },
  world: { width: 2400, height: 1600 },
};

describe('computeWrapAwareCameraTarget', () => {
  it('targets the nearest wrapped destination toward an album anchor', () => {
    const target = computeWrapAwareCameraTarget({
      camera: CAMERA,
      targetX: 1800,
      targetY: 1200,
    });

    expect(target.x).toBe(1200);
    expect(target.y).toBe(800);
  });

  it('prefers the shortest wrapped glide across both axes', () => {
    const target = computeWrapAwareCameraTarget({
      camera: {
        ...CAMERA,
        x: 2100,
        y: 1500,
      },
      targetX: 200,
      targetY: 100,
    });

    expect(target.x).toBe(2000);
    expect(target.y).toBe(1300);
  });
});

describe('easeOutCubic', () => {
  it('starts at 0 and ends at 1', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});
