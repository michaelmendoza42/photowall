// Paginated photo query contract.
//
// The wall consumes this endpoint to lazily fetch the next page of
// photos as the camera approaches the loaded frontier. Cursors are
// opaque to the client: the server alone is responsible for encoding
// and decoding them. A cursor whose snapshot version no longer matches
// the active snapshot is rejected with an explicit reset signal rather
// than silently returning unrelated rows.

import type { YearSource } from './library.js';
import type { PhotoEdit } from './edits.js';

/** Server-defined hard cap on a single page request. */
export const PHOTOS_PAGE_MAX_LIMIT = 5000;

/** Server-defined default page size when the client omits `limit`. */
export const PHOTOS_PAGE_DEFAULT_LIMIT = 60;

export const PHOTOS_QUERY_PATH = '/api/photos';

/**
 * Photo record returned by the paginated query. This is the wire
 * subset of the persisted `PhotoRecord` — we deliberately keep all
 * scan-time fields here because the wall layout uses width/height
 * directly for justified-row packing.
 */
export interface PhotoQueryRecord {
  id: string;
  relativePath: string;
  directoryPath: string;
  filename: string;
  width: number;
  height: number;
  aspectRatio: number;
  fileSize: number;
  mtimeMs: number;
  year: number | null;
  yearSource: YearSource;
  /**
   * The curator's light edit, when there is one. `width`, `height` and
   * `aspectRatio` above already describe the edited photo.
   */
  edit?: PhotoEdit;
  /** Fingerprint of `edit`; part of the media URL so edits bust caches. */
  editVersion?: string;
}

/** Reason a snapshot-bound cursor is no longer usable. */
export type SnapshotChangedReason =
  | 'snapshot_replaced'
  | 'snapshot_missing'
  | 'cursor_invalid';

export interface SnapshotChangedResponse {
  error: 'snapshot_changed';
  reason: SnapshotChangedReason;
  /** Current active snapshot id, or null when no snapshot is live yet. */
  activeSnapshotId: string | null;
}

export interface PhotosQuerySuccessResponse {
  schemaVersion: number;
  snapshotId: string;
  /** Photos for this page, in deterministic order. */
  photos: PhotoQueryRecord[];
  /** Opaque cursor for the next page, or null when no more pages. */
  nextCursor: string | null;
  /**
   * Total photos matching the filter set within the active snapshot.
   * Useful for empty-state and progress UX without forcing the client
   * to drain every page.
   */
  totalMatching: number;
  /**
   * Filter set echoed back, after playlist expansion has been applied.
   * Lets the client surface "this playlist resolved to years=…,
   * folders=…" without re-fetching the playlist.
   */
  appliedFilters: ResolvedPhotoFilters;
}

export type PhotosQueryResponse =
  | PhotosQuerySuccessResponse
  | SnapshotChangedResponse;

/**
 * Filter inputs accepted by the query endpoint. All filters combine
 * with AND semantics. `playlist` expands to a saved (years, folders)
 * preset and intersects with any inline filters the client also sent.
 */
export interface PhotosQueryFilters {
  years?: number[];
  folders?: string[];
  /** Folders carved back out of `folders`; see `folderSelectionIncludes`. */
  excludeFolders?: string[];
  playlistId?: string;
}

/**
 * Filters after playlist expansion has been applied, with the
 * remaining inline filters intersected in.
 */
export interface ResolvedPhotoFilters {
  years: number[];
  folders: string[];
  excludeFolders: string[];
  playlistId: string | null;
}

/**
 * Whether a folder's own photos are inside a folder selection.
 *
 * `include` and `exclude` are folder rules that each cover a folder and
 * everything beneath it. The deepest rule covering `directoryPath` wins,
 * so a nested folder can be excluded from a selected parent and a
 * deeper folder re-included under that exclusion. With no include
 * rules the selection starts from the whole library.
 */
export function folderSelectionIncludes(
  directoryPath: string,
  include: readonly string[],
  exclude: readonly string[],
): boolean {
  let included = include.length === 0;
  let depth = -1;
  for (const rule of include) {
    const ruleDepth = coveringRuleDepth(directoryPath, rule);
    if (ruleDepth > depth) {
      depth = ruleDepth;
      included = true;
    }
  }
  for (const rule of exclude) {
    const ruleDepth = coveringRuleDepth(directoryPath, rule);
    if (ruleDepth >= depth && ruleDepth >= 0) {
      depth = ruleDepth;
      included = false;
    }
  }
  return included;
}

/** Segment depth of `rule` when it covers `directoryPath`, else -1. */
function coveringRuleDepth(directoryPath: string, rule: string): number {
  if (rule === '') return 0;
  if (directoryPath !== rule && !directoryPath.startsWith(`${rule}/`)) return -1;
  return rule.split('/').length;
}
