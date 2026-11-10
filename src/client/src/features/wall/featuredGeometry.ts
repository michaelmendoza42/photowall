// Geometry of a featured photo's hero tile: the photo, uncropped, inside a
// frame. The tile is the frame's outer edge; the frame (moulding plus mat)
// is a band whose width is a fixed share of the tile's shorter side, the
// same for every frame, so the frame choice never changes the layout.

/** Share of the tile's shorter side each side of the frame takes. */
export const FEATURED_FRAME_BAND_RATIO = 0.09;
/** Share of the viewport (each way) a hero tile fills at the default zoom. */
export const FEATURED_VIEWPORT_SHARE = 0.9;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function aspectOf(photo: { width: number; height: number }): number {
  return photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 1;
}

/**
 * Width / height of a hero tile whose frame holds a photo of
 * `photoAspect` with no mat left over.
 */
export function featuredTileAspect(photoAspect: number): number {
  const band = 2 * FEATURED_FRAME_BAND_RATIO;
  // The band follows the tile's shorter side: the height for a landscape
  // photo, the width for a portrait one.
  return photoAspect >= 1
    ? photoAspect * (1 - band) + band
    : 1 / ((1 / photoAspect) * (1 - band) + band);
}

/** The largest hero tile for `photo` that fits inside `box`. */
export function featuredTileSize(
  photo: { width: number; height: number },
  box: { width: number; height: number },
): { width: number; height: number } {
  const aspect = featuredTileAspect(aspectOf(photo));
  const width = Math.min(box.width, box.height * aspect);
  return { width, height: width / aspect };
}

/** Where the photo sits inside a hero tile: inside the frame, uncropped, centered. */
export function featuredPhotoRect(tile: Rect, photo: { width: number; height: number }): Rect {
  const band = FEATURED_FRAME_BAND_RATIO * Math.min(tile.width, tile.height);
  const innerWidth = Math.max(0, tile.width - 2 * band);
  const innerHeight = Math.max(0, tile.height - 2 * band);
  const aspect = aspectOf(photo);
  const width = Math.min(innerWidth, innerHeight * aspect);
  const height = width / aspect;
  return {
    x: tile.x + (tile.width - width) / 2,
    y: tile.y + (tile.height - height) / 2,
    width,
    height,
  };
}
