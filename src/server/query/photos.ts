// Server-side photo query against the active snapshot.
//
// Ordering: photos in a snapshot are already sorted by relativePath
// (see scanner/walk.ts). We re-affirm the same order here so the
// query layer does not assume scanner-side guarantees implicitly.
//
// Filtering:
//  - `years` matches PhotoRecord.year exactly (null year never matches
//    a year filter)
//  - `folders` matches PhotoRecord.directoryPath either exactly or as
//    a prefix segment ("2024" matches "2024/wedding-anna" but not
//    "2024-old-import")
//  - `excludeFolders` carves nested folders back out; the deepest
//    include/exclude rule covering a photo's folder decides
//  - empty filter arrays mean "no constraint on this axis"
//
// All filters AND together.

import type { PhotoRecord } from '../scanner/types.js';
import {
  folderSelectionIncludes,
  type PhotoQueryRecord,
  type ResolvedPhotoFilters,
} from '../../shared/api/photos.js';
import type { PhotoEdit } from '../../shared/api/edits.js';
import type { FeaturedFrameChoice } from '../../shared/api/curation.js';

export interface PageSliceInput {
  /** Snapshot-ordered photo list (must already be sorted). */
  photos: readonly PhotoRecord[];
  /** Resolved filters, including the default view when nothing is picked. */
  filters: ResolvedPhotoFilters;
  /** Resume position; null means start from the beginning. */
  afterRelativePath: string | null;
  afterId: string | null;
  /** Max photos to return on this page. */
  limit: number;
}

export interface PageSliceOutput {
  photos: PhotoQueryRecord[];
  /** Last photo in the page (if non-empty). */
  lastTuple: { relativePath: string; id: string } | null;
  /** True when the page exhausted all remaining matches. */
  exhausted: boolean;
  /** Count of all photos in the snapshot that match the filter set. */
  totalMatching: number;
}

export function matchesFilters(
  photo: PhotoRecord,
  filters: ResolvedPhotoFilters,
): boolean {
  if (filters.years.length > 0) {
    if (photo.year === null) return false;
    if (!filters.years.includes(photo.year)) return false;
  }
  if (filters.folders.length > 0 || filters.excludeFolders.length > 0) {
    if (
      !folderSelectionIncludes(
        photo.directoryPath,
        filters.folders,
        filters.excludeFolders,
      )
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Folder filter semantics:
 *  - "" (root) matches every photo
 *  - "2024" matches "2024" and "2024/wedding-anna"
 *  - "2024" does NOT match "2024-old-import" (segment-boundary safe)
 */
export function folderMatches(directoryPath: string, folder: string): boolean {
  if (folder === '') return true;
  if (directoryPath === folder) return true;
  return directoryPath.startsWith(`${folder}/`);
}

export function slicePhotoPage(input: PageSliceInput): PageSliceOutput {
  const { photos, filters, afterRelativePath, afterId, limit } = input;

  const out: PhotoQueryRecord[] = [];
  let totalMatching = 0;
  let cursorPassed = afterRelativePath === null && afterId === null;

  for (const photo of photos) {
    if (!matchesFilters(photo, filters)) continue;
    totalMatching += 1;

    if (!cursorPassed) {
      if (
        photo.relativePath === afterRelativePath &&
        photo.id === afterId
      ) {
        cursorPassed = true;
      }
      continue;
    }

    if (out.length < limit) {
      out.push(toQueryRecord(photo));
    }
    // Continue iterating to finish `totalMatching` — page is capped
    // but we still need an accurate total for the response.
  }

  const lastEntry = out.length === 0 ? null : out[out.length - 1];
  const lastTuple =
    lastEntry === null || lastEntry === undefined
      ? null
      : { relativePath: lastEntry.relativePath, id: lastEntry.id };

  return {
    photos: out,
    lastTuple,
    exhausted: out.length < limit,
    totalMatching,
  };
}

export function toQueryRecord(
  photo: PhotoRecord & {
    edit?: PhotoEdit;
    editVersion?: string;
    starred?: boolean;
    private?: boolean;
    featured?: boolean;
    featuredFrame?: FeaturedFrameChoice;
  },
): PhotoQueryRecord {
  return {
    id: photo.id,
    relativePath: photo.relativePath,
    directoryPath: photo.directoryPath,
    filename: photo.filename,
    width: photo.width,
    height: photo.height,
    aspectRatio: photo.aspectRatio,
    fileSize: photo.fileSize,
    mtimeMs: photo.mtimeMs,
    year: photo.year,
    yearSource: photo.yearSource,
    ...(photo.edit ? { edit: photo.edit, editVersion: photo.editVersion } : {}),
    ...(photo.starred ? { starred: true } : {}),
    ...(photo.private ? { private: true } : {}),
    ...(photo.featured
      ? { featured: true, featuredFrame: photo.featuredFrame ?? 'random' }
      : {}),
  };
}
