import { EDIT_LIMITS, type EditCrop } from '../../../../shared/api/edits.js';

/** A rectangle on screen, in CSS px. */
export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type CropHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** Smallest the crop frame may get on screen. */
export const MIN_FRAME_PX = 48;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Keep the crop inside the photo. */
export function keepCropInside(crop: EditCrop): EditCrop {
  return { ...crop, x: clamp(crop.x, 0, 1 - crop.w), y: clamp(crop.y, 0, 1 - crop.h) };
}

/**
 * Drag the photo by (dx, dy) screen px under a frame that stays put.
 * Dragging right shows more of the photo's left, so the crop moves left.
 */
export function panCrop(crop: EditCrop, frame: ScreenRect, dx: number, dy: number): EditCrop {
  return keepCropInside({
    ...crop,
    x: crop.x - (dx * crop.w) / frame.width,
    y: crop.y - (dy * crop.h) / frame.height,
  });
}

/**
 * Zoom the photo by `factor` about a screen point, keeping the photo
 * point under it still. Zooming out stops when the frame would show
 * more than the whole photo; zooming in stops at the smallest crop.
 */
export function zoomCrop(
  crop: EditCrop,
  frame: ScreenRect,
  factor: number,
  pointX: number,
  pointY: number,
): EditCrop {
  const fx = (pointX - frame.left) / frame.width;
  const fy = (pointY - frame.top) / frame.height;
  const u = crop.x + fx * crop.w;
  const v = crop.y + fy * crop.h;
  let w = crop.w / factor;
  let h = crop.h / factor;
  const over = Math.max(w, h);
  if (over > 1) {
    w /= over;
    h /= over;
  }
  const smallest = Math.min(w, h);
  if (smallest < EDIT_LIMITS.minCrop) {
    const grow = EDIT_LIMITS.minCrop / smallest;
    w = Math.min(1, w * grow);
    h = Math.min(1, h * grow);
  }
  return keepCropInside({ x: u - fx * w, y: v - fy * h, w, h });
}

/**
 * Resize the frame from one handle, the opposite side anchored. `ratio`
 * (width / height in px) locks the shape and then only corners move.
 * `bounds` is the photo's extent on screen, which the frame can't leave.
 */
export function resizeFrame(
  handle: CropHandle,
  frame: ScreenRect,
  dx: number,
  dy: number,
  ratio: number | null,
  bounds: { left: number; top: number; right: number; bottom: number },
): ScreenRect {
  const west = handle.includes('w');
  const east = handle.includes('e');
  const north = handle.includes('n');
  const south = handle.includes('s');
  const anchorX = west ? frame.left + frame.width : frame.left;
  const anchorY = north ? frame.top + frame.height : frame.top;
  const maxW = west ? anchorX - bounds.left : bounds.right - anchorX;
  const maxH = north ? anchorY - bounds.top : bounds.bottom - anchorY;
  let width = west || east
    ? clamp(west ? frame.width - dx : frame.width + dx, Math.min(MIN_FRAME_PX, maxW), maxW)
    : frame.width;
  let height = north || south
    ? clamp(north ? frame.height - dy : frame.height + dy, Math.min(MIN_FRAME_PX, maxH), maxH)
    : frame.height;
  if (ratio !== null) {
    height = width / ratio;
    if (height > maxH) {
      height = maxH;
      width = height * ratio;
    }
  }
  return {
    left: west ? anchorX - width : east ? anchorX : frame.left,
    top: north ? anchorY - height : south ? anchorY : frame.top,
    width,
    height,
  };
}

/**
 * The crop that a resized frame shows, with the photo held still: the
 * frame's screen movement converted to photo fractions at this zoom.
 */
export function cropForFrame(crop: EditCrop, before: ScreenRect, after: ScreenRect): EditCrop {
  const kx = crop.w / before.width;
  const ky = crop.h / before.height;
  return keepCropInside({
    x: crop.x + (after.left - before.left) * kx,
    y: crop.y + (after.top - before.top) * ky,
    w: Math.min(1, after.width * kx),
    h: Math.min(1, after.height * ky),
  });
}

/** Where the whole photo lies on screen, given the crop and its frame. */
export function photoBounds(
  crop: EditCrop,
  frame: ScreenRect,
): { left: number; top: number; right: number; bottom: number } {
  const photoWidth = frame.width / crop.w;
  const photoHeight = frame.height / crop.h;
  const left = frame.left - crop.x * photoWidth;
  const top = frame.top - crop.y * photoHeight;
  return { left, top, right: left + photoWidth, bottom: top + photoHeight };
}

/**
 * The largest centered crop with pixel ratio `ratio` in a photo of
 * `photoWidth` × `photoHeight` (after its quarter turn).
 */
export function centeredCrop(ratio: number, photoWidth: number, photoHeight: number): EditCrop {
  let w = 1;
  let h = photoWidth / photoHeight / ratio;
  if (h > 1) {
    h = 1;
    w = (photoHeight / photoWidth) * ratio;
  }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}
