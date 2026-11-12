import path from 'node:path';
import { photoIdFromPath } from '../scanner/walk.js';

/**
 * Re-keys curation state after the library was reorganized outside the app.
 *
 * Stars, private flags, edits, album settings and share links all name
 * photos and folders by root-relative path, so moving or renaming folders
 * on disk orphans them. Each orphaned photo path is matched to where the
 * same file lives now:
 *
 *  - same filename and, when the old size is known, same size;
 *  - otherwise, when the file was renamed, a unique (size, mtime) match;
 *  - several matches count only when they are byte-identical copies, and
 *    then every copy inherits the entry.
 *
 * Orphaned folders follow their photos: a folder maps to a new folder only
 * when every one of its photos that was found landed in that one folder.
 *
 * Nothing is dropped: entries that can't be resolved are kept and reported.
 */

export interface FileFingerprint {
  size: number;
  mtimeMs: number;
}

/** Root-relative photo path → fingerprint. */
export type LibraryIndex = ReadonlyMap<string, FileFingerprint>;

export interface CurationState {
  starred: ReadonlySet<string>;
  private: ReadonlySet<string>;
  edits: Readonly<Record<string, unknown>>;
  onDisplay: readonly string[];
  defaultView: readonly string[];
  shares: readonly ShareRefs[];
}

export interface ShareRefs {
  id: string;
  folders: readonly string[];
  excludeFolders: readonly string[];
  anchorPhotoId: string | null;
}

export type PhotoResolution =
  | { kind: 'moved'; to: string[]; how: 'name' | 'name+size' | 'size+mtime' }
  | { kind: 'ambiguous'; candidates: string[] }
  | { kind: 'missing' };

export type FolderResolution =
  | { kind: 'moved'; to: string }
  | { kind: 'ambiguous'; candidates: string[] }
  | { kind: 'missing' };

export interface ReconcilePlan {
  photos: Map<string, PhotoResolution>;
  folders: Map<string, FolderResolution>;
  /** Edits left on their old path because a new location already has one. */
  editConflicts: { from: string; to: string }[];
  next: CurationState;
}

/** True when every path holds the same bytes. */
export type SameContent = (paths: string[]) => Promise<boolean>;

export async function planReconcile(input: {
  state: CurationState;
  previous: LibraryIndex;
  current: LibraryIndex;
  sameContent: SameContent;
}): Promise<ReconcilePlan> {
  const { state, previous, current, sameContent } = input;
  const byName = indexByName(current);
  const bySizeMtime = indexBySizeMtime(current);

  const photoPaths = new Set([...state.starred, ...state.private, ...Object.keys(state.edits)]);
  const idToPath = new Map([...previous.keys()].map((p) => [photoIdFromPath(p), p]));
  for (const share of state.shares) {
    const anchor = share.anchorPhotoId && idToPath.get(share.anchorPhotoId);
    if (anchor) photoPaths.add(anchor);
  }

  const currentFolders = foldersOf(current);
  const settingFolders = new Set([
    ...state.onDisplay,
    ...state.defaultView,
    ...state.shares.flatMap((s) => [...s.folders, ...s.excludeFolders]),
  ]);
  const orphanFolders = [...settingFolders].filter((f) => f !== '' && !currentFolders.has(f));
  // Folders follow their photos, so resolve those photos too.
  for (const old of previous.keys()) {
    if (orphanFolders.includes(posixDirname(old))) photoPaths.add(old);
  }

  const photos = new Map<string, PhotoResolution>();
  for (const old of [...photoPaths].sort()) {
    if (current.has(old)) continue;
    photos.set(old, await resolvePhoto(old, previous.get(old), current, byName, bySizeMtime, sameContent));
  }

  const folders = new Map<string, FolderResolution>();
  for (const folder of orphanFolders.sort()) {
    folders.set(folder, resolveFolder(folder, previous, photos));
  }

  const movedTo = (p: string): string[] => {
    const r = photos.get(p);
    return r?.kind === 'moved' ? r.to : [p];
  };
  const folderTo = (f: string): string => {
    const r = folders.get(f);
    return r?.kind === 'moved' ? r.to : f;
  };

  const editConflicts: { from: string; to: string }[] = [];
  const edits: Record<string, unknown> = {};
  const movedEdits: [string, string[], unknown][] = [];
  for (const [p, edit] of Object.entries(state.edits)) {
    const r = photos.get(p);
    if (r?.kind === 'moved') movedEdits.push([p, r.to, edit]);
    else edits[p] = edit;
  }
  for (const [from, targets, edit] of movedEdits) {
    let placed = false;
    for (const to of targets) {
      if (to in edits) {
        editConflicts.push({ from, to });
      } else {
        edits[to] = edit;
        placed = true;
      }
    }
    // Every new location already has its own edit: keep this one where it was.
    if (!placed) edits[from] = edit;
  }

  const next: CurationState = {
    starred: new Set([...state.starred].flatMap(movedTo)),
    private: new Set([...state.private].flatMap(movedTo)),
    edits: sortKeys(edits),
    onDisplay: unique(state.onDisplay.map(folderTo)),
    defaultView: unique(state.defaultView.map(folderTo)),
    shares: state.shares.map((share) => {
      const anchor = share.anchorPhotoId && idToPath.get(share.anchorPhotoId);
      const anchorTo = anchor ? movedTo(anchor)[0] : undefined;
      return {
        ...share,
        folders: unique(share.folders.map(folderTo)),
        excludeFolders: unique(share.excludeFolders.map(folderTo)),
        anchorPhotoId: anchorTo && anchorTo !== anchor ? photoIdFromPath(anchorTo) : share.anchorPhotoId,
      };
    }),
  };

  return { photos, folders, editConflicts, next };
}

