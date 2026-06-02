import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PersistedSnapshot } from '../snapshots/schema.js';

/** Reasons a source path lookup may fail. Each maps to an HTTP outcome. */
export type SourceResolutionFailure =
  | { kind: 'photo_not_found' }
  | { kind: 'source_outside_root'; resolved: string }
  | { kind: 'source_unreadable'; detail: string };

export type SourceResolution =
  | {
      ok: true;
      photoId: string;
      relativePath: string;
      absolutePath: string;
      mtimeMs: number;
      fileSize: number;
    }
  | { ok: false; failure: SourceResolutionFailure };

/**
 * Resolve a `photoId` to a concrete on-disk source path, root-bounded
 * against the snapshot's recorded library root.
 *
 * Defense-in-depth contract:
 *   1. The photo must exist in the active snapshot. A photoId is never
 *      treated as a path: arbitrary `..` or absolute strings cannot
 *      reach the filesystem because they will not match any snapshot
 *      photo and resolution fails with `photo_not_found`.
 *   2. The resolved absolute path is realpath-checked and must remain
 *      under the snapshot's library root. This catches the (otherwise
 *      impossible) corrupt-snapshot case where a stored relativePath
 *      would escape the root via a symlinked intermediate directory
 *      that was introduced after the scan.
 *   3. The file must exist and be readable now — a removed-since-scan
 *      file reports `source_unreadable` rather than 500ing the route.
 */
export async function resolveSafeSourcePath(
  snapshot: PersistedSnapshot,
  photoId: string,
): Promise<SourceResolution> {
  const photo = snapshot.photos.find((p) => p.id === photoId);
  if (!photo) {
    return { ok: false, failure: { kind: 'photo_not_found' } };
  }

  const libraryRoot = snapshot.libraryRoot;
  const joined = path.join(libraryRoot, photo.relativePath);

  let real: string;
  try {
    real = await fs.realpath(joined);
  } catch (err) {
    return {
      ok: false,
      failure: {
        kind: 'source_unreadable',
        detail: err instanceof Error ? err.message : String(err),
      },
    };
  }

  if (!isWithinRoot(real, libraryRoot)) {
    return {
      ok: false,
      failure: { kind: 'source_outside_root', resolved: real },
    };
  }

  let stat;
  try {
    stat = await fs.stat(real);
  } catch (err) {
    return {
      ok: false,
      failure: {
        kind: 'source_unreadable',
        detail: err instanceof Error ? err.message : String(err),
      },
    };
  }
  if (!stat.isFile()) {
    return {
      ok: false,
      failure: {
        kind: 'source_unreadable',
        detail: 'resolved source is not a regular file',
      },
    };
  }

  return {
    ok: true,
    photoId: photo.id,
    relativePath: photo.relativePath,
    absolutePath: real,
    mtimeMs: stat.mtimeMs,
    fileSize: stat.size,
  };
}

function isWithinRoot(candidate: string, root: string): boolean {
  if (candidate === root) return true;
  const withSep = root.endsWith(path.sep) ? root : root + path.sep;
  return candidate.startsWith(withSep);
}
