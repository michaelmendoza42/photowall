import { describe, expect, it } from 'vitest';
import {
  createDragMomentumSample,
  dragMomentumAtRelease,
  sampleDragMomentum,
} from '../dragMomentum.js';

describe('drag momentum sampling', () => {
  it('normalizes recent camera movement to one animation frame', () => {
    const sample = sampleDragMomentum(
      createDragMomentumSample(100),
      { dx: 24, dy: -12 },
      120,
    );

    expect(sample.dx).toBeCloseTo(20);
    expect(sample.dy).toBeCloseTo(-10);
    expect(dragMomentumAtRelease(sample, 150)).toEqual({
      dx: sample.dx,
      dy: sample.dy,
    });
  });

  it('drops stale velocity after the pointer pauses before release', () => {
    const sample = sampleDragMomentum(
      createDragMomentumSample(100),
      { dx: 24, dy: 0 },
      120,
    );

    expect(dragMomentumAtRelease(sample, 281)).toBeNull();
  });

  it('does not create momentum before an applied drag sample exists', () => {
    expect(
      dragMomentumAtRelease(createDragMomentumSample(100), 110),
    ).toBeNull();
  });
});
