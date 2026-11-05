import { promises as fs } from 'node:fs';
import path from 'node:path';
import { HIDDEN_FOLDER_NAME } from '../../shared/api/curation.js';
import { isHiddenName, isSupportedImageFilename } from '../scanner/supported.js';

/**
 * Moves a photo, together with its companion files, between an album
 * and the album's `_hidden` folder. Moves are plain renames inside the
 * library: nothing is copied, deleted or overwritten. If any rename
 * fails, the ones already done are put back.
 */

export type MoveFailureKind =
  | 'destination_exists'
  | 'cross_device'
  | 'source_invalid'
  | 'move_failed';

export class PhotoMoveError extends Error {
  constructor(
    public readonly kind: MoveFailureKind,
    message: string,
  ) {
    super(message);
    this.name = 'PhotoMoveError';
  }
}

export interface PlannedMove {
  /** Root-relative [from, to] for the photo first, then its companions. */
  files: [string, string][];
  /** The photo's new root-relative path. */
  photoPath: string;
}

/**
 * Files that belong with a photo: same name stem, not themselves a
 * photo the wall shows. Covers Live Photo `.mov`, RAW pairs and edit
 * sidecars (`IMG_1.xmp`, `IMG_1.jpg.xmp`, `IMG_1.aae`).
 */
export function isCompanionFile(photoFilename: string, candidate: string): boolean {
  if (candidate === photoFilename || isHiddenName(candidate)) return false;
  const stem = photoFilename.slice(0, photoFilename.length - path.extname(photoFilename).length);
  if (!candidate.startsWith(`${stem}.`)) return false;
  return !isSupportedImageFilename(candidate);
}

/** Where a photo goes when hidden: `<album>/_hidden/<file>`. */
export function hiddenDestinationDir(directoryPath: string): string {
  return directoryPath === '' ? HIDDEN_FOLDER_NAME : `${directoryPath}/${HIDDEN_FOLDER_NAME}`;
}

/** Where a hidden photo goes back to: the album holding its `_hidden` folder. */
export function restoreDestinationDir(directoryPath: string): string | null {
  const segments = directoryPath.split('/');
  if (segments.at(-1) !== HIDDEN_FOLDER_NAME) return null;
  return segments.slice(0, -1).join('/');
}

export async function movePhoto(input: {
  libraryRoot: string;
  relativePath: string;
  toDirectory: string;
}): Promise<PlannedMove> {
  const { libraryRoot } = input;
  const fromDirectory = input.relativePath.includes('/')
    ? input.relativePath.slice(0, input.relativePath.lastIndexOf('/'))
    : '';
  const filename = input.relativePath.split('/').at(-1) ?? '';
  const fromAbsDir = resolveInside(libraryRoot, fromDirectory);
  const toAbsDir = resolveInside(libraryRoot, input.toDirectory);

  await assertPlainFile(path.join(fromAbsDir, filename));

  const entries = await fs.readdir(fromAbsDir, { withFileTypes: true });
  const companions = entries
    .filter((entry) => entry.isFile() && isCompanionFile(filename, entry.name))
    .map((entry) => entry.name)
    .sort();
  const names = [filename, ...companions];

  await fs.mkdir(toAbsDir, { recursive: true });
  const toStat = await fs.lstat(toAbsDir);
  if (!toStat.isDirectory() || toStat.isSymbolicLink()) {
    throw new PhotoMoveError('source_invalid', `${input.toDirectory} is not a plain folder`);
  }
  // Re-check after mkdir: the destination must still resolve inside the root.
  resolveInside(libraryRoot, path.relative(libraryRoot, await fs.realpath(toAbsDir)));

  for (const name of names) {
    if (await exists(path.join(toAbsDir, name))) {
      throw new PhotoMoveError(
        'destination_exists',
        `${joinRelative(input.toDirectory, name)} already exists`,
      );
    }
  }

  const done: string[] = [];
  try {
    for (const name of names) {
      await fs.rename(path.join(fromAbsDir, name), path.join(toAbsDir, name));
      done.push(name);
    }
  } catch (err) {
    for (const name of done.reverse()) {
      await fs
        .rename(path.join(toAbsDir, name), path.join(fromAbsDir, name))
        .catch(() => undefined);
    }
    if ((err as { code?: string }).code === 'EXDEV') {
      throw new PhotoMoveError(
        'cross_device',
        'the destination folder is on a different disk, so the photo was left where it was',
      );
    }
    throw new PhotoMoveError(
      'move_failed',
      err instanceof Error ? err.message : String(err),
    );
  }

  return {
    files: names.map((name) => [
      joinRelative(fromDirectory, name),
      joinRelative(input.toDirectory, name),
    ]),
    photoPath: joinRelative(input.toDirectory, filename),
  };
}

function resolveInside(root: string, relative: string): string {
  const resolved = path.resolve(root, relative);
  const back = path.relative(root, resolved);
  if (back.startsWith('..') || path.isAbsolute(back)) {
    throw new PhotoMoveError('source_invalid', `${relative} is outside the library`);
  }
  return resolved;
}

async function assertPlainFile(file: string): Promise<void> {
  let stat;
  try {
    stat = await fs.lstat(file);
  } catch (err) {
    throw new PhotoMoveError(
      'source_invalid',
      `photo file not found: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new PhotoMoveError('source_invalid', 'photo is not a plain file');
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.lstat(file);
    return true;
  } catch {
    return false;
  }
}

function joinRelative(directory: string, name: string): string {
  return directory === '' ? name : `${directory}/${name}`;
}
