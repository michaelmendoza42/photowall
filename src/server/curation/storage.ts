import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import { FOLDER_PATH_PATTERN } from '../../shared/api/curation.js';

/**
 * Curation state lives in its own folder, apart from the rebuildable
 * snapshot and thumbnail cache, so it can be backed up on its own and
 * shared between servers that read the same library:
 *
 *   albums.json      which folders are on display, and the default view
 *   moves.log        one JSON line per photo move the app made
 *   edits.json       light edits, one recipe per photo path (originals are never changed)
 *   edits.log        one JSON line per edit saved or reverted
 *   shares/<id>.json share links
 *   session-secret   signs curator sessions
 *   curator-pin      the PIN chosen on /curate, hashed (delete it to choose again)
 *   setup-code       one-time code for choosing that PIN; also printed in the log
 */

export const CURATION_SCHEMA_VERSION = 1;

const FolderPathSchema = z
  .string()
  .regex(FOLDER_PATH_PATTERN, 'folder must be forward-slash and root-relative');

export const AlbumSettingsSchema = z.object({
  schemaVersion: z.literal(CURATION_SCHEMA_VERSION),
  onDisplay: z.array(FolderPathSchema),
  defaultView: z.array(FolderPathSchema),
  defaultStarred: z.boolean().default(false),
});

export type AlbumSettings = z.infer<typeof AlbumSettingsSchema>;

export const EMPTY_ALBUM_SETTINGS: AlbumSettings = {
  schemaVersion: CURATION_SCHEMA_VERSION,
  onDisplay: [],
  defaultView: [],
  defaultStarred: false,
};

export interface CurationPaths {
  root: string;
  albumsFile: string;
  movesLog: string;
  editsFile: string;
  /** Paths of the photos the curator starred (Favorites). */
  starsFile: string;
  /** Paths of the photos guests never see. */
  privateFile: string;
  editsLog: string;
  sharesDir: string;
  secretFile: string;
  /** The curator PIN chosen in the browser, stored hashed. */
  pinFile: string;
  /** One-time code that proves you run the server, needed to choose the PIN. */
  setupCodeFile: string;
}

export class CurationRootError extends Error {
  constructor(message: string, public readonly path: string) {
    super(message);
    this.name = 'CurationRootError';
  }
}

export async function ensureCurationPaths(root: string): Promise<CurationPaths> {
  try {
    await fs.mkdir(path.join(root, 'shares'), { recursive: true });
    await fs.access(root, fs.constants.R_OK | fs.constants.W_OK);
  } catch (err) {
    throw new CurationRootError(
      `curation root is not a writable directory: ${root} (${errMessage(err)})`,
      root,
    );
  }
  const real = await fs.realpath(root);
  return {
    root: real,
    albumsFile: path.join(real, 'albums.json'),
    movesLog: path.join(real, 'moves.log'),
    editsFile: path.join(real, 'edits.json'),
    starsFile: path.join(real, 'starred.json'),
    privateFile: path.join(real, 'private.json'),
    editsLog: path.join(real, 'edits.log'),
    sharesDir: path.join(real, 'shares'),
    secretFile: path.join(real, 'session-secret'),
    pinFile: path.join(real, 'curator-pin'),
    setupCodeFile: path.join(real, 'setup-code'),
  };
}

export async function readAlbumSettings(paths: CurationPaths): Promise<AlbumSettings> {
  const parsed = await readJsonFile(paths.albumsFile);
  if (parsed === null) return EMPTY_ALBUM_SETTINGS;
  const result = AlbumSettingsSchema.safeParse(parsed);
  if (!result.success) {
    // Never start over silently: an empty file would put every album
    // back in storage.
    throw new CurationRootError(
      `albums.json is not valid curation settings: ${result.error.message}`,
      paths.albumsFile,
    );
  }
  return result.data;
}

export async function writeAlbumSettings(
  paths: CurationPaths,
  settings: AlbumSettings,
): Promise<void> {
  AlbumSettingsSchema.parse(settings);
  await writeFileAtomically(paths.albumsFile, `${JSON.stringify(settings, null, 2)}\n`);
}

