import { describe, expect, it } from 'vitest';
import {
  HOVER_POP_SCALE,
  computeHoverCursorPan,
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
    const pop = computeHoverPopRect({ tile: { left: 400, top: 300, width: 200, height: 100 } });

    expect(pop.width).toBeCloseTo(200 * HOVER_POP_SCALE);
    expect(pop.height).toBeCloseTo(100 * HOVER_POP_SCALE);
    expect(pop.left + pop.width / 2).toBeCloseTo(500);
    expect(pop.top + pop.height / 2).toBeCloseTo(350);
  });

  it('stays centered on a partly off-screen photo instead of shifting into view', () => {
    const pop = computeHoverPopRect({ tile: { left: 1340, top: -40, width: 200, height: 100 } });

    expect(pop.left + pop.width / 2).toBeCloseTo(1440);
    expect(pop.top + pop.height / 2).toBeCloseTo(10);
  });
});

describe('computeHoverCursorPan', () => {
  const viewport = { width: 1440, height: 960 };
  // Partly off the right edge; center (1450, 200).
  const partial = { left: 1300, top: 100, width: 300, height: 200 };

  it('slides a partly off-screen photo so its center ends under the cursor', () => {
    expect(computeHoverCursorPan(partial, { x: 1340, y: 130 }, viewport)).toEqual({ dx: 110, dy: 70 });
  });

  it('does not slide a photo that is already fully in the viewport', () => {
    const visible = { left: 100, top: 100, width: 300, height: 200 };
    expect(computeHoverCursorPan(visible, { x: 140, y: 130 }, viewport)).toBeNull();
  });

  it('does not slide when the cursor is already at the center', () => {
    expect(computeHoverCursorPan(partial, { x: 1450, y: 201 }, viewport)).toBeNull();
  });

  it('slides photos larger than the viewport, which are never fully in view', () => {
    expect(
      computeHoverCursorPan({ left: -200, top: 0, width: 1600, height: 500 }, { x: 700, y: 200 }, viewport),
    ).toEqual({ dx: 600 - 700, dy: 250 - 200 });
  });
});
