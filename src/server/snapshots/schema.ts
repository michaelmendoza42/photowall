import { z } from 'zod';
import { SNAPSHOT_SCHEMA_VERSION } from '../../shared/api/library.js';
import type { ScanResult } from '../scanner/types.js';

/**
 * Persisted snapshot schema, validated on read so a corrupt or
 * incompatible snapshot does not poison startup. Bump the schema version
 * in `shared/api/library.ts` whenever this shape changes.
 */

const PhotoRecordSchema = z.object({
  id: z.string().min(1),
  relativePath: z.string(),
  directoryPath: z.string(),
  filename: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  aspectRatio: z.number().positive(),
  fileSize: z.number().int().nonnegative(),
  mtimeMs: z.number(),
  year: z.number().int().nullable(),
  yearSource: z.enum(['top-level', 'rootward', 'none']),
});

const FolderFacetSchema = z.object({
  path: z.string(),
  depth: z.number().int().nonnegative(),
  directPhotoCount: z.number().int().nonnegative(),
  photoCount: z.number().int().nonnegative(),
});

const YearFacetSchema = z.object({
  year: z.number().int(),
  photoCount: z.number().int().nonnegative(),
});

const ScanWarningSchema = z.object({
  kind: z.enum([
    'symlink-skipped',
    'path-escape',
    'unreadable',
    'metadata-failed',
  ]),
  path: z.string(),
  detail: z.string().optional(),
});

export const PersistedSnapshotSchema = z.object({
  schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION),
  snapshotId: z.string().min(1),
  libraryRoot: z.string().min(1),
  scannedAt: z.string().min(1),
  scanDurationMs: z.number().nonnegative(),
  photoCount: z.number().int().nonnegative(),
  photos: z.array(PhotoRecordSchema),
  folders: z.array(FolderFacetSchema),
  years: z.array(YearFacetSchema),
  warnings: z.array(ScanWarningSchema),
});

export type PersistedSnapshot = z.infer<typeof PersistedSnapshotSchema>;

export function buildSnapshot(
  scan: ScanResult,
  snapshotId: string,
): PersistedSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    snapshotId,
    libraryRoot: scan.libraryRoot,
    scannedAt: scan.scannedAt,
    scanDurationMs: scan.scanDurationMs,
    photoCount: scan.photos.length,
    photos: scan.photos,
    folders: scan.folders,
    years: scan.years,
    warnings: scan.warnings,
  };
}
