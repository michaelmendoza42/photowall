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
 * The hovered photo grows slightly around its own center (2026-10-16: "just
 * pop out the image a little"). It is nudged back inside the viewport when
 * the tile fits there, so edge tiles don't pop off-screen.
 */
export function computeHoverPopRect(input: {
  viewport: PreviewSize;
  tile: PreviewRect;
  scale?: number;
}): PreviewRect {
  const { viewport, tile, scale = HOVER_POP_SCALE } = input;
  const width = tile.width * scale;
  const height = tile.height * scale;
  const left = tile.left - (width - tile.width) / 2;
  const top = tile.top - (height - tile.height) / 2;

  const keepInside = (start: number, size: number, limit: number): number =>
    size <= limit ? clamp(start, 0, limit - size) : start;

  return {
    left: keepInside(left, width, viewport.width),
    top: keepInside(top, height, viewport.height),
    width,
    height,
  };
}
