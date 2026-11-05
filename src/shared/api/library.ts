// Library status and facets contracts.
//
// These shapes are owned by the server snapshot manager and consumed by
// the frontend's library/health views. Pagination and per-photo queries
// belong to phase2-task3 and are intentionally absent here.

/**
 * Schema version for persisted snapshots. Bump when the snapshot layout
 * changes in a way that the loader cannot read back compatibly.
 */
export const SNAPSHOT_SCHEMA_VERSION = 1;

export type ScanState = 'idle' | 'scanning' | 'ready' | 'error';

export type YearSource = 'top-level' | 'rootward' | 'none';

export type WarningKind =
  | 'symlink-skipped'
  | 'path-escape'
  | 'unreadable'
  | 'metadata-failed';

export interface ScanWarning {
  kind: WarningKind;
  path: string;
  detail?: string;
}

export interface FolderFacet {
  /** Forward-slash, root-relative folder path. Empty string for the root. */
  path: string;
  /** 0 == library root, 1 == first level under root, ... */
  depth: number;
  /** Photos discovered directly inside this folder. */
  directPhotoCount: number;
  /** Photos discovered in this folder and all descendants. */
  photoCount: number;
}

export interface YearFacet {
  year: number;
  photoCount: number;
}

export interface LibraryStatusResponse {
  schemaVersion: number;
  snapshotId: string | null;
  scanState: ScanState;
  libraryRoot: string;
  dataRoot: string;
  photoCount: number;
  warningCount: number;
  scannedAt: string | null;
  scanDurationMs: number | null;
  lastRescanStartedAt: string | null;
  lastRescanCompletedAt: string | null;
  lastError: { message: string; at: string } | null;
  warmLoaded: boolean;
}

export interface LibraryFacetsResponse {
  schemaVersion: number;
  snapshotId: string | null;
  scannedAt: string | null;
  years: YearFacet[];
  folders: FolderFacet[];
  /** Photos in the Starred album this visitor can see. */
  starredCount?: number;
}

export interface LibraryRootUpdateRequest {
  libraryRoot: string;
}

export interface LibraryRootUpdateErrorResponse {
  error:
    | 'library_root_required'
    | 'library_root_invalid'
    | 'data_root_invalid';
  detail?: string;
}

export const LIBRARY_STATUS_PATH = '/api/library/status';
export const LIBRARY_FACETS_PATH = '/api/library/facets';
export const LIBRARY_ROOT_PATH = '/api/library/root';
