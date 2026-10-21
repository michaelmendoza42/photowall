import type { LibraryFacetsResponse, FolderFacet } from '../../../../shared/api/library.js';
import {
  folderSelectionIncludes,
  type PhotoQueryRecord,
  type ResolvedPhotoFilters,
} from '../../../../shared/api/photos.js';
import { hashStringToUint32, mulberry32, uniqueStable } from './seeded.js';

export interface GroupedViewFilters extends ResolvedPhotoFilters {}

export type AlbumAreaKind = 'folder' | 'year-root';

export interface AlbumAreaDescriptor {
  albumKey: string;
  kind: AlbumAreaKind;
  label: string;
  sourcePath: string | null;
  year: number | null;
  photoCountEstimate: number;
  anchorX: number;
  anchorY: number;
  footprintWidth: number;
  footprintHeight: number;
  shuffleSeed: string;
  placementSeed: string;
}

export interface DerivedAlbumAreas {
  viewKey: string;
  grouped: boolean;
  estimatedWorldHeight: number;
  albums: AlbumAreaDescriptor[];
}

export function deriveAlbumAreas(input: {
  filters: GroupedViewFilters;
  facets: LibraryFacetsResponse | null;
  photos: readonly PhotoQueryRecord[];
  snapshotId: string | null;
  worldWidth: number;
}): DerivedAlbumAreas {
  const { filters, facets, photos, snapshotId, worldWidth } = input;
  const years = [...filters.years].sort((a, b) => a - b);
  const folders = uniqueStable([...filters.folders].sort());
  const excludeFolders = uniqueStable([...filters.excludeFolders].sort());
  const viewKey = [
    snapshotId ?? 'no-snapshot',
    `years=${years.join(',')}`,
    `folders=${folders.join(',')}`,
    ...(excludeFolders.length > 0 ? [`exclude=${excludeFolders.join(',')}`] : []),
    `playlist=${filters.playlistId ?? 'none'}`,
  ].join('|');

  const albums =
    folders.length > 0
      ? deriveFolderAlbums({ folders, excludeFolders, facets, photos, viewKey, worldWidth })
      : years.length > 0
        ? deriveYearAlbums({ years, facets, photos, viewKey, worldWidth })
        : [];

  return {
    viewKey,
    grouped: albums.length > 1,
    estimatedWorldHeight: estimateWorldHeight(albums),
    albums,
  };
}

export function resolvePhotoAlbumKey(
  photo: PhotoQueryRecord,
  albums: readonly AlbumAreaDescriptor[],
): string | null {
  const folderAlbums = albums
    .filter((album) => album.kind === 'folder' && album.sourcePath)
    .slice()
    .sort(
      (a, b) =>
        (b.sourcePath?.length ?? 0) - (a.sourcePath?.length ?? 0) ||
        a.albumKey.localeCompare(b.albumKey),
    );

  for (const album of folderAlbums) {
    const sourcePath = album.sourcePath;
    if (!sourcePath) continue;
    if (
      photo.directoryPath === sourcePath ||
      photo.directoryPath.startsWith(`${sourcePath}/`)
    ) {
      return album.albumKey;
    }
  }

  const yearRootAlbums = albums.filter((album) => album.kind === 'year-root');
  for (const album of yearRootAlbums) {
    if (album.year === null) continue;
    if (photo.year === album.year) {
      const yearPrefix = `${album.year}/`;
      const directory = photo.directoryPath;
      if (directory === String(album.year) || !directory.startsWith(yearPrefix)) {
        return album.albumKey;
      }
    }
  }

  return null;
}

export function bucketPhotosByAlbum(
  photos: readonly PhotoQueryRecord[],
  albums: readonly AlbumAreaDescriptor[],
): Map<string, PhotoQueryRecord[]> {
  const buckets = new Map<string, PhotoQueryRecord[]>();
  for (const album of albums) {
    buckets.set(album.albumKey, []);
  }

  for (const photo of photos) {
    const albumKey = resolvePhotoAlbumKey(photo, albums);
    if (!albumKey) continue;
    const bucket = buckets.get(albumKey);
    if (!bucket) continue;
    bucket.push(photo);
  }

  return buckets;
}

