import type { GroupedWallFoundation } from './groupedWall.js';

export interface GroupedCompletenessLoadInput {
  foundation: GroupedWallFoundation | null;
  loadedPhotoCount: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
}

export function shouldLoadNextGroupedCompletenessPage(
  input: GroupedCompletenessLoadInput,
): boolean {
  const {
    foundation,
    loadedPhotoCount,
    hasNextPage,
    isFetchingNextPage,
  } = input;

  if (!foundation || foundation.mode !== 'grouped') return false;
  if (loadedPhotoCount === 0) return false;
  if (!hasNextPage || isFetchingNextPage) return false;

  return foundation.albums.some((album) => album.photos.length === 0);
}
