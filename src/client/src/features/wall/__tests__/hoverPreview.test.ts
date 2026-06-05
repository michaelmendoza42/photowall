import { describe, expect, it } from 'vitest';
import {
  HOVER_PREVIEW_INTERPOLATION,
  computeAnchoredHoverPreviewRect,
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

  it('anchors the hover preview halfway between the tile and focused-photo modal sizes and clamps near viewport edges', () => {
    const preview = computeAnchoredHoverPreviewRect({
      viewport: { width: 1440, height: 960 },
      tile: { left: 1360, top: 860, width: 72, height: 72 },
      photo: { width: 1600, height: 900 },
    });

    expect(preview.width).toBe(72 + (1360 - 72) * HOVER_PREVIEW_INTERPOLATION);
    expect(preview.height).toBe(72 + (765 - 72) * HOVER_PREVIEW_INTERPOLATION);
    expect(preview.left).toBe(1440 - 16 - preview.width);
    expect(preview.top).toBe(960 - 16 - preview.height);
  });
});
