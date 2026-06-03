import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  PersistedSnapshotSchema,
  type PersistedSnapshot,
} from './schema.js';

export const SNAPSHOT_FILENAME = 'snapshot.json';
export const CACHE_DIRNAME = 'cache';

export class DataRootError extends Error {
  constructor(message: string, public readonly path: string) {
    super(message);
    this.name = 'DataRootError';
  }
}

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
 * writable. Idempotent. Returns resolved real paths so operator-facing
 * status routes and logs report the exact mounted location in use.
 *
 * Even though derivative generation lands in a later phase, we
 * establish the cache directory now so the path strategy is locked in.
 */
export async function ensureDataPaths(dataRoot: string): Promise<SnapshotPaths> {
  const resolvedDataRoot = await ensureDirectory(dataRoot, 'data root');
  await ensureReadableWritable(resolvedDataRoot, 'data root');
  await probeWritable(resolvedDataRoot, 'data root');

  const cacheDirInput = path.join(resolvedDataRoot, CACHE_DIRNAME);
  const resolvedCacheDir = await ensureDirectory(cacheDirInput, 'cache directory');
  await ensureReadableWritable(resolvedCacheDir, 'cache directory');
  await probeWritable(resolvedCacheDir, 'cache directory');

  return {
    dataRoot: resolvedDataRoot,
    snapshotFile: path.join(resolvedDataRoot, SNAPSHOT_FILENAME),
    cacheDir: resolvedCacheDir,
  };
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

async function ensureDirectory(input: string, label: string): Promise<string> {
  try {
    await fs.mkdir(input, { recursive: true });
  } catch (err) {
    throw new DataRootError(
      `${label} could not be created: ${input} (${errMessage(err)})`,
      input,
    );
  }

  let real: string;
  try {
    real = await fs.realpath(input);
  } catch (err) {
    throw new DataRootError(
      `${label} not found or unreadable: ${input} (${errMessage(err)})`,
      input,
    );
  }

  let stat;
  try {
    stat = await fs.stat(real);
  } catch (err) {
    throw new DataRootError(
      `${label} could not be stat'd: ${real} (${errMessage(err)})`,
      real,
    );
  }

  if (!stat.isDirectory()) {
    throw new DataRootError(`${label} is not a directory: ${real}`, real);
  }

  return real;
}

async function ensureReadableWritable(real: string, label: string): Promise<void> {
  try {
    await fs.access(real, fs.constants.R_OK | fs.constants.W_OK);
  } catch (err) {
    throw new DataRootError(
      `${label} not readable/writable: ${real} (${errMessage(err)})`,
      real,
    );
  }
}

async function probeWritable(real: string, label: string): Promise<void> {
  const probe = path.join(real, `.write-probe-${randomUUID()}`);
  try {
    await fs.writeFile(probe, '', { flag: 'w' });
    await fs.unlink(probe);
  } catch (err) {
    await safeUnlink(probe);
    throw new DataRootError(
      `${label} failed the write probe: ${real} (${errMessage(err)})`,
      real,
    );
  }
}

async function safeUnlink(p: string): Promise<void> {
  try {
    await fs.unlink(p);
  } catch {
    // ignore — best-effort cleanup
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isNodeNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'ENOENT'
  );
}
