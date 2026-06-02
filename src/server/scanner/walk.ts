import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type {
  FolderFacet,
  ScanWarning,
  YearFacet,
} from '../../shared/api/library.js';
import { extractImageMetadata } from './metadata.js';
import { normalizeRelative, relativeDirname } from './paths.js';
import {
  isHiddenName,
  isSupportedImageFilename,
} from './supported.js';
import type { PhotoRecord, ScanResult } from './types.js';
import { deriveYearFromRelativeDir } from './year.js';

export interface ScanLogger {
  debug?: (obj: unknown, msg?: string) => void;
  warn?: (obj: unknown, msg?: string) => void;
}

export interface ScanOptions {
  logger?: ScanLogger;
}

/**
 * Recursively scan the configured library root and produce a ScanResult.
 *
 * Filesystem rules enforced here:
 *  - root must be realpath-resolved and readable (caller resolved)
 *  - traversal is strictly bounded to `rootRealPath`
 *  - symlinks are never followed; encountering one emits a warning
 *  - hidden files / hidden directories are silently skipped
 *  - unsupported file extensions are silently skipped (not warnings —
 *    photo libraries routinely contain README/notes/sidecar files)
 *  - unreadable / corrupt images emit a warning and are dropped
 *
 * Returned `photos` are sorted by normalized relative path so downstream
 * pagination has a deterministic default order.
 */
export async function scanLibrary(
  rootRealPath: string,
  options: ScanOptions = {},
): Promise<ScanResult> {
  const startedAtMs = Date.now();
  const warnings: ScanWarning[] = [];
  const photos: PhotoRecord[] = [];

  await walk(rootRealPath, rootRealPath, photos, warnings, options.logger);

  photos.sort((a, b) => (a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0));

  const folders = buildFolderFacets(photos);
  const years = buildYearFacets(photos);
  const finishedAtMs = Date.now();

  return {
    libraryRoot: rootRealPath,
    scannedAt: new Date(finishedAtMs).toISOString(),
    scanDurationMs: finishedAtMs - startedAtMs,
    photos,
    folders,
    years,
    warnings,
  };
}

async function walk(
  rootRealPath: string,
  currentAbsDir: string,
  photos: PhotoRecord[],
  warnings: ScanWarning[],
  logger: ScanLogger | undefined,
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(currentAbsDir, { withFileTypes: true });
  } catch (err) {
    const rel = normalizeRelative(currentAbsDir, rootRealPath) ?? currentAbsDir;
    warnings.push({
      kind: 'unreadable',
      path: rel,
      detail: errorMessage(err),
    });
    return;
  }

  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  for (const entry of entries) {
    if (isHiddenName(entry.name)) {
      logger?.debug?.({ entry: entry.name, dir: currentAbsDir }, 'skipping hidden entry');
      continue;
    }

    const entryAbs = path.join(currentAbsDir, entry.name);
    const entryRel = normalizeRelative(entryAbs, rootRealPath);
    if (entryRel === null) {
      warnings.push({
        kind: 'path-escape',
        path: entry.name,
        detail: 'entry resolves outside the configured root',
      });
      continue;
    }

    if (entry.isSymbolicLink()) {
      warnings.push({
        kind: 'symlink-skipped',
        path: entryRel,
      });
      continue;
    }

    if (entry.isDirectory()) {
      await walk(rootRealPath, entryAbs, photos, warnings, logger);
      continue;
    }

    if (!entry.isFile()) {
      // sockets, devices, fifos — silently ignored.
      continue;
    }

    if (!isSupportedImageFilename(entry.name)) {
      logger?.debug?.({ entry: entryRel }, 'skipping unsupported file');
      continue;
    }

    try {
      const meta = await extractImageMetadata(entryAbs);
      const directoryPath = relativeDirname(entryRel);
      const { year, source } = deriveYearFromRelativeDir(directoryPath);
      photos.push({
        id: photoIdFromPath(entryRel),
        relativePath: entryRel,
        directoryPath,
        filename: entry.name,
        width: meta.width,
        height: meta.height,
        aspectRatio: meta.aspectRatio,
        fileSize: meta.fileSize,
        mtimeMs: meta.mtimeMs,
        year,
        yearSource: source,
      });
    } catch (err) {
      warnings.push({
        kind: 'metadata-failed',
        path: entryRel,
        detail: errorMessage(err),
      });
    }
  }
}

function photoIdFromPath(relativePath: string): string {
  return createHash('sha1').update(relativePath).digest('hex').slice(0, 16);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function buildFolderFacets(photos: PhotoRecord[]): FolderFacet[] {
  const facetMap = new Map<string, FolderFacet>();
  facetMap.set('', { path: '', depth: 0, directPhotoCount: 0, photoCount: 0 });

  for (const photo of photos) {
    // Walk the directory chain of this photo, ensuring every ancestor
    // folder exists in the facet map and bumping subtree counts.
    const segments = photo.directoryPath === '' ? [] : photo.directoryPath.split('/');

    // root subtree always increments
    const rootFacet = facetMap.get('')!;
    rootFacet.photoCount += 1;
    if (photo.directoryPath === '') {
      rootFacet.directPhotoCount += 1;
    }

    for (let i = 0; i < segments.length; i += 1) {
      const folderPath = segments.slice(0, i + 1).join('/');
      let facet = facetMap.get(folderPath);
      if (!facet) {
        facet = {
          path: folderPath,
          depth: i + 1,
          directPhotoCount: 0,
          photoCount: 0,
        };
        facetMap.set(folderPath, facet);
      }
      facet.photoCount += 1;
      if (i === segments.length - 1) {
        facet.directPhotoCount += 1;
      }
    }
  }

  return [...facetMap.values()].sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });
}

function buildYearFacets(photos: PhotoRecord[]): YearFacet[] {
  const counts = new Map<number, number>();
  for (const photo of photos) {
    if (photo.year === null) continue;
    counts.set(photo.year, (counts.get(photo.year) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([year, photoCount]) => ({ year, photoCount }))
    .sort((a, b) => a.year - b.year);
}
