import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import {
  PHOTOS_QUERY_PATH,
  type PhotosQuerySuccessResponse,
  type SnapshotChangedResponse,
} from '../../../shared/api/photos.js';
import { LibraryService } from '../../snapshots/library-service.js';
import { PlaylistService } from '../../playlists/service.js';
import { registerPhotoRoutes } from '../photos.js';
import { decodeCursor, encodeCursor } from '../../query/cursor.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..', '..');
const smokeRoot = path.join(repoRoot, 'fixtures', 'library-smoke');

describe('/api/photos route', () => {
  let dataRoot: string;
  let library: LibraryService;
  let playlists: PlaylistService;

  beforeEach(async () => {
    dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-wall-photos-'));
    library = new LibraryService({ libraryRoot: smokeRoot, dataRoot });
    await library.initialize();
    await library.rescan();
    playlists = new PlaylistService(dataRoot);
    await playlists.initialize();
  });

  afterEach(async () => {
    await fs.rm(dataRoot, { recursive: true, force: true });
  });

  async function newApp() {
    const app = Fastify({ logger: false });
    await registerPhotoRoutes(app, { library, playlists });
    return app;
  }

  async function getPhotos(
    app: Awaited<ReturnType<typeof newApp>>,
    query: string,
  ): Promise<PhotosQuerySuccessResponse | SnapshotChangedResponse> {
    const res = await app.inject({
      method: 'GET',
      url: `${PHOTOS_QUERY_PATH}?${query}`,
    });
    return res.json() as PhotosQuerySuccessResponse | SnapshotChangedResponse;
  }

  it('returns the first page in deterministic relativePath order', async () => {
    const app = await newApp();
    const body = (await getPhotos(app, 'limit=10')) as PhotosQuerySuccessResponse;
    expect(body.photos.map((p) => p.relativePath)).toEqual([
      '2023/birthday-leo/img_020.jpg',
      '2024/travel-iceland/img_010.jpg',
      '2024/wedding-anna/img_001.jpg',
      '2024/wedding-anna/img_002.jpg',
      '2024/wedding-anna/img_003.jpg',
    ]);
    expect(body.totalMatching).toBe(5);
    expect(body.nextCursor).toBeNull();
    expect(body.snapshotId).toBe(library.getActiveSnapshot()!.snapshotId);
    expect(body.appliedFilters).toEqual({
      years: [],
      folders: [],
      playlistId: null,
    });
    await app.close();
  });

  it('uses an opaque cursor to resume on the second page', async () => {
    const app = await newApp();
    const first = (await getPhotos(app, 'limit=2')) as PhotosQuerySuccessResponse;
    expect(first.photos).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    // Cursor must be opaque base64url — not a JSON dump or a path.
    expect(first.nextCursor!).not.toContain('/');
    expect(first.nextCursor!).not.toContain('{');

    const second = (await getPhotos(
      app,
      `limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`,
    )) as PhotosQuerySuccessResponse;
    expect(second.photos.map((p) => p.relativePath)).toEqual([
      '2024/wedding-anna/img_001.jpg',
      '2024/wedding-anna/img_002.jpg',
    ]);

    const third = (await getPhotos(
      app,
      `limit=2&cursor=${encodeURIComponent(second.nextCursor!)}`,
    )) as PhotosQuerySuccessResponse;
    expect(third.photos.map((p) => p.relativePath)).toEqual([
      '2024/wedding-anna/img_003.jpg',
    ]);
    expect(third.nextCursor).toBeNull();
    await app.close();
  });

  it('filters by year', async () => {
    const app = await newApp();
    const body = (await getPhotos(app, 'year=2024')) as PhotosQuerySuccessResponse;
    expect(body.photos.map((p) => p.year)).toEqual([2024, 2024, 2024, 2024]);
    expect(body.totalMatching).toBe(4);
    expect(body.appliedFilters.years).toEqual([2024]);
    await app.close();
  });

  it('filters by folder using segment-boundary prefix match', async () => {
    const app = await newApp();
    const body = (await getPhotos(
      app,
      'folder=2024%2Fwedding-anna',
    )) as PhotosQuerySuccessResponse;
    expect(body.photos.map((p) => p.relativePath)).toEqual([
      '2024/wedding-anna/img_001.jpg',
      '2024/wedding-anna/img_002.jpg',
      '2024/wedding-anna/img_003.jpg',
    ]);
    await app.close();
  });

  it('combines year and folder filters with AND semantics', async () => {
    const app = await newApp();
    const body = (await getPhotos(
      app,
      'year=2024&folder=2024%2Ftravel-iceland',
    )) as PhotosQuerySuccessResponse;
    expect(body.photos.map((p) => p.relativePath)).toEqual([
      '2024/travel-iceland/img_010.jpg',
    ]);
    expect(body.totalMatching).toBe(1);

    const empty = (await getPhotos(
      app,
      'year=2023&folder=2024%2Fwedding-anna',
    )) as PhotosQuerySuccessResponse;
    expect(empty.photos).toEqual([]);
    expect(empty.totalMatching).toBe(0);
    expect(empty.nextCursor).toBeNull();
    await app.close();
  });

  it('returns 409 snapshot_changed when a cursor references a different snapshot', async () => {
    const app = await newApp();
    const stale = encodeCursor({
      s: 'snapshot-that-does-not-exist',
      p: '2023/birthday-leo/img_020.jpg',
      i: 'whatever',
    });
    const res = await app.inject({
      method: 'GET',
      url: `${PHOTOS_QUERY_PATH}?cursor=${encodeURIComponent(stale)}`,
    });
    expect(res.statusCode).toBe(409);
    const body = res.json() as SnapshotChangedResponse;
    expect(body.error).toBe('snapshot_changed');
    expect(body.reason).toBe('snapshot_replaced');
    expect(body.activeSnapshotId).toBe(library.getActiveSnapshot()!.snapshotId);
    await app.close();
  });

  it('returns 409 cursor_invalid for malformed cursors', async () => {
    const app = await newApp();
    const res = await app.inject({
      method: 'GET',
      url: `${PHOTOS_QUERY_PATH}?cursor=%21not-base64%21`,
    });
    expect(res.statusCode).toBe(409);
    const body = res.json() as SnapshotChangedResponse;
    expect(body.reason).toBe('cursor_invalid');
    await app.close();
  });

  it('expands a saved playlist into the resolved filter set', async () => {
    const created = await playlists.create({
      name: 'iceland-trip',
      filters: { years: [2024], folders: ['2024/travel-iceland'] },
    });
    const app = await newApp();
    const body = (await getPhotos(
      app,
      `playlist=${encodeURIComponent(created.id)}`,
    )) as PhotosQuerySuccessResponse;
    expect(body.photos.map((p) => p.relativePath)).toEqual([
      '2024/travel-iceland/img_010.jpg',
    ]);
    expect(body.appliedFilters.playlistId).toBe(created.id);
    expect(body.appliedFilters.years).toEqual([2024]);
    expect(body.appliedFilters.folders).toEqual(['2024/travel-iceland']);
    await app.close();
  });

  it('degrades gracefully when a playlist references a missing folder', async () => {
    const ghost = await playlists.create({
      name: 'ghost-folder',
      filters: { years: [], folders: ['does-not-exist'] },
    });
    const app = await newApp();
    const res = await app.inject({
      method: 'GET',
      url: `${PHOTOS_QUERY_PATH}?playlist=${encodeURIComponent(ghost.id)}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as PhotosQuerySuccessResponse;
    expect(body.photos).toEqual([]);
    expect(body.totalMatching).toBe(0);
    expect(body.appliedFilters.folders).toEqual(['does-not-exist']);
    await app.close();
  });

  it('treats an unknown playlist id as no preset (resolved playlistId becomes null)', async () => {
    const app = await newApp();
    const body = (await getPhotos(
      app,
      'playlist=does-not-exist',
    )) as PhotosQuerySuccessResponse;
    expect(body.photos).toHaveLength(5);
    expect(body.appliedFilters.playlistId).toBeNull();
    await app.close();
  });

  it("issued cursor encodes the active snapshot's id", async () => {
    const app = await newApp();
    const body = (await getPhotos(app, 'limit=1')) as PhotosQuerySuccessResponse;
    const decoded = decodeCursor(body.nextCursor!);
    if (!decoded.ok) throw new Error('cursor should decode');
    expect(decoded.cursor.s).toBe(library.getActiveSnapshot()!.snapshotId);
    await app.close();
  });
});
