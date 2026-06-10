import type { LibraryFacetsResponse } from '../../../../shared/api/library.js';
import type { PhotoQueryRecord, ResolvedPhotoFilters } from '../../../../shared/api/photos.js';
import {
  packJustifiedRows,
  type PackerOptions,
  type PackerResult,
} from './packer.js';
import { packGroupedAlbums } from './groupedPacker.js';
import { bucketPhotosByAlbum, deriveAlbumAreas, type AlbumAreaDescriptor } from './albumAreas.js';
import { stableShufflePhotos } from './shuffle.js';

export interface GroupedWallAlbumPlan {
  area: AlbumAreaDescriptor;
  photos: PhotoQueryRecord[];
}

export interface GroupedWallFoundation {
  mode: 'single' | 'grouped';
  viewKey: string;
  estimatedWorldHeight: number;
  albums: GroupedWallAlbumPlan[];
}

export interface GroupedCameraTarget {
  x: number;
  y: number;
}

export function deriveGroupedWallFoundation(input: {
  filters: ResolvedPhotoFilters;
  facets: LibraryFacetsResponse | null;
  photos: readonly PhotoQueryRecord[];
  snapshotId: string | null;
  worldWidth: number;
}): GroupedWallFoundation {
  const derived = deriveAlbumAreas(input);
  if (!derived.grouped) {
    return {
      mode: 'single',
      viewKey: derived.viewKey,
      estimatedWorldHeight: derived.estimatedWorldHeight,
      albums: [],
    };
  }

  const buckets = bucketPhotosByAlbum(input.photos, derived.albums);
  const albums = derived.albums.map((area) => ({
    area,
    photos: stableShufflePhotos(buckets.get(area.albumKey) ?? [], area.shuffleSeed),
  }));

  return {
    mode: 'grouped',
    viewKey: derived.viewKey,
    estimatedWorldHeight: derived.estimatedWorldHeight,
    albums,
  };
}

export function deriveGroupedCameraTarget(input: {
  foundation: GroupedWallFoundation | null;
  viewportWidth: number;
  viewportHeight: number;
}): GroupedCameraTarget | null {
  const { foundation, viewportWidth, viewportHeight } = input;
  if (!foundation || foundation.mode !== 'grouped') return null;
  if (viewportWidth <= 0 || viewportHeight <= 0) return null;
  if (foundation.albums.length === 0) return null;

  const bounds = foundation.albums.reduce(
    (acc, album) => {
      const { area } = album;
      const left = area.anchorX - area.footprintWidth / 2;
      const right = area.anchorX + area.footprintWidth / 2;
      const top = Math.max(0, area.anchorY - area.footprintHeight / 2);
      const bottom = area.anchorY + area.footprintHeight / 2;

      return {
        minX: Math.min(acc.minX, left),
        maxX: Math.max(acc.maxX, right),
        minY: Math.min(acc.minY, top),
        maxY: Math.max(acc.maxY, bottom),
      };
    },
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );

  if (!Number.isFinite(bounds.minX)) return null;

  return {
    x: Math.max(0, (bounds.minX + bounds.maxX) / 2 - viewportWidth / 2),
    y: Math.max(0, (bounds.minY + bounds.maxY) / 2 - viewportHeight / 2),
  };
}

export function buildWallLayout(input: {
  photos: readonly PhotoQueryRecord[];
  hasMore: boolean;
  foundation: GroupedWallFoundation | null;
  options: PackerOptions;
}): PackerResult {
  const { photos, hasMore, foundation, options } = input;
  if (!foundation || foundation.mode === 'single') {
    return packJustifiedRows(photos, options, hasMore);
  }

  const grouped = packGroupedAlbums(foundation.albums, {
    worldWidth: options.worldWidth,
    maxRowHeight: options.maxRowHeight,
    columnWidthFactors: options.columnWidthFactors ?? [],
    tileScale: options.tileScale,
  });

  return {
    rows: grouped.rows,
    contentHeight: grouped.contentHeight,
    packedPhotoCount: grouped.packedPhotoCount,
  };
}
