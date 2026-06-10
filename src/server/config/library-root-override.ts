import path from 'node:path';
import { promises as fs } from 'node:fs';

const RUNTIME_CONFIG_DIR = 'runtime-config';
const LIBRARY_ROOT_OVERRIDE_FILE = 'library-root.json';
const LIBRARY_ROOT_OVERRIDE_SCHEMA_VERSION = 1;

interface PersistedLibraryRootOverride {
  schemaVersion: number;
  libraryRoot: string;
  updatedAt: string;
}

function overrideDir(dataRoot: string): string {
  return path.join(dataRoot, RUNTIME_CONFIG_DIR);
}

export function libraryRootOverridePath(dataRoot: string): string {
  return path.join(overrideDir(dataRoot), LIBRARY_ROOT_OVERRIDE_FILE);
}

export async function readLibraryRootOverride(
  dataRoot: string,
): Promise<string | null> {
  let raw: string;
  try {
    raw = await fs.readFile(libraryRootOverridePath(dataRoot), 'utf8');
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as { schemaVersion?: unknown }).schemaVersion !==
      LIBRARY_ROOT_OVERRIDE_SCHEMA_VERSION ||
    typeof (parsed as { libraryRoot?: unknown }).libraryRoot !== 'string'
  ) {
    return null;
  }

  const libraryRoot = (parsed as PersistedLibraryRootOverride).libraryRoot.trim();
  return libraryRoot.length > 0 ? libraryRoot : null;
}

export async function writeLibraryRootOverride(
  dataRoot: string,
  libraryRoot: string,
): Promise<void> {
  const dir = overrideDir(dataRoot);
  await fs.mkdir(dir, { recursive: true });
  const payload: PersistedLibraryRootOverride = {
    schemaVersion: LIBRARY_ROOT_OVERRIDE_SCHEMA_VERSION,
    libraryRoot,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(
    libraryRootOverridePath(dataRoot),
    JSON.stringify(payload, null, 2),
    'utf8',
  );
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}
