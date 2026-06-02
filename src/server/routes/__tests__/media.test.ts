import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import sharp from 'sharp';
import { MEDIA_BASE_PATH } from '../../../shared/api/media.js';
import { LibraryService } from '../../snapshots/library-service.js';
import { DerivativeService } from '../../media/derivative-service.js';
import { registerMediaRoutes } from '../media.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..', '..');
const smokeRoot = path.join(repoRoot, 'fixtures', 'library-smoke');

describe('/api/media route', () => {
  let dataRoot: string;
  let library: LibraryService;
  let derivatives: DerivativeService;
  let photoId: string;

  beforeEach(async () => {
    dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-wall-media-'));
    library = new LibraryService({ libraryRoot: smokeRoot, dataRoot });
    await library.initialize();
    await library.rescan();
    derivatives = new DerivativeService({ cacheRoot: library.getCacheDir() });
    const firstPhoto = library.getActiveSnapshot()!.photos[0];
    if (!firstPhoto) throw new Error('fixture must include at least one photo');
    photoId = firstPhoto.id;
  });

  afterEach(async () => {
    await fs.rm(dataRoot, { recursive: true, force: true });
  });

  async function newApp() {
    const app = Fastify({ logger: false });
    await registerMediaRoutes(app, { library, derivatives });
    return app;
  }

  it('serves a wall variant with correct content-type, cache headers, and image bytes', async () => {
    const app = await newApp();
    const res = await app.inject({
      method: 'GET',
      url: `${MEDIA_BASE_PATH}/${photoId}?variant=wall&format=webp`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');
    expect(res.headers['cache-control']).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(res.headers['x-photo-wall-cache']).toBe('miss');
    expect(res.headers['x-photo-wall-variant']).toBe('wall');
    expect(typeof res.headers['etag']).toBe('string');

    const body = res.rawPayload;
    expect(body.length).toBeGreaterThan(0);
    const meta = await sharp(body).metadata();
    expect(meta.format).toBe('webp');

    await app.close();
  });

  it('serves a modal variant when requested', async () => {
    const app = await newApp();
    const res = await app.inject({
      method: 'GET',
      url: `${MEDIA_BASE_PATH}/${photoId}?variant=modal&format=webp`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-photo-wall-variant']).toBe('modal');
    const meta = await sharp(res.rawPayload).metadata();
    expect(meta.format).toBe('webp');
    await app.close();
  });

  it('reuses the cache on a second request (cache hit)', async () => {
    const app = await newApp();
    const url = `${MEDIA_BASE_PATH}/${photoId}?variant=wall&format=webp`;

    const first = await app.inject({ method: 'GET', url });
    expect(first.statusCode).toBe(200);
    expect(first.headers['x-photo-wall-cache']).toBe('miss');
    const firstEtag = first.headers.etag;

    const second = await app.inject({ method: 'GET', url });
    expect(second.statusCode).toBe(200);
    expect(second.headers['x-photo-wall-cache']).toBe('hit');
    expect(second.headers.etag).toBe(firstEtag);
    expect(second.rawPayload.equals(first.rawPayload)).toBe(true);

    await app.close();
  });

  it('persists the derivative file under the configured /data cache root', async () => {
    const app = await newApp();
    const res = await app.inject({
      method: 'GET',
      url: `${MEDIA_BASE_PATH}/${photoId}?variant=wall&format=webp`,
    });
    expect(res.statusCode).toBe(200);

    const cacheRoot = library.getCacheDir();
    expect(cacheRoot.startsWith(dataRoot)).toBe(true);
    const files = await collectFiles(cacheRoot);
    expect(files.some((f) => f.endsWith('.webp'))).toBe(true);
    await app.close();
  });

  it('falls back to wall+webp when no query is provided', async () => {
    const app = await newApp();
    const res = await app.inject({
      method: 'GET',
      url: `${MEDIA_BASE_PATH}/${photoId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');
    expect(res.headers['x-photo-wall-variant']).toBe('wall');
    await app.close();
  });

  it('serves jpeg when format=jpeg is requested', async () => {
    const app = await newApp();
    const res = await app.inject({
      method: 'GET',
      url: `${MEDIA_BASE_PATH}/${photoId}?variant=wall&format=jpeg`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    const meta = await sharp(res.rawPayload).metadata();
    expect(meta.format).toBe('jpeg');
    await app.close();
  });

  it('returns 404 photo_not_found for an unknown photoId', async () => {
    const app = await newApp();
    const res = await app.inject({
      method: 'GET',
      url: `${MEDIA_BASE_PATH}/not-a-real-id?variant=wall&format=webp`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'photo_not_found' });
    await app.close();
  });

  it('rejects a traversal-style photoId as photo_not_found (no path is constructed)', async () => {
    const app = await newApp();
    const evil = encodeURIComponent('../../../etc/passwd');
    const res = await app.inject({
      method: 'GET',
      url: `${MEDIA_BASE_PATH}/${evil}?variant=wall&format=webp`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'photo_not_found' });
    await app.close();
  });

  it('returns 400 variant_invalid for an unknown variant', async () => {
    const app = await newApp();
    const res = await app.inject({
      method: 'GET',
      url: `${MEDIA_BASE_PATH}/${photoId}?variant=poster&format=webp`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'variant_invalid' });
    await app.close();
  });

  it('returns 400 format_invalid for an unknown format', async () => {
    const app = await newApp();
    const res = await app.inject({
      method: 'GET',
      url: `${MEDIA_BASE_PATH}/${photoId}?variant=wall&format=heic`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'format_invalid' });
    await app.close();
  });

  it('returns 503 snapshot_unavailable before any scan has produced a snapshot', async () => {
    const coldDataRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'photo-wall-cold-'),
    );
    try {
      const coldLibrary = new LibraryService({
        libraryRoot: smokeRoot,
        dataRoot: coldDataRoot,
      });
      await coldLibrary.initialize();
      const coldDerivs = new DerivativeService({
        cacheRoot: coldLibrary.getCacheDir(),
      });
      const app = Fastify({ logger: false });
      await registerMediaRoutes(app, {
        library: coldLibrary,
        derivatives: coldDerivs,
      });
      const res = await app.inject({
        method: 'GET',
        url: `${MEDIA_BASE_PATH}/whatever?variant=wall&format=webp`,
      });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({ error: 'snapshot_unavailable' });
      await app.close();
    } finally {
      await fs.rm(coldDataRoot, { recursive: true, force: true });
    }
  });

  it('produces a different ETag after the source file changes (cache invalidation)', async () => {
    // Build an isolated library so we can mutate the source safely.
    const tempLib = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-wall-invalid-'));
    const tempData = await fs.mkdtemp(
      path.join(os.tmpdir(), 'photo-wall-invalid-data-'),
    );
    try {
      const sourceFile = path.join(tempLib, '2024', 'travel-iceland', 'img.jpg');
      await fs.mkdir(path.dirname(sourceFile), { recursive: true });
      await fs.copyFile(
        path.join(smokeRoot, '2024', 'travel-iceland', 'img_010.jpg'),
        sourceFile,
      );

      const svc = new LibraryService({
        libraryRoot: tempLib,
        dataRoot: tempData,
      });
      await svc.initialize();
      await svc.rescan();
      const derivs = new DerivativeService({ cacheRoot: svc.getCacheDir() });
      const app = Fastify({ logger: false });
      await registerMediaRoutes(app, { library: svc, derivatives: derivs });

      const firstPhotoRecord = svc.getActiveSnapshot()!.photos[0];
      if (!firstPhotoRecord) throw new Error('expected at least one photo');
      const id = firstPhotoRecord.id;
      const url = `${MEDIA_BASE_PATH}/${id}?variant=wall&format=webp`;

      const before = await app.inject({ method: 'GET', url });
      expect(before.statusCode).toBe(200);
      const etagBefore = before.headers.etag as string;

      // Overwrite the source with different bytes (a smaller fixture)
      // and bump its mtime so fingerprint changes.
      await fs.copyFile(
        path.join(smokeRoot, '2024', 'wedding-anna', 'img_001.jpg'),
        sourceFile,
      );
      const future = (Date.now() + 60_000) / 1000;
      await fs.utimes(sourceFile, future, future);

      // Rescan so the snapshot picks up the new mtime/size.
      await svc.rescan();

      const second = await app.inject({ method: 'GET', url });
      expect(second.statusCode).toBe(200);
      const etagAfter = second.headers.etag as string;
      expect(etagAfter).not.toBe(etagBefore);
      // The freshly-fingerprinted cache key is a new file: miss.
      expect(second.headers['x-photo-wall-cache']).toBe('miss');

      await app.close();
    } finally {
      await fs.rm(tempData, { recursive: true, force: true });
      await fs.rm(tempLib, { recursive: true, force: true });
    }
  });
});

async function collectFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string) {
    const entries = await fs.readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile()) out.push(p);
    }
  }
  await walk(dir);
  return out;
}
