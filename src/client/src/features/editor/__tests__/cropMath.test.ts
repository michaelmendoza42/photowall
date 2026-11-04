import { describe, expect, it } from 'vitest';
import {
  centeredCrop,
  cropForFrame,
  panCrop,
  photoBounds,
  resizeFrame,
  zoomCrop,
  type ScreenRect,
} from '../cropMath.js';

const frame: ScreenRect = { left: 100, top: 50, width: 400, height: 200 };

describe('crop with a frame that stays put', () => {
  it('panning moves the photo under the frame, never past its edges', () => {
    const crop = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
    // Dragging the photo right by half a frame shows more of its left.
    expect(panCrop(crop, frame, 200, 0)).toEqual({ x: 0, y: 0.25, w: 0.5, h: 0.5 });
    expect(panCrop(crop, frame, -10_000, 0).x).toBe(0.5);
  });

  it('zooms about the pointer, keeping the photo point under it', () => {
    const crop = { x: 0, y: 0, w: 1, h: 1 };
    const zoomed = zoomCrop(crop, frame, 2, 100, 50);
    expect(zoomed).toEqual({ x: 0, y: 0, w: 0.5, h: 0.5 });
    const centered = zoomCrop(crop, frame, 2, 300, 150);
    expect(centered).toEqual({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
  });

  it('cannot zoom out past the whole photo', () => {
    const crop = { x: 0.2, y: 0, w: 0.5, h: 1 };
    const out = zoomCrop(crop, frame, 0.25, 300, 150);
    expect(Math.max(out.w, out.h)).toBeCloseTo(1);
    expect(out.w / out.h).toBeCloseTo(0.5);
  });

  it('resizing the frame keeps the photo still and stays inside it', () => {
    const crop = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
    const bounds = photoBounds(crop, frame);
    expect(bounds).toEqual({ left: -100, top: -50, right: 700, bottom: 350 });
    const smaller = resizeFrame('se', frame, -200, -100, null, bounds);
    expect(smaller).toEqual({ left: 100, top: 50, width: 200, height: 100 });
    expect(cropForFrame(crop, frame, smaller)).toEqual({ x: 0.25, y: 0.25, w: 0.25, h: 0.25 });
    // Dragging far out stops at the photo's edge.
    const huge = resizeFrame('nw', frame, -10_000, -10_000, null, bounds);
    expect(huge.left).toBe(-100);
    expect(huge.top).toBe(-50);
  });

  it('a locked ratio keeps the frame shape', () => {
    const bounds = { left: 0, top: 0, right: 1000, bottom: 1000 };
    const next = resizeFrame('se', frame, 100, 0, 2, bounds);
    expect(next.width / next.height).toBeCloseTo(2);
  });

  it('centers the largest crop of a given shape', () => {
    expect(centeredCrop(1, 400, 200)).toEqual({ x: 0.25, y: 0, w: 0.5, h: 1 });
    expect(centeredCrop(4, 400, 200)).toEqual({ x: 0, y: 0.25, w: 1, h: 0.5 });
  });
});
