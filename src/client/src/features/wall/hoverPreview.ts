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
export const HOVER_PREVIEW_INTERPOLATION = 0.5;
export const HOVER_PREVIEW_VIEWPORT_MARGIN_PX = 16;

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

export function computeAnchoredHoverPreviewRect(input: {
  viewport: PreviewSize;
  tile: PreviewRect;
  photo: PreviewSize;
  interpolation?: number;
  viewportMarginPx?: number;
}): PreviewRect {
  const {
    viewport,
    tile,
    photo,
    interpolation = HOVER_PREVIEW_INTERPOLATION,
    viewportMarginPx = HOVER_PREVIEW_VIEWPORT_MARGIN_PX,
  } = input;

  const modalSize = computeFocusedPhotoRenderSize({ viewport, photo });
  // 2026-06-04: hover preview size is the midpoint between the tile's
  // current rendered size and the eventual focused-photo modal size for
  // the same photo. This prevents regressions back to the earlier
  // "50% of modal" interpretation, which felt too small on large tiles.
  const width = tile.width + (modalSize.width - tile.width) * interpolation;
  const height = tile.height + (modalSize.height - tile.height) * interpolation;

  const idealLeft = tile.left + tile.width / 2 - width / 2;
  const idealTop = tile.top + tile.height / 2 - height / 2;

  const maxLeft = Math.max(viewportMarginPx, viewport.width - viewportMarginPx - width);
  const maxTop = Math.max(viewportMarginPx, viewport.height - viewportMarginPx - height);

  return {
    left: clamp(idealLeft, viewportMarginPx, maxLeft),
    top: clamp(idealTop, viewportMarginPx, maxTop),
    width,
    height,
  };
}