async function resolvePhoto(
  old: string,
  fingerprint: FileFingerprint | undefined,
  current: LibraryIndex,
  byName: Map<string, string[]>,
  bySizeMtime: Map<string, string[]>,
  sameContent: SameContent,
): Promise<PhotoResolution> {
  const named = byName.get(path.posix.basename(old).toLowerCase()) ?? [];
  let candidates = named;
  let how: 'name' | 'name+size' | 'size+mtime' = 'name';
  if (fingerprint) {
    candidates = named.filter((p) => current.get(p)?.size === fingerprint.size);
    how = 'name+size';
    if (candidates.length === 0) {
      candidates = bySizeMtime.get(sizeMtimeKey(fingerprint)) ?? [];
      how = 'size+mtime';
    }
  }
  if (candidates.length === 0) return { kind: 'missing' };
  if (candidates.length === 1 || (await sameContent(candidates))) {
    return { kind: 'moved', to: [...candidates].sort(), how };
  }
  return { kind: 'ambiguous', candidates: [...candidates].sort() };
}

function resolveFolder(
  folder: string,
  previous: LibraryIndex,
  photos: Map<string, PhotoResolution>,
): FolderResolution {
  const targets = new Set<string>();
  for (const old of previous.keys()) {
    if (posixDirname(old) !== folder) continue;
    const r = photos.get(old);
    if (r?.kind === 'moved') for (const to of r.to) targets.add(posixDirname(to));
  }
  if (targets.size === 0) return { kind: 'missing' };
  if (targets.size === 1) return { kind: 'moved', to: [...targets][0]! };
  return { kind: 'ambiguous', candidates: [...targets].sort() };
}

function indexByName(current: LibraryIndex): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const p of current.keys()) push(map, path.posix.basename(p).toLowerCase(), p);
  return map;
}

function indexBySizeMtime(current: LibraryIndex): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [p, f] of current) push(map, sizeMtimeKey(f), p);
  return map;
}

function sizeMtimeKey(f: FileFingerprint): string {
  return `${f.size}:${Math.trunc(f.mtimeMs)}`;
}

function foldersOf(index: LibraryIndex): Set<string> {
  const folders = new Set<string>();
  for (const p of index.keys()) {
    let dir = posixDirname(p);
    while (dir !== '' && !folders.has(dir)) {
      folders.add(dir);
      dir = posixDirname(dir);
    }
  }
  return folders;
}

function posixDirname(p: string): string {
  const dir = path.posix.dirname(p);
  return dir === '.' ? '' : dir;
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}
