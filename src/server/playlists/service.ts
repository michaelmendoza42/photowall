import { randomUUID } from 'node:crypto';
import {
  PLAYLIST_SCHEMA_VERSION,
  PlaylistCreateInputSchema,
  PlaylistUpdateInputSchema,
  type PersistedPlaylist,
  type PlaylistCreateInput,
  type PlaylistUpdateInput,
} from './schema.js';
import {
  deletePlaylist,
  ensurePlaylistsDir,
  isValidPlaylistId,
  listPlaylists,
  readPlaylist,
  resolvePlaylistPaths,
  writePlaylistAtomically,
  type PlaylistStoragePaths,
} from './storage.js';

export class PlaylistValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`invalid playlist input: ${issues.join('; ')}`);
    this.name = 'PlaylistValidationError';
  }
}

export class PlaylistNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`playlist not found: ${id}`);
    this.name = 'PlaylistNotFoundError';
  }
}

/**
 * The PlaylistService is the single owner of playlist persistence.
 * Routes call it; they never touch the filesystem directly.
 *
 * `initialize()` is optional but lets us create the `/data/playlists`
 * directory at startup so the first write doesn't race with
 * directory creation.
 */
export class PlaylistService {
  private paths: PlaylistStoragePaths;

  constructor(dataRoot: string) {
    this.paths = resolvePlaylistPaths(dataRoot);
  }

  async initialize(): Promise<void> {
    this.paths = await ensurePlaylistsDir(this.paths.dataRoot);
  }

  getPaths(): PlaylistStoragePaths {
    return this.paths;
  }

  async list(): Promise<PersistedPlaylist[]> {
    return listPlaylists(this.paths);
  }

  async get(id: string): Promise<PersistedPlaylist | null> {
    if (!isValidPlaylistId(id)) return null;
    return readPlaylist(this.paths, id);
  }

  async create(input: PlaylistCreateInput): Promise<PersistedPlaylist> {
    const parsed = PlaylistCreateInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new PlaylistValidationError(
        parsed.error.issues.map((issue) => formatIssue(issue)),
      );
    }
    const now = new Date().toISOString();
    const record: PersistedPlaylist = {
      schemaVersion: PLAYLIST_SCHEMA_VERSION,
      id: generatePlaylistId(),
      name: parsed.data.name,
      filters: parsed.data.filters,
      createdAt: now,
      updatedAt: now,
    };
    await writePlaylistAtomically(this.paths, record);
    return record;
  }

  async update(
    id: string,
    input: PlaylistUpdateInput,
  ): Promise<PersistedPlaylist> {
    if (!isValidPlaylistId(id)) {
      throw new PlaylistNotFoundError(id);
    }
    const existing = await readPlaylist(this.paths, id);
    if (!existing) {
      throw new PlaylistNotFoundError(id);
    }
    const parsed = PlaylistUpdateInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new PlaylistValidationError(
        parsed.error.issues.map((issue) => formatIssue(issue)),
      );
    }
    const updated: PersistedPlaylist = {
      ...existing,
      name: parsed.data.name ?? existing.name,
      filters: parsed.data.filters ?? existing.filters,
      updatedAt: new Date().toISOString(),
    };
    await writePlaylistAtomically(this.paths, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    if (!isValidPlaylistId(id)) {
      throw new PlaylistNotFoundError(id);
    }
    const removed = await deletePlaylist(this.paths, id);
    if (!removed) {
      throw new PlaylistNotFoundError(id);
    }
  }
}

function formatIssue(issue: {
  path: (string | number)[];
  message: string;
}): string {
  const fieldPath = issue.path.length === 0 ? '(root)' : issue.path.join('.');
  return `${fieldPath}: ${issue.message}`;
}

/**
 * Generate a short, URL-safe playlist id matching the on-disk file
 * naming rule. We strip the dashes from a uuid to keep ids compact and
 * always-lowercase-alphanumeric so they round-trip through the regex.
 */
function generatePlaylistId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 24);
}