function deriveFolderAlbums(input: {
  folders: readonly string[];
  excludeFolders: readonly string[];
  facets: LibraryFacetsResponse | null;
  photos: readonly PhotoQueryRecord[];
  viewKey: string;
  worldWidth: number;
}): AlbumAreaDescriptor[] {
  const { folders, excludeFolders, facets, photos, viewKey, worldWidth } = input;
  const units = selectedFolderAlbumUnits(folders, excludeFolders, facets);
  const unitPaths = units.map((unit) => unit.path);
  const raw = units.map((unit) => {
    const loadedCount = photos.filter((photo) =>
      unit.directOnly
        ? photo.directoryPath === unit.path
        : photo.directoryPath === unit.path || photo.directoryPath.startsWith(`${unit.path}/`),
    ).length;
    return {
      albumKey: `folder:${unit.path}`,
      kind: 'folder' as const,
      label: folderLabel(unit.path, unitPaths),
      sourcePath: unit.path,
      year: yearFromPath(unit.path),
      photoCountEstimate: Math.max(unit.selectedCount, loadedCount),
    };
  });

  return placeAlbumAreas(raw, viewKey, worldWidth);
}

interface FolderAlbumUnit {
  path: string;
  /** Only the folder's own photos; its child folders are separate albums. */
  directOnly: boolean;
  selectedCount: number;
}

/**
 * Resolve folder selection rules into album areas. A selected top-level
 * folder (typically a year) expands into one album per child folder that
 * still has selected photos, plus one for its own loose photos, the same
 * way a year-wide view does. A deeper selected folder is one album with
 * its descendants folded in.
 */
function selectedFolderAlbumUnits(
  folders: readonly string[],
  excludeFolders: readonly string[],
  facets: LibraryFacetsResponse | null,
): FolderAlbumUnit[] {
  const facetFolders = facets?.folders ?? [];
  const selectedDirect = (facet: FolderFacet): number =>
    folderSelectionIncludes(facet.path, folders, excludeFolders) ? facet.directPhotoCount : 0;
  const selectedUnder = (path: string): number =>
    facetFolders
      .filter((facet) => facet.path === path || facet.path.startsWith(`${path}/`))
      .reduce((sum, facet) => sum + selectedDirect(facet), 0);

  const subtreeUnits: FolderAlbumUnit[] = [];
  const directUnits: FolderAlbumUnit[] = [];
  for (const folder of folders) {
    if (facets === null || folder.includes('/')) {
      subtreeUnits.push({ path: folder, directOnly: false, selectedCount: selectedUnder(folder) });
      continue;
    }
    for (const child of facetFolders.filter((facet) => isImmediateChildOfYear(facet, folder))) {
      const selectedCount = selectedUnder(child.path);
      if (selectedCount > 0) {
        subtreeUnits.push({ path: child.path, directOnly: false, selectedCount });
      }
    }
    const ownFacet = facetFolders.find((facet) => facet.path === folder);
    const ownCount = ownFacet ? selectedDirect(ownFacet) : 0;
    if (ownCount > 0) directUnits.push({ path: folder, directOnly: true, selectedCount: ownCount });
  }

  const units = deduplicateAlbums(
    [...subtreeUnits, ...directUnits].map((unit) => ({ ...unit, albumKey: unit.path })),
  );
  if (facets === null) return units;

  // Each photo belongs to the most specific album covering it, so count
  // per album that way and drop albums left with nothing of their own.
  const ownCounts = new Map<string, number>();
  for (const facet of facetFolders) {
    const count = selectedDirect(facet);
    if (count === 0) continue;
    const owner = units
      .filter((unit) =>
        unit.directOnly
          ? facet.path === unit.path
          : facet.path === unit.path || facet.path.startsWith(`${unit.path}/`),
      )
      .sort((a, b) => b.path.length - a.path.length)[0];
    if (owner) ownCounts.set(owner.path, (ownCounts.get(owner.path) ?? 0) + count);
  }
  return units
    .filter((unit) => (ownCounts.get(unit.path) ?? 0) > 0)
    .map((unit) => ({ ...unit, selectedCount: ownCounts.get(unit.path) ?? 0 }));
}


