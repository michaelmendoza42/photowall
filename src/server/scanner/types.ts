import type {
  FolderFacet,
  ScanWarning,
  YearFacet,
  YearSource,
} from '../../shared/api/library.js';

/**
 * Per-photo record retained inside the active snapshot. The shape is
 * stable across the scanner, snapshot persistence layer, and any later
 * query/pagination work that needs to operate on the snapshot.
 */
export interface PhotoRecord {
  /** Deterministic id derived from the normalized relative path. */
  id: string;
  /** Forward-slash, root-relative path. */
  relativePath: string;
  /** Forward-slash, root-relative directory. Empty string for root files. */
  directoryPath: string;
  filename: string;
  width: number;
  height: number;
  aspectRatio: number;
  fileSize: number;
  mtimeMs: number;
  year: number | null;
  yearSource: YearSource;
}

export interface ScanResult {
  /** Realpath-resolved library root the scan ran against. */
  libraryRoot: string;
  scannedAt: string;
  scanDurationMs: number;
  photos: PhotoRecord[];
  folders: FolderFacet[];
  years: YearFacet[];
  warnings: ScanWarning[];
}