export interface MoveLogEntry {
  at: string;
  action: 'hide' | 'restore';
  /** Root-relative [from, to] path for each file moved together. */
  files: [string, string][];
}

export async function appendMoveLog(
  paths: CurationPaths,
  entry: MoveLogEntry,
): Promise<void> {
  await fs.appendFile(paths.movesLog, `${JSON.stringify(entry)}\n`, 'utf8');
}

/** The secret that signs curator sessions, created on first use. */
export async function readOrCreateSessionSecret(paths: CurationPaths): Promise<string> {
  try {
    const existing = (await fs.readFile(paths.secretFile, 'utf8')).trim();
    if (existing.length >= 32) return existing;
  } catch (err) {
    if (!isNodeNotFound(err)) throw err;
  }
  const secret = randomBytes(32).toString('hex');
  await writeFileAtomically(paths.secretFile, secret, 0o600);
  return secret;
}

export async function readJsonFile(file: string): Promise<unknown | null> {
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (err) {
    if (isNodeNotFound(err)) return null;
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export async function writeFileAtomically(
  target: string,
  contents: string,
  mode?: number,
): Promise<void> {
  const tmp = `${target}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, contents, { flag: 'w', ...(mode ? { mode } : {}) });
  try {
    await fs.rename(tmp, target);
  } catch (err) {
    await fs.unlink(tmp).catch(() => undefined);
    throw err;
  }
}

export function isNodeNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'ENOENT'
  );
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

/** The stored PIN hash (`scrypt$salt$hash`), or null when none was chosen. */
export async function readPinHash(paths: CurationPaths): Promise<string | null> {
  try {
    const stored = (await fs.readFile(paths.pinFile, 'utf8')).trim();
    return stored.startsWith('scrypt$') ? stored : null;
  } catch (err) {
    if (isNodeNotFound(err)) return null;
    throw err;
  }
}

export async function writePinHash(paths: CurationPaths, pin: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(pin, salt, 32)).toString('hex');
  const stored = `scrypt$${salt}$${hash}`;
  await writeFileAtomically(paths.pinFile, stored, 0o600);
  return stored;
}

export async function pinMatchesHash(pin: string, stored: string): Promise<boolean> {
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const actual = await scrypt(pin, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A fresh one-time setup code like `4821-9930`, saved for the operator. */
export async function createSetupCode(paths: CurationPaths): Promise<string> {
  const digits = Array.from(randomBytes(8), (byte) => String(byte % 10)).join('');
  const code = `${digits.slice(0, 4)}-${digits.slice(4)}`;
  await writeFileAtomically(paths.setupCodeFile, `${code}\n`, 0o600);
  return code;
}

export async function removeSetupCode(paths: CurationPaths): Promise<void> {
  await fs.unlink(paths.setupCodeFile).catch(() => undefined);
}

const PathSetFileSchema = z.object({
  schemaVersion: z.literal(CURATION_SCHEMA_VERSION),
  photos: z.array(z.string()),
});

/**
 * A per-photo flag kept as a list of root-relative paths: `starred.json`
 * (Favorites) and `private.json` (never shown to guests).
 */
export type PhotoFlag = 'starred' | 'private';

export function photoFlagFile(paths: CurationPaths, flag: PhotoFlag): string {
  return flag === 'starred' ? paths.starsFile : paths.privateFile;
}

export async function readPhotoFlag(paths: CurationPaths, flag: PhotoFlag): Promise<Set<string>> {
  const file = photoFlagFile(paths, flag);
  const parsed = await readJsonFile(file);
  if (parsed === null) return new Set();
  const result = PathSetFileSchema.safeParse(parsed);
  if (!result.success) {
    // Never start over silently: that would clear the flag on every photo.
    throw new CurationRootError(`${path.basename(file)} is not valid: ${result.error.message}`, file);
  }
  return new Set(result.data.photos);
}

export async function writePhotoFlag(
  paths: CurationPaths,
  flag: PhotoFlag,
  photos: ReadonlySet<string>,
): Promise<void> {
  const body = { schemaVersion: CURATION_SCHEMA_VERSION, photos: [...photos].sort() };
  await writeFileAtomically(photoFlagFile(paths, flag), `${JSON.stringify(body, null, 2)}\n`);
}