function deriveYearAlbums(input: {
  years: readonly number[];
  facets: LibraryFacetsResponse | null;
  photos: readonly PhotoQueryRecord[];
  viewKey: string;
  worldWidth: number;
}): AlbumAreaDescriptor[] {
  const { years, facets, photos, viewKey, worldWidth } = input;
  const raw: Array<
    Omit<AlbumAreaDescriptor, 'anchorX' | 'anchorY' | 'footprintWidth' | 'footprintHeight' | 'shuffleSeed' | 'placementSeed'>
  > = [];

  for (const year of years) {
    const yearFolder = String(year);
    const childFolders = listImmediateYearChildFolders(yearFolder, facets, photos);
    for (const folder of childFolders) {
      const facet = facets?.folders.find((candidate) => candidate.path === folder) ?? null;
      const loadedCount = photos.filter(
        (photo) => photo.directoryPath === folder || photo.directoryPath.startsWith(`${folder}/`),
      ).length;
      raw.push({
        albumKey: `folder:${folder}`,
        kind: 'folder',
        label: folderLabel(folder, childFolders),
        sourcePath: folder,
        year,
        photoCountEstimate: Math.max(facet?.photoCount ?? 0, loadedCount),
      });
    }

    const directYearFacet = facets?.folders.find((candidate) => candidate.path === yearFolder) ?? null;
    const directYearPhotos = photos.filter((photo) => photo.directoryPath === yearFolder).length;
    const rootwardYearPhotos = photos.filter(
      (photo) => photo.year === year && !photo.directoryPath.startsWith(`${yearFolder}/`),
    ).length;
    const yearRootCount = (directYearFacet?.directPhotoCount ?? 0) + directYearPhotos + rootwardYearPhotos;

    if (yearRootCount > 0) {
      raw.push({
        albumKey: `year-root:${year}`,
        kind: 'year-root',
        label: `${year}`,
        sourcePath: yearFolder,
        year,
        photoCountEstimate: yearRootCount,
      });
    }
  }

  return placeAlbumAreas(deduplicateAlbums(raw), viewKey, worldWidth);
}

function placeAlbumAreas(
  rawAlbums: readonly Omit<
    AlbumAreaDescriptor,
    'anchorX' | 'anchorY' | 'footprintWidth' | 'footprintHeight' | 'shuffleSeed' | 'placementSeed'
  >[],
  viewKey: string,
  worldWidth: number,
): AlbumAreaDescriptor[] {
  const sorted = rawAlbums
    .slice()
    .sort((a, b) => a.albumKey.localeCompare(b.albumKey));
  const estimatedWorldHeight = estimateWorldHeightFromCounts(sorted.map((album) => album.photoCountEstimate));
  const placed: AlbumAreaDescriptor[] = [];
  const rand = mulberry32(hashStringToUint32(`placement:${viewKey}`));
  // Keep grouped album areas organic but clustered. Spreading anchors
  // across the full world made multi-album selections reopen on large
  // dark stretches that felt like missing content rather than a sparse map.
  const clusterWidth = clamp(
    worldWidth * (0.34 + Math.min(0.22, sorted.length * 0.06)),
    Math.min(worldWidth * 0.34, 360),
    worldWidth * 0.68,
  );
  const clusterHeight = clamp(
    estimatedWorldHeight * 0.62,
    520,
    estimatedWorldHeight,
  );
  const clusterMinX = (worldWidth - clusterWidth) / 2;
  const clusterMinY = Math.max(120, (estimatedWorldHeight - clusterHeight) / 2);

  for (let index = 0; index < sorted.length; index++) {
    const album = sorted[index]!;
    const footprintWidth = clamp(
      worldWidth * (0.14 + Math.min(0.14, Math.log2(album.photoCountEstimate + 1) * 0.018)),
      260,
      Math.max(260, worldWidth * 0.28),
    );
    const footprintHeight = clamp(
      220 + Math.log2(album.photoCountEstimate + 1) * 56,
      220,
      520,
    );
    const marginX = Math.max(footprintWidth / 2 + 20, 96);
    const marginY = Math.max(footprintHeight / 2 + 28, 120);

    const fallbackColumn = index % Math.max(1, Math.ceil(Math.sqrt(sorted.length)));
    const fallbackRow = Math.floor(index / Math.max(1, Math.ceil(Math.sqrt(sorted.length))));
    const fallbackX = normalizeWrappedX(
      clusterMinX + clusterWidth * ((fallbackColumn + 1) / (Math.ceil(Math.sqrt(sorted.length)) + 1)),
      worldWidth,
    );
    const fallbackY =
      clusterMinY + clusterHeight * ((fallbackRow + 1) / (Math.ceil(sorted.length / Math.ceil(Math.sqrt(sorted.length))) + 1));

    let anchorX = fallbackX;
    let anchorY = fallbackY;

    for (let attempt = 0; attempt < 80; attempt++) {
      const candidateX = normalizeWrappedX(
        clusterMinX + marginX + rand() * Math.max(1, clusterWidth - marginX * 2),
        worldWidth,
      );
      const candidateY =
        clusterMinY + marginY + rand() * Math.max(1, clusterHeight - marginY * 2);
      if (
        placed.every((prior) =>
          respectsMinimumSeparation(
            { anchorX: candidateX, anchorY: candidateY, footprintWidth, footprintHeight },
            prior,
            worldWidth,
          ),
        )
      ) {
        anchorX = candidateX;
        anchorY = candidateY;
        break;
      }
    }

    placed.push({
      ...album,
      anchorX,
      anchorY,
      footprintWidth,
      footprintHeight,
      shuffleSeed: `${viewKey}|shuffle|${album.albumKey}`,
      placementSeed: `${viewKey}|placement|${album.albumKey}`,
    });
  }

  return placed;
}

