export interface PreviewSize {
  width: number;
  height: number;
}

export interface PreviewRect extends PreviewSize {
  left: number;
  top: number;
}

export const FOCUSED_PHOTO_PADDING_MIN_PX = 16;
export const FOCUSED_PHOTO_PADDING_MAX_PX = 40;
export const FOCUSED_PHOTO_PADDING_VIEWPORT_RATIO = 0.03;
/** How much a hovered photo pops out of the wall. */
export const HOVER_POP_SCALE = 1.08;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function computeFocusedPhotoPaddingPx(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return FOCUSED_PHOTO_PADDING_MIN_PX;
  }
  return clamp(
    viewportWidth * FOCUSED_PHOTO_PADDING_VIEWPORT_RATIO,
    FOCUSED_PHOTO_PADDING_MIN_PX,
    FOCUSED_PHOTO_PADDING_MAX_PX,
  );
}

export function computeContainSize(
  frame: PreviewSize,
  content: PreviewSize,
): PreviewSize {
  if (
    frame.width <= 0 ||
    frame.height <= 0 ||
    content.width <= 0 ||
    content.height <= 0
  ) {
    return { width: 0, height: 0 };
  }

  const scale = Math.min(
    frame.width / content.width,
    frame.height / content.height,
  );

  return {
    width: content.width * scale,
    height: content.height * scale,
  };
}

export function computeFocusedPhotoRenderSize(input: {
  viewport: PreviewSize;
  photo: PreviewSize;
}): PreviewSize {
  const { viewport, photo } = input;
  const padding = computeFocusedPhotoPaddingPx(viewport.width);
  return computeContainSize(
    {
      width: Math.max(0, viewport.width - padding * 2),
      height: Math.max(0, viewport.height - padding * 2),
    },
    photo,
  );
}

/**
 * The hovered photo grows around its own center to half the size the
 * focused-photo view would show it at, so the view stays worth opening
 * (2026-11-11: "hover - should enlarge the picture half as big as lightbox
 * would"), and never less than a slight pop. It stays centered on the
 * photo even when that puts part of it off-screen. `tile` is what is
 * drawn, frame included on a framed wall.
 */
export function computeHoverPopRect(input: {
  tile: PreviewRect;
  /** The screen the focused-photo view would fill. */
  viewport?: PreviewSize;
  scale?: number;
}): PreviewRect {
  const { tile, viewport } = input;
  let scale = input.scale ?? HOVER_POP_SCALE;
  if (input.scale === undefined && viewport && tile.width > 0 && tile.height > 0) {
    const focused = computeFocusedPhotoRenderSize({ viewport, photo: tile });
    scale = Math.max(scale, (HOVER_POP_SHARE_OF_FOCUSED * focused.width) / tile.width);
  }
  const width = tile.width * scale;
  const height = tile.height * scale;
  return {
    left: tile.left - (width - tile.width) / 2,
    top: tile.top - (height - tile.height) / 2,
    width,
    height,
  };
}

/** A hover pop's size as a share of the focused-photo view's. */
export const HOVER_POP_SHARE_OF_FOCUSED = 0.5;

/**
 * Wheel/trackpad scrolling counts as panning until this long after its last
 * event, so photos sliding under a still cursor don't pop mid-scroll.
 */
export const HOVER_RESUME_AFTER_WHEEL_MS = 200;

/** Smaller offsets than this aren't worth a slide. */
export const HOVER_PAN_MIN_OFFSET_PX = 2;

/**
 * Screen-px pan that slides the hovered photo until its center is under the
 * cursor (2026-10-17: "a hovered photo should slide slowly until the cursor is
 * centered on it"). Only a photo partly outside the viewport slides
 * (2026-10-18: "it shouldn't move to the cursor if the whole image is already
 * in the viewport"); photos too large to fit are never fully in view, so they
 * always slide. Null when the cursor is already at the center.
 */
export function computeHoverCursorPan(
  /** The photo as drawn on the wall (its pop shares its center). */
  photo: PreviewRect,
  cursor: { x: number; y: number },
  viewport: PreviewSize,
): { dx: number; dy: number } | null {
  const fullyVisible =
    photo.left >= 0 &&
    photo.top >= 0 &&
    photo.left + photo.width <= viewport.width &&
    photo.top + photo.height <= viewport.height;
  if (fullyVisible) return null;
  const dx = photo.left + photo.width / 2 - cursor.x;
  const dy = photo.top + photo.height / 2 - cursor.y;
  if (Math.hypot(dx, dy) < HOVER_PAN_MIN_OFFSET_PX) return null;
  return { dx, dy };
}
