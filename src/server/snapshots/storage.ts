import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  PersistedSnapshotSchema,
  type PersistedSnapshot,
} from './schema.js';

export const SNAPSHOT_FILENAME = 'snapshot.json';
export const CACHE_DIRNAME = 'cache';

export interface SnapshotPaths {
  dataRoot: string;
  snapshotFile: string;
  cacheDir: string;
}

export function resolveSnapshotPaths(dataRoot: string): SnapshotPaths {
  return {
    dataRoot,
    snapshotFile: path.join(dataRoot, SNAPSHOT_FILENAME),
    cacheDir: path.join(dataRoot, CACHE_DIRNAME),
  };
}

/**
 * Ensure the data root + derivative cache directory exist and are
 * writable. Idempotent. Returns the resolved snapshot paths.
 *
 * Even though derivative generation lands in a later phase, we
 * establish the cache directory now so the path strategy is locked in.
 */
export async function ensureDataPaths(dataRoot: string): Promise<SnapshotPaths> {
  const paths = resolveSnapshotPaths(dataRoot);
  await fs.mkdir(paths.dataRoot, { recursive: true });
  await fs.mkdir(paths.cacheDir, { recursive: true });

  // Probe writability with a short-lived sentinel file so misconfigured
  // mounts surface a clear error at startup rather than mid-scan.
  const probe = path.join(paths.dataRoot, '.write-probe');
  await fs.writeFile(probe, '', { flag: 'w' });
  await fs.unlink(probe);

  return paths;
}

export async function readSnapshotIfPresent(
  snapshotFile: string,
): Promise<PersistedSnapshot | null> {
  let raw: string;
  try {
    raw = await fs.readFile(snapshotFile, 'utf8');
  } catch (err) {
    if (isNodeNotFound(err)) return null;
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = PersistedSnapshotSchema.safeParse(parsed);
  if (!result.success) {
    return null;
  }
  return result.data;
}

/**
 * Atomic snapshot write: stage to a sibling tmp file and rename. Rename
 * is atomic within the same filesystem, which we already require because
 * cache lives next to the snapshot.
 */
export async function writeSnapshotAtomically(
  snapshotFile: string,
  snapshot: PersistedSnapshot,
): Promise<void> {
  const tmp = `${snapshotFile}.${randomUUID()}.tmp`;
  const json = JSON.stringify(snapshot);
  await fs.writeFile(tmp, json, { flag: 'w' });
  try {
    await fs.rename(tmp, snapshotFile);
  } catch (err) {
    await safeUnlink(tmp);
    throw err;
  }
}

async function safeUnlink(p: string): Promise<void> {
  try {
    await fs.unlink(p);
  } catch {
    // ignore — best-effort cleanup
  }
}

function isNodeNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'ENOENT'
  );
}
