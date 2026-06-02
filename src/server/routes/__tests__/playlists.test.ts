import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import {
  PLAYLISTS_COLLECTION_PATH,
  playlistResourcePath,
  type PlaylistListResponse,
  type PlaylistRecord,
} from '../../../shared/api/playlists.js';
import { PlaylistService } from '../../playlists/service.js';
import { registerPlaylistRoutes } from '../playlists.js';

describe('/api/playlists routes', () => {
  let dataRoot: string;
  let service: PlaylistService;

  beforeEach(async () => {
    dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-wall-pl-routes-'));
    service = new PlaylistService(dataRoot);
    await service.initialize();
  });

  afterEach(async () => {
    await fs.rm(dataRoot, { recursive: true, force: true });
  });

  async function newApp() {
    const app = Fastify({ logger: false });
    await registerPlaylistRoutes(app, service);
    return app;
  }

  it('GET on an empty collection returns an empty list', async () => {
    const app = await newApp();
    const res = await app.inject({ method: 'GET', url: PLAYLISTS_COLLECTION_PATH });
    expect(res.statusCode).toBe(200);
    expect((res.json() as PlaylistListResponse).playlists).toEqual([]);
    await app.close();
  });

  it('POST creates, GET-list returns it, GET-one returns it, persistence survives restart', async () => {
    const app = await newApp();
    const created = await app.inject({
      method: 'POST',
      url: PLAYLISTS_COLLECTION_PATH,
      payload: {
        name: 'Iceland',
        filters: { years: [2024], folders: ['2024/travel-iceland'] },
      },
    });
    expect(created.statusCode).toBe(201);
    const createdBody = created.json() as PlaylistRecord;
    expect(createdBody.id).toMatch(/^[a-z0-9-]+$/);
    expect(createdBody.filters.folders).toEqual(['2024/travel-iceland']);

    const list = await app.inject({ method: 'GET', url: PLAYLISTS_COLLECTION_PATH });
    expect((list.json() as PlaylistListResponse).playlists).toHaveLength(1);

    const single = await app.inject({
      method: 'GET',
      url: playlistResourcePath(createdBody.id),
    });
    expect(single.statusCode).toBe(200);
    expect((single.json() as PlaylistRecord).id).toBe(createdBody.id);

    await app.close();

    // Restart with a fresh service over the same dataRoot.
    const second = new PlaylistService(dataRoot);
    await second.initialize();
    const second_app = Fastify({ logger: false });
    await registerPlaylistRoutes(second_app, second);
    const persisted = await second_app.inject({
      method: 'GET',
      url: PLAYLISTS_COLLECTION_PATH,
    });
    const persistedBody = persisted.json() as PlaylistListResponse;
    expect(persistedBody.playlists).toHaveLength(1);
    expect(persistedBody.playlists[0]!.id).toBe(createdBody.id);
    await second_app.close();
  });

  it('POST returns 400 for invalid input', async () => {
    const app = await newApp();
    const res = await app.inject({
      method: 'POST',
      url: PLAYLISTS_COLLECTION_PATH,
      payload: { name: '', filters: { years: [], folders: [] } },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe('playlist_invalid');
    await app.close();
  });

  it('PATCH updates name and filters', async () => {
    const app = await newApp();
    const created = await app.inject({
      method: 'POST',
      url: PLAYLISTS_COLLECTION_PATH,
      payload: { name: 'before', filters: { years: [2023], folders: [] } },
    });
    const id = (created.json() as PlaylistRecord).id;
    const patched = await app.inject({
      method: 'PATCH',
      url: playlistResourcePath(id),
      payload: { name: 'after', filters: { years: [2024], folders: ['2024'] } },
    });
    expect(patched.statusCode).toBe(200);
    const patchedBody = patched.json() as PlaylistRecord;
    expect(patchedBody.name).toBe('after');
    expect(patchedBody.filters.years).toEqual([2024]);
    expect(patchedBody.filters.folders).toEqual(['2024']);
    await app.close();
  });

  it('PATCH returns 404 for an unknown id', async () => {
    const app = await newApp();
    const res = await app.inject({
      method: 'PATCH',
      url: playlistResourcePath('nope'),
      payload: { name: 'x' },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toBe('playlist_not_found');
    await app.close();
  });

  it('DELETE removes the playlist and subsequent GET returns 404', async () => {
    const app = await newApp();
    const created = await app.inject({
      method: 'POST',
      url: PLAYLISTS_COLLECTION_PATH,
      payload: { name: 'gone', filters: { years: [], folders: [] } },
    });
    const id = (created.json() as PlaylistRecord).id;
    const del = await app.inject({
      method: 'DELETE',
      url: playlistResourcePath(id),
    });
    expect(del.statusCode).toBe(204);

    const after = await app.inject({
      method: 'GET',
      url: playlistResourcePath(id),
    });
    expect(after.statusCode).toBe(404);
    await app.close();
  });

  it('GET on an unsafe id returns 404 rather than crashing', async () => {
    const app = await newApp();
    const res = await app.inject({
      method: 'GET',
      // %2F = '/' — Fastify treats this as path traversal in the param,
      // so we use a value that satisfies the route param but fails the
      // id validator.
      url: playlistResourcePath('Capital-Letters'),
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
