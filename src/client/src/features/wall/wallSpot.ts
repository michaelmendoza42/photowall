// Where the viewer was on the wall, kept for this tab so a reload comes
// back to the same spot: the photo in the middle of the screen, the zoom,
// and the photo open in the focused-photo modal, if any.

export const WALL_SPOT_STORAGE_KEY = 'photo-wall.spot';

export interface WallSpot {
  /** Photo nearest the middle of the screen. */
  photoId: string;
  zoom: number | null;
  /** Photo open in the focused-photo modal, or null when it is closed. */
  focusedPhotoId: string | null;
}

export function parseWallSpot(raw: string | null): WallSpot | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { photoId, zoom, focusedPhotoId } = value as Record<string, unknown>;
    if (typeof photoId !== 'string' || !photoId) return null;
    return {
      photoId,
      zoom: typeof zoom === 'number' && Number.isFinite(zoom) && zoom > 0 ? zoom : null,
      focusedPhotoId:
        typeof focusedPhotoId === 'string' && focusedPhotoId ? focusedPhotoId : null,
    };
  } catch {
    return null;
  }
}

export function readWallSpot(): WallSpot | null {
  try {
    return parseWallSpot(window.sessionStorage.getItem(WALL_SPOT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeWallSpot(spot: WallSpot | null): void {
  try {
    if (spot) window.sessionStorage.setItem(WALL_SPOT_STORAGE_KEY, JSON.stringify(spot));
    else window.sessionStorage.removeItem(WALL_SPOT_STORAGE_KEY);
  } catch {
    // Private mode or blocked storage: a reload just opens on the center.
  }
}