function estimateWorldHeight(albums: readonly AlbumAreaDescriptor[]): number {
  return estimateWorldHeightFromCounts(albums.map((album) => album.photoCountEstimate));
}

function estimateWorldHeightFromCounts(counts: readonly number[]): number {
  if (counts.length === 0) return 0;
  const total = counts.reduce((sum, count) => sum + Math.max(1, count), 0);
  return Math.max(820, 360 + Math.log2(total + 1) * 160 + counts.length * 120);
}

function listImmediateYearChildFolders(
  yearFolder: string,
  facets: LibraryFacetsResponse | null,
  photos: readonly PhotoQueryRecord[],
): string[] {
  const facetChildren = (facets?.folders ?? [])
    .filter((folder) => isImmediateChildOfYear(folder, yearFolder))
    .map((folder) => folder.path);

  const photoChildren = photos
    .map((photo) => immediateChildFolderUnderYear(photo.directoryPath, yearFolder))
    .filter((value): value is string => value !== null);

  return uniqueStable([...facetChildren, ...photoChildren]).sort();
}

function immediateChildFolderUnderYear(
  directoryPath: string,
  yearFolder: string,
): string | null {
  if (directoryPath === yearFolder) return null;
  const prefix = `${yearFolder}/`;
  if (!directoryPath.startsWith(prefix)) return null;
  const remainder = directoryPath.slice(prefix.length);
  const [firstSegment] = remainder.split('/');
  return firstSegment ? `${yearFolder}/${firstSegment}` : null;
}

function isImmediateChildOfYear(folder: FolderFacet, yearFolder: string): boolean {
  if (!folder.path.startsWith(`${yearFolder}/`)) return false;
  return folder.path.split('/').length === yearFolder.split('/').length + 1;
}

function deduplicateAlbums<T extends { albumKey: string }>(albums: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const album of albums) {
    if (seen.has(album.albumKey)) continue;
    seen.add(album.albumKey);
    out.push(album);
  }
  return out;
}

function folderLabel(path: string, siblings: readonly string[]): string {
  const segment = path.split('/').at(-1) ?? path;
  const duplicateCount = siblings.filter((candidate) => candidate.split('/').at(-1) === segment).length;
  return duplicateCount > 1 ? path : segment;
}

function yearFromPath(path: string): number | null {
  const [first] = path.split('/');
  const parsed = Number.parseInt(first ?? '', 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeWrappedX(x: number, worldWidth: number): number {
  if (worldWidth <= 0) return x;
  const wrapped = x % worldWidth;
  return wrapped < 0 ? wrapped + worldWidth : wrapped;
}

function respectsMinimumSeparation(
  candidate: {
    anchorX: number;
    anchorY: number;
    footprintWidth: number;
    footprintHeight: number;
  },
  prior: AlbumAreaDescriptor,
  worldWidth: number,
): boolean {
  const dx = wrappedDelta(candidate.anchorX, prior.anchorX, worldWidth);
  const dy = candidate.anchorY - prior.anchorY;
  const minDx = (candidate.footprintWidth + prior.footprintWidth) * 0.28;
  const minDy = (candidate.footprintHeight + prior.footprintHeight) * 0.4;
  return Math.abs(dx) >= minDx || Math.abs(dy) >= minDy;
}

function wrappedDelta(from: number, to: number, period: number): number {
  if (period <= 0) return from - to;
  const raw = from - to;
  const wrapped = ((raw + period / 2) % period + period) % period - period / 2;
  return wrapped;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
