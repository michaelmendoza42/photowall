export type AppSurface = 'wall' | 'mosaic-lab';

export const PHOTO_WALL_HASH = '#wall';
export const MOSAIC_LAB_HASH = '#mosaic-lab';

export function parseAppSurfaceFromHash(hash: string): AppSurface {
  const normalized = hash.trim().toLowerCase();
  return normalized === MOSAIC_LAB_HASH ? 'mosaic-lab' : 'wall';
}

export function getAppSurfaceHref(surface: AppSurface): string {
  return surface === 'mosaic-lab' ? MOSAIC_LAB_HASH : PHOTO_WALL_HASH;
}

export function readAppSurfaceFromLocation(location: Pick<Location, 'hash'>): AppSurface {
  return parseAppSurfaceFromHash(location.hash);
}
