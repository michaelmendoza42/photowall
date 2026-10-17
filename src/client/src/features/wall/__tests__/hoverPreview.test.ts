import { describe, expect, it } from 'vitest';
import {
  HOVER_POP_SCALE,
  computeHoverPopRect,
  computeFocusedPhotoPaddingPx,
  computeFocusedPhotoRenderSize,
} from '../hoverPreview.js';

describe('hoverPreview geometry', () => {
  it('matches the focused-photo modal padding clamp', () => {
    expect(computeFocusedPhotoPaddingPx(320)).toBe(16);
    expect(computeFocusedPhotoPaddingPx(1440)).toBe(40);
  });

  it('sizes the focused-photo render using contain math inside the padded viewport', () => {
    expect(
      computeFocusedPhotoRenderSize({
        viewport: { width: 1440, height: 960 },
        photo: { width: 1600, height: 900 },
      }),
    ).toEqual({
      width: 1360,
      height: 765,
    });
  });

  it('pops the hovered photo out slightly around its own center', () => {
    const pop = computeHoverPopRect({
      viewport: { width: 1440, height: 960 },
      tile: { left: 400, top: 300, width: 200, height: 100 },
    });

    expect(pop.width).toBeCloseTo(200 * HOVER_POP_SCALE);
    expect(pop.height).toBeCloseTo(100 * HOVER_POP_SCALE);
    expect(pop.left + pop.width / 2).toBeCloseTo(500);
    expect(pop.top + pop.height / 2).toBeCloseTo(350);
  });

  it('keeps an edge tile pop inside the viewport when the tile fits', () => {
    const pop = computeHoverPopRect({
      viewport: { width: 1440, height: 960 },
      tile: { left: 1340, top: 0, width: 100, height: 80 },
    });

    expect(pop.left + pop.width).toBeCloseTo(1440);
    expect(pop.top).toBe(0);
  });

  it('leaves a tile larger than the viewport centered on itself', () => {
    const pop = computeHoverPopRect({
      viewport: { width: 400, height: 300 },
      tile: { left: -100, top: -50, width: 600, height: 400 },
    });

    expect(pop.left).toBeCloseTo(-100 - 600 * (HOVER_POP_SCALE - 1) / 2);
  });
});
