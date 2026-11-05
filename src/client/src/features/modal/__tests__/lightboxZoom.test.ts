import { describe, expect, it } from 'vitest';
import {
  LIGHTBOX_ZOOM_FIT,
  MAX_LIGHTBOX_ZOOM,
  clampLightboxPan,
  isLightboxZoomed,
  panLightbox,
  zoomLightboxAbout,
} from '../lightboxZoom.js';

const frame = { width: 300, height: 200 };
const viewport = { width: 400, height: 800 };

describe('zoomLightboxAbout', () => {
  it('keeps the photo point under a fixed pivot', () => {
    const pivot = { x: 60, y: -40 };
    const next = zoomLightboxAbout(LIGHTBOX_ZOOM_FIT, 2, pivot, pivot, frame, viewport);
    expect(next.scale).toBe(2);
    // The point 60px right of center is now drawn at 2 × 60 + x, still 60.
    expect(2 * 60 + next.x).toBeCloseTo(60);
    // Vertically the photo is shorter than the viewport, so it stays centered.
    expect(next.y).toBe(0);
  });

  it('pans with a moving pinch midpoint', () => {
    const zoomed = { scale: 2, x: 0, y: 0 };
    const next = zoomLightboxAbout(zoomed, 2, { x: 0, y: 0 }, { x: 30, y: 0 }, frame, viewport);
    expect(next.x).toBe(30);
  });

  it('clamps to the zoom range', () => {
    const at = { x: 0, y: 0 };
    expect(zoomLightboxAbout(LIGHTBOX_ZOOM_FIT, 0.3, at, at, frame, viewport)).toEqual(
      LIGHTBOX_ZOOM_FIT,
    );
    expect(zoomLightboxAbout(LIGHTBOX_ZOOM_FIT, 40, at, at, frame, viewport).scale).toBe(
      MAX_LIGHTBOX_ZOOM,
    );
  });

  it('recenters when zooming back out to fit', () => {
    const zoomed = { scale: 3, x: 200, y: 0 };
    const at = { x: 100, y: 0 };
    expect(zoomLightboxAbout(zoomed, 1, at, at, frame, viewport)).toEqual(LIGHTBOX_ZOOM_FIT);
  });
});

describe('panLightbox', () => {
  it('stops at the photo edges', () => {
    // At 2× the photo is 600px wide in a 400px viewport: 100px of slack a side.
    const zoomed = { scale: 2, x: 0, y: 0 };
    expect(panLightbox(zoomed, 500, 0, frame, viewport).x).toBe(100);
    expect(panLightbox(zoomed, -500, 0, frame, viewport).x).toBe(-100);
  });

  it('does not move a fitted photo', () => {
    expect(panLightbox(LIGHTBOX_ZOOM_FIT, 50, 50, frame, viewport)).toEqual(LIGHTBOX_ZOOM_FIT);
  });
});

describe('clampLightboxPan', () => {
  it('pulls the pan back in after the viewport grows', () => {
    const zoomed = { scale: 2, x: 100, y: 0 };
    expect(clampLightboxPan(zoomed, frame, { width: 560, height: 800 }).x).toBe(20);
  });
});

describe('isLightboxZoomed', () => {
  it('is false at fit and true past it', () => {
    expect(isLightboxZoomed(LIGHTBOX_ZOOM_FIT)).toBe(false);
    expect(isLightboxZoomed({ scale: 1.2, x: 0, y: 0 })).toBe(true);
  });
});
