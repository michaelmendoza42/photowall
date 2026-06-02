import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  PlaylistRecordSchema,
  type PersistedPlaylist,
} from './schema.js';

export const PLAYLISTS_DIRNAME = 'playlists';
/**
 * The playlist id is also used as the on-disk filename. We constrain
 * it tightly (lowercase alphanumeric + dash) so a request with a
 * traversal-ish id like `../snapshot.json` is rejected before any
 * filesystem call.
 */
export const PLAYLIST_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface PlaylistStoragePaths {
  dataRoot: string;
  playlistsDir: string;
}

export function resolvePlaylistPaths(dataRoot: string): PlaylistStoragePaths {
  return {
    dataRoot,
    playlistsDir: path.join(dataRoot, PLAYLISTS_DIRNAME),
  };
}

export async function ensurePlaylistsDir(
  dataRoot: string,
): Promise<PlaylistStoragePaths> {
  const paths = resolvePlaylistPaths(dataRoot);
  await fs.mkdir(paths.playlistsDir, { recursive: true });
  return paths;
}

export function isValidPlaylistId(id: string): boolean {
  return PLAYLIST_ID_PATTERN.test(id);
}

function playlistFilePath(paths: PlaylistStoragePaths, id: string): string {
  if (!isValidPlaylistId(id)) {
    throw new Error(`invalid playlist id: ${id}`);
  }
  return path.join(paths.playlistsDir, `${id}.json`);
}

export async function readPlaylist(
  paths: PlaylistStoragePaths,
  id: string,
): Promise<PersistedPlaylist | null> {
  if (!isValidPlaylistId(id)) return null;
  let raw: string;
  try {
    raw = await fs.readFile(playlistFilePath(paths, id), 'utf8');
  } catch (err) {
    if (isNodeNotFound(err)) return null;
    throw err;
  }
  return parsePlaylistFile(raw);
}

export async function listPlaylists(
  paths: PlaylistStoragePaths,
): Promise<PersistedPlaylist[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(paths.playlistsDir);
  } catch (err) {
    if (isNodeNotFound(err)) return [];
    throw err;
  }
  const out: PersistedPlaylist[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const id = entry.slice(0, -'.json'.length);
    if (!isValidPlaylistId(id)) continue;
    const raw = await fs.readFile(path.join(paths.playlistsDir, entry), 'utf8');
    const parsed = parsePlaylistFile(raw);
    if (parsed) out.push(parsed);
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  return out;
}

export async function writePlaylistAtomically(
  paths: PlaylistStoragePaths,
  playlist: PersistedPlaylist,
): Promise<void> {
  // Validate before touching disk so a programming error here surfaces
  // before producing a half-written file.
  PlaylistRecordSchema.parse(playlist);
  const target = playlistFilePath(paths, playlist.id);
  const tmp = `${target}.${randomUUID()}.tmp`;
  const json = JSON.stringify(playlist);
  await fs.writeFile(tmp, json, { flag: 'w' });
  try {
    await fs.rename(tmp, target);
  } catch (err) {
    await safeUnlink(tmp);
    throw err;
  }
}

export async function deletePlaylist(
  paths: PlaylistStoragePaths,
  id: string,
): Promise<boolean> {
  if (!isValidPlaylistId(id)) return false;
  try {
    await fs.unlink(playlistFilePath(paths, id));
    return true;
  } catch (err) {
    if (isNodeNotFound(err)) return false;
    throw err;
  }
}

function parsePlaylistFile(raw: string): PersistedPlaylist | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = PlaylistRecordSchema.safeParse(parsed);
  return result.success ? result.data : null;
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
