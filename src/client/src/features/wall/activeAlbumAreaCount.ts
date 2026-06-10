import type { LibraryFacetsResponse } from '../../../../shared/api/library.js';
import type {
  PhotoQueryRecord,
  ResolvedPhotoFilters,
} from '../../../../shared/api/photos.js';
import { deriveAlbumAreas } from './albumAreas.js';

/**
 * Derive how many album areas the current wall view resolves to.
 *
 * The active wall path is always Pixi-first now, but callers still need this
 * diagnostic to distinguish single-stream vs grouped contexts and to drive
 * grouped-only behavior.
 */
export function deriveActiveAlbumAreaCount(input: {
  filters: ResolvedPhotoFilters;
  facets: LibraryFacetsResponse | null;
  photos: readonly PhotoQueryRecord[];
  snapshotId: string | null;
  worldWidth: number;
}): number {
  const { filters, facets, photos, snapshotId, worldWidth } = input;
  if (filters.years.length === 0 && filters.folders.length === 0) {
    return 1;
  }

  if (filters.years.length > 0 && facets === null) {
    // Year-wide contexts can legitimately expand to multiple grouped album
    // areas. Until facets are available, stay conservative so diagnostics
    // do not claim the view is single-stream prematurely.
    return 2;
  }

  const derived = deriveAlbumAreas({
    filters,
    facets,
    photos,
    snapshotId,
    worldWidth,
  });

  return Math.max(1, derived.albums.length);
}
