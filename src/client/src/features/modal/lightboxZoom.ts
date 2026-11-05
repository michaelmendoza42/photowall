// Pinch-zoom math for the focused-photo lightbox. The photo frame is drawn
// with `translate(x, y) scale(scale)` about its own center, and the frame's
// untransformed center sits at the viewport center.

import type { ScreenPoint } from '../wall/zoomInput.js';

export const MIN_LIGHTBOX_ZOOM = 1;
export const MAX_LIGHTBOX_ZOOM = 4;

export interface LightboxZoom {
  scale: number;
  x: number;
  y: number;
}

export interface LightboxSize {
  width: number;
  height: number;
}

export const LIGHTBOX_ZOOM_FIT: LightboxZoom = { scale: 1, x: 0, y: 0 };

/**
 * Keeps the zoomed photo covering the viewport on any axis where it is
 * larger than the viewport, and centered on an axis where it is not.
 */
export function clampLightboxPan(
  zoom: LightboxZoom,
  frame: LightboxSize,
  viewport: LightboxSize,
): LightboxZoom {
  const maxX = Math.max(0, (frame.width * zoom.scale - viewport.width) / 2);
  const maxY = Math.max(0, (frame.height * zoom.scale - viewport.height) / 2);
  return {
    scale: zoom.scale,
    x: Math.min(maxX, Math.max(-maxX, zoom.x)),
    y: Math.min(maxY, Math.max(-maxY, zoom.y)),
  };
}

/**
 * Zooms to `scale`, keeping the photo point that was under `before` under
 * `after` (both relative to the viewport center). The same point for both
 * pivots on it; a moving pinch midpoint also pans with the fingers.
 */
export function zoomLightboxAbout(
  zoom: LightboxZoom,
  scale: number,
  before: ScreenPoint,
  after: ScreenPoint,
  frame: LightboxSize,
  viewport: LightboxSize,
): LightboxZoom {
  const next = Math.min(MAX_LIGHTBOX_ZOOM, Math.max(MIN_LIGHTBOX_ZOOM, scale));
  const localX = (before.x - zoom.x) / zoom.scale;
  const localY = (before.y - zoom.y) / zoom.scale;
  return clampLightboxPan(
    { scale: next, x: after.x - next * localX, y: after.y - next * localY },
    frame,
    viewport,
  );
}

export function panLightbox(
  zoom: LightboxZoom,
  dx: number,
  dy: number,
  frame: LightboxSize,
  viewport: LightboxSize,
): LightboxZoom {
  return clampLightboxPan({ ...zoom, x: zoom.x + dx, y: zoom.y + dy }, frame, viewport);
}

export function isLightboxZoomed(zoom: LightboxZoom): boolean {
  return zoom.scale > MIN_LIGHTBOX_ZOOM + 0.001;
}
