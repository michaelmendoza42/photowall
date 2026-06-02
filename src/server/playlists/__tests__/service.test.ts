import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PlaylistNotFoundError,
  PlaylistService,
  PlaylistValidationError,
} from '../service.js';
import { resolvePlaylistPaths } from '../storage.js';

describe('PlaylistService', () => {
  let dataRoot: string;

  beforeEach(async () => {
    dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-wall-playlists-'));
  });

  afterEach(async () => {
    await fs.rm(dataRoot, { recursive: true, force: true });
  });

  it('initialize creates the playlists directory', async () => {
    const service = new PlaylistService(dataRoot);
    await service.initialize();
    const paths = resolvePlaylistPaths(dataRoot);
    const stat = await fs.stat(paths.playlistsDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('list is empty before any playlists exist', async () => {
    const service = new PlaylistService(dataRoot);
    await service.initialize();
    expect(await service.list()).toEqual([]);
  });

  it('create persists a playlist, get reads it back, and a second service sees it', async () => {
    const service = new PlaylistService(dataRoot);
    await service.initialize();
    const created = await service.create({
      name: 'Iceland 2024',
      filters: { years: [2024], folders: ['2024/travel-iceland'] },
    });
    expect(created.id).toMatch(/^[a-z0-9-]+$/);
    expect(created.name).toBe('Iceland 2024');
    expect(created.filters.years).toEqual([2024]);
    expect(created.createdAt).toBe(created.updatedAt);

    const fetched = await service.get(created.id);
    expect(fetched?.id).toBe(created.id);

    const second = new PlaylistService(dataRoot);
    await second.initialize();
    const list = await second.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(created.id);
  });

  it('update changes name and/or filters and bumps updatedAt', async () => {
    const service = new PlaylistService(dataRoot);
    await service.initialize();
    const created = await service.create({
      name: 'before',
      filters: { years: [2023], folders: [] },
    });

    // Force a measurable updatedAt delta on fast machines.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const updated = await service.update(created.id, {
      name: 'after',
      filters: { years: [2024], folders: ['2024'] },
    });
    expect(updated.name).toBe('after');
    expect(updated.filters.years).toEqual([2024]);
    expect(updated.filters.folders).toEqual(['2024']);
    expect(updated.updatedAt > created.updatedAt).toBe(true);
    expect(updated.createdAt).toBe(created.createdAt);
  });

  it('delete removes the file and subsequent get returns null', async () => {
    const service = new PlaylistService(dataRoot);
    await service.initialize();
    const created = await service.create({
      name: 'gone',
      filters: { years: [], folders: [] },
    });
    await service.delete(created.id);
    expect(await service.get(created.id)).toBeNull();

    const paths = resolvePlaylistPaths(dataRoot);
    const remaining = await fs.readdir(paths.playlistsDir);
    expect(remaining.filter((f) => f.endsWith('.json'))).toEqual([]);
  });

  it('update throws PlaylistNotFoundError for an unknown id', async () => {
    const service = new PlaylistService(dataRoot);
    await service.initialize();
    await expect(
      service.update('does-not-exist', { name: 'nope' }),
    ).rejects.toBeInstanceOf(PlaylistNotFoundError);
  });

  it('delete throws PlaylistNotFoundError for an unknown id', async () => {
    const service = new PlaylistService(dataRoot);
    await service.initialize();
    await expect(service.delete('does-not-exist')).rejects.toBeInstanceOf(
      PlaylistNotFoundError,
    );
  });

  it('create rejects an empty name', async () => {
    const service = new PlaylistService(dataRoot);
    await service.initialize();
    await expect(
      service.create({ name: '', filters: { years: [], folders: [] } }),
    ).rejects.toBeInstanceOf(PlaylistValidationError);
  });

  it('create rejects malformed folder paths', async () => {
    const service = new PlaylistService(dataRoot);
    await service.initialize();
    await expect(
      service.create({
        name: 'bad folder',
        filters: { years: [], folders: ['/leading-slash'] },
      }),
    ).rejects.toBeInstanceOf(PlaylistValidationError);
    await expect(
      service.create({
        name: 'bad folder',
        filters: { years: [], folders: ['trailing/'] },
      }),
    ).rejects.toBeInstanceOf(PlaylistValidationError);
  });

  it('get returns null for an unsafe / non-canonical id', async () => {
    const service = new PlaylistService(dataRoot);
    await service.initialize();
    expect(await service.get('../snapshot')).toBeNull();
    expect(await service.get('Capital-Letters')).toBeNull();
  });

  it('ignores corrupt playlist files when listing', async () => {
    const service = new PlaylistService(dataRoot);
    await service.initialize();
    const good = await service.create({
      name: 'keeper',
      filters: { years: [2024], folders: [] },
    });
    const paths = resolvePlaylistPaths(dataRoot);
    await fs.writeFile(
      path.join(paths.playlistsDir, 'corrupt.json'),
      '{ not json',
    );
    await fs.writeFile(
      path.join(paths.playlistsDir, 'wrongshape.json'),
      JSON.stringify({ foo: 'bar' }),
    );
    const list = await service.list();
    expect(list.map((p) => p.id)).toEqual([good.id]);
  });
});
