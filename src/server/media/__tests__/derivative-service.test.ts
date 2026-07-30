import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { LibraryService } from '../../snapshots/library-service.js';
import type { PersistedSnapshot } from '../../snapshots/schema.js';
import { DerivativeService } from '../derivative-service.js';
import { computeCacheKey, sourceFingerprint } from '../cache-key.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..', '..');
const smokeRoot = path.join(repoRoot, 'fixtures', 'library-smoke');

class TestDerivativeService extends DerivativeService {
  runWithPermit<T>(work: () => Promise<T>): Promise<T> {
    return this.renderWithPermit(work);
  }
}

describe('DerivativeService', () => {
  let dataRoot: string;
  let library: LibraryService;
  let snapshot: PersistedSnapshot;
  let service: DerivativeService;

  beforeEach(async () => {
    dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-wall-derivs-'));
    library = new LibraryService({ libraryRoot: smokeRoot, dataRoot });
    await library.initialize();
    await library.rescan();
    snapshot = library.getActiveSnapshot()!;
    service = new DerivativeService({ cacheRoot: library.getCacheDir() });
  });

  afterEach(async () => {
    await fs.rm(dataRoot, { recursive: true, force: true });
  });

  function firstPhotoId(): string {
    const photo = snapshot.photos[0];
    if (!photo) throw new Error('fixture must include at least one photo');
    return photo.id;
  }

  it('generates a wall variant from a fixture image and writes it under /data/cache', async () => {
    const outcome = await service.generate(snapshot, {
      photoId: firstPhotoId(),
      variant: 'wall',
      format: 'webp',
    });
    if (!outcome.ok) throw new Error(`expected ok, got ${outcome.failure.kind}`);

    expect(outcome.fromCache).toBe(false);
    expect(outcome.filePath.startsWith(library.getCacheDir())).toBe(true);
    const stat = await fs.stat(outcome.filePath);
    expect(stat.isFile()).toBe(true);
    expect(stat.size).toBeGreaterThan(0);

    const probed = await sharp(outcome.filePath).metadata();
    expect(probed.format).toBe('webp');
    // Fixtures are small synthetic images well under any wall longEdge.
    // withoutEnlargement keeps them at native size rather than upscaling.
    expect(probed.width).toBeDefined();
    expect(probed.height).toBeDefined();
    expect(probed.width!).toBeGreaterThan(0);
    expect(probed.width!).toBeLessThanOrEqual(640);
    expect(probed.height!).toBeLessThanOrEqual(640);
  });

  it('coalesces concurrent cold requests for the same derivative', async () => {
    const request = { photoId: firstPhotoId(), variant: 'wall' as const, format: 'webp' as const };
    const [first, second] = await Promise.all([
      service.generate(snapshot, request),
      service.generate(snapshot, request),
    ]);
    if (!first.ok || !second.ok) throw new Error('expected both requests to succeed');
    expect(first.cacheKey).toBe(second.cacheKey);
    expect(first.filePath).toBe(second.filePath);
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(false);
    expect(service.getMetrics()).toEqual({
      activeRenders: 0,
      queuedRenders: 0,
      inFlightRenders: 0,
    });
  });

  it('caps distinct cold render work and reports queue transitions', async () => {
    const boundedService = new TestDerivativeService({
      cacheRoot: library.getCacheDir(),
      maxConcurrentRenders: 2,
    });
    const queued = boundedService.runWithPermit.bind(boundedService);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let active = 0;
    let peakActive = 0;
    const run = (result: string) => queued(async () => {
      active += 1;
      peakActive = Math.max(peakActive, active);
      await gate;
      active -= 1;
      return result;
    });

    const first = run('first');
    const second = run('second');
    const third = run('third');

    expect(boundedService.getMetrics()).toEqual({
      activeRenders: 2,
      queuedRenders: 1,
      inFlightRenders: 0,
    });
    release();
    await expect(Promise.all([first, second, third])).resolves.toEqual([
      'first',
      'second',
      'third',
    ]);
    expect(peakActive).toBe(2);
    expect(boundedService.getMetrics()).toEqual({
      activeRenders: 0,
      queuedRenders: 0,
      inFlightRenders: 0,
    });
  });

  it('rejects a render limit that cannot make progress', () => {
    expect(() => new DerivativeService({
      cacheRoot: library.getCacheDir(),
      maxConcurrentRenders: 0,
    })).toThrow(/maxConcurrentRenders/);
  });

  it('releases a failed render permit so queued work can continue', async () => {
    const singleRenderService = new TestDerivativeService({
      cacheRoot: library.getCacheDir(),
      maxConcurrentRenders: 1,
    });
    const queued = singleRenderService.runWithPermit.bind(singleRenderService);
    const first = queued(async () => {
      throw new Error('expected render failure');
    });
    const second = queued(async () => 'rendered-after-failure');

    await expect(first).rejects.toThrow('expected render failure');
    await expect(second).resolves.toBe('rendered-after-failure');
    expect(singleRenderService.getMetrics()).toEqual({
      activeRenders: 0,
      queuedRenders: 0,
      inFlightRenders: 0,
    });
  });

  it('reuses the cached file on the second request (cache hit)', async () => {
    const debugRecords: Array<{ obj: unknown; msg?: string }> = [];
    service = new DerivativeService({
      cacheRoot: library.getCacheDir(),
      logger: {
        debug: (obj, msg) => debugRecords.push({ obj, msg }),
      },
    });
    const photoId = firstPhotoId();
    const req = { photoId, variant: 'wall' as const, format: 'webp' as const };
    const first = await service.generate(snapshot, req);
    if (!first.ok) throw new Error('first generate failed');

    const firstStat = await fs.stat(first.filePath);

    // Force a 5ms gap so any unwanted rewrite would change mtimeMs.
    await new Promise((r) => setTimeout(r, 5));

    const second = await service.generate(snapshot, req);
    if (!second.ok) throw new Error('second generate failed');

    expect(second.fromCache).toBe(true);
    expect(second.filePath).toBe(first.filePath);
    expect(second.cacheKey).toBe(first.cacheKey);

    const secondStat = await fs.stat(second.filePath);
    expect(secondStat.mtimeMs).toBe(firstStat.mtimeMs);
    expect(debugRecords).toEqual([
      {
        obj: { photoId, variant: 'wall', format: 'webp' },
        msg: 'derivative cache miss — rendered fresh',
      },
      {
        obj: { photoId, variant: 'wall', format: 'webp' },
        msg: 'derivative cache hit',
      },
    ]);
  });

  it('exposes both wall and modal variants distinctly', async () => {
    const photoId = firstPhotoId();
    const wall = await service.generate(snapshot, {
      photoId,
      variant: 'wall',
      format: 'webp',
    });
    const modal = await service.generate(snapshot, {
      photoId,
      variant: 'modal',
      format: 'webp',
    });
    if (!wall.ok || !modal.ok) {
      throw new Error('expected both variants to succeed');
    }
    expect(wall.cacheKey).not.toBe(modal.cacheKey);
    expect(wall.filePath).not.toBe(modal.filePath);

    const wallMeta = await sharp(wall.filePath).metadata();
    const modalMeta = await sharp(modal.filePath).metadata();
    // For these 160x90 fixtures both fit inside both variant boxes
    // without enlargement, so width stays at 160 — but the cache files
    // must still be physically separate so a modal request never serves
    // a wall-quality file (or vice versa for larger sources).
    expect(wallMeta.format).toBe('webp');
    expect(modalMeta.format).toBe('webp');
  });

  it('invalidates cache when source fingerprint (mtime/size) changes', async () => {
    const photoId = firstPhotoId();
    const firstPhoto = snapshot.photos[0];
    if (!firstPhoto) throw new Error('fixture must include at least one photo');
    const sourceRel = firstPhoto.relativePath;
    const sourceAbs = path.join(snapshot.libraryRoot, sourceRel);

    // Render once against the live snapshot.
    const first = await service.generate(snapshot, {
      photoId,
      variant: 'wall',
      format: 'webp',
    });
    if (!first.ok) throw new Error('first generate failed');
    const originalKey = first.cacheKey;

    // Build a doctored snapshot whose recorded mtimeMs is shifted by an
    // hour. The actual source file on disk has not changed (we never
    // mutate fixtures), but the recorded fingerprint has — so the cache
    // key the service derives must differ.
    const stat = await fs.stat(sourceAbs);
    const shifted: PersistedSnapshot = {
      ...snapshot,
      photos: snapshot.photos.map((p) =>
        p.id === photoId
          ? { ...p, mtimeMs: p.mtimeMs + 3_600_000 }
          : p,
      ),
    };

    // The actual fingerprint the service uses comes from fs.stat at
    // request time, not the snapshot record. To prove invalidation, we
    // compare what the cache key WOULD be against two different
    // fingerprints — that is the property the route depends on.
    const beforeKey = computeCacheKey({
      photoId,
      libraryRoot: snapshot.libraryRoot,
      variant: 'wall',
      format: 'webp',
      sourceFingerprint: sourceFingerprint(stat.mtimeMs, stat.size),
    });
    const afterKey = computeCacheKey({
      photoId,
      libraryRoot: snapshot.libraryRoot,
      variant: 'wall',
      format: 'webp',
      sourceFingerprint: sourceFingerprint(stat.mtimeMs + 3_600_000, stat.size),
    });
    expect(beforeKey).toBe(originalKey);
    expect(afterKey).not.toBe(originalKey);

    // Sanity: the doctored snapshot would still produce a file (the
    // service re-stats the source, so the on-disk mtime governs the
    // real fingerprint). This is a probe — we just need to confirm the
    // call doesn't crash on a tampered record.
    const probe = await service.generate(shifted, {
      photoId,
      variant: 'wall',
      format: 'webp',
    });
    expect(probe.ok).toBe(true);
  });

  it('rejects an unknown photoId without touching the filesystem', async () => {
    const outcome = await service.generate(snapshot, {
      photoId: 'definitely-not-a-real-id',
      variant: 'wall',
      format: 'webp',
    });
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.failure.kind).toBe('photo_not_found');
  });

  it('rejects a photoId crafted to look like a traversal string', async () => {
    const outcome = await service.generate(snapshot, {
      photoId: '../../../etc/passwd',
      variant: 'wall',
      format: 'webp',
    });
    if (outcome.ok) throw new Error('expected failure');
    // The id never matches a snapshot photo, so it is rejected as
    // photo_not_found — it is never used as a path.
    expect(outcome.failure.kind).toBe('photo_not_found');
  });
});
