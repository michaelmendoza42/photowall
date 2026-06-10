import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import {
  LIBRARY_FACETS_PATH,
  LIBRARY_ROOT_PATH,
  LIBRARY_STATUS_PATH,
  SNAPSHOT_SCHEMA_VERSION,
  type LibraryFacetsResponse,
  type LibraryStatusResponse,
} from '../../../shared/api/library.js';
import { LibraryService } from '../../snapshots/library-service.js';
import { registerLibraryRoutes } from '../library.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..', '..');
const smokeRoot = path.join(repoRoot, 'fixtures', 'library-smoke');
const edgeRoot = path.join(repoRoot, 'fixtures', 'library-edge');

describe('library routes', () => {
  let dataRoot: string;

  beforeEach(async () => {
    dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-wall-data-'));
  });

  afterEach(async () => {
    await fs.rm(dataRoot, { recursive: true, force: true });
  });

  it('exposes status and facets that reflect the active snapshot', async () => {
    const app = Fastify({ logger: false });
    const service = new LibraryService({ libraryRoot: smokeRoot, dataRoot });
    await service.initialize();
    await service.rescan();
    await registerLibraryRoutes(app, service);

    const statusRes = await app.inject({ method: 'GET', url: LIBRARY_STATUS_PATH });
    expect(statusRes.statusCode).toBe(200);
    const status = statusRes.json() as LibraryStatusResponse;
    expect(status.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
    expect(status.scanState).toBe('ready');
    expect(status.photoCount).toBe(5);
    expect(status.warningCount).toBe(0);
    expect(status.snapshotId).not.toBeNull();
    expect(status.libraryRoot).toBe(await fs.realpath(smokeRoot));
    expect(status.warmLoaded).toBe(false);

    const facetsRes = await app.inject({ method: 'GET', url: LIBRARY_FACETS_PATH });
    expect(facetsRes.statusCode).toBe(200);
    const facets = facetsRes.json() as LibraryFacetsResponse;
    expect(facets.years).toEqual([
      { year: 2023, photoCount: 1 },
      { year: 2024, photoCount: 4 },
    ]);
    // root + 2 top-level + 3 event = 6 folder facets total.
    expect(facets.folders.length).toBeGreaterThanOrEqual(6);
    const root = facets.folders.find((f) => f.path === '');
    expect(root?.photoCount).toBe(5);

    await app.close();
  });

  it('updates the configured library root and returns refreshed status', async () => {
    const app = Fastify({ logger: false });
    const service = new LibraryService({ libraryRoot: smokeRoot, dataRoot });
    await service.initialize();
    await service.rescan();
    await registerLibraryRoutes(app, service);

    const updateRes = await app.inject({
      method: 'PUT',
      url: LIBRARY_ROOT_PATH,
      payload: { libraryRoot: edgeRoot },
    });
    expect(updateRes.statusCode).toBe(200);
    const status = updateRes.json() as LibraryStatusResponse;
    expect(status.libraryRoot).toBe(await fs.realpath(edgeRoot));
    expect(status.scanState).toBe('ready');
    expect(status.snapshotId).not.toBeNull();

    const invalidRes = await app.inject({
      method: 'PUT',
      url: LIBRARY_ROOT_PATH,
      payload: { libraryRoot: '' },
    });
    expect(invalidRes.statusCode).toBe(400);
    expect(invalidRes.json()).toEqual({ error: 'library_root_required' });

    await app.close();
  });

  it('returns empty facets and idle/scanning state before any scan has run', async () => {
    const app = Fastify({ logger: false });
    const service = new LibraryService({ libraryRoot: smokeRoot, dataRoot });
    await service.initialize();
    await registerLibraryRoutes(app, service);

    const statusRes = await app.inject({ method: 'GET', url: LIBRARY_STATUS_PATH });
    const status = statusRes.json() as LibraryStatusResponse;
    expect(status.photoCount).toBe(0);
    expect(status.snapshotId).toBeNull();
    expect(status.scanState).toBe('idle');

    const facetsRes = await app.inject({ method: 'GET', url: LIBRARY_FACETS_PATH });
    const facets = facetsRes.json() as LibraryFacetsResponse;
    expect(facets.years).toEqual([]);
    expect(facets.folders).toEqual([]);

    await app.close();
  });
});
