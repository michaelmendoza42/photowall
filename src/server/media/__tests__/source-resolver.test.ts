import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LibraryService } from '../../snapshots/library-service.js';
import type { PersistedSnapshot } from '../../snapshots/schema.js';
import { resolveSafeSourcePath } from '../source-resolver.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..', '..');
const smokeRoot = path.join(repoRoot, 'fixtures', 'library-smoke');

describe('resolveSafeSourcePath', () => {
  let dataRoot: string;
  let snapshot: PersistedSnapshot;

  beforeEach(async () => {
    dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-wall-srcres-'));
    const service = new LibraryService({ libraryRoot: smokeRoot, dataRoot });
    await service.initialize();
    await service.rescan();
    snapshot = service.getActiveSnapshot()!;
  });

  afterEach(async () => {
    await fs.rm(dataRoot, { recursive: true, force: true });
  });

  it('resolves a known photo to a path under the library root', async () => {
    const photo = snapshot.photos[0];
    if (!photo) throw new Error('fixture must include at least one photo');
    const res = await resolveSafeSourcePath(snapshot, photo.id);
    if (!res.ok) throw new Error('expected ok');
    expect(res.absolutePath.startsWith(snapshot.libraryRoot)).toBe(true);
    expect(res.relativePath).toBe(photo.relativePath);
  });

  it('rejects an unknown photo id with photo_not_found', async () => {
    const res = await resolveSafeSourcePath(snapshot, 'no-such-photo');
    if (res.ok) throw new Error('expected failure');
    expect(res.failure.kind).toBe('photo_not_found');
  });

  it('rejects a traversal-style id without touching the filesystem', async () => {
    const res = await resolveSafeSourcePath(snapshot, '../../etc/passwd');
    if (res.ok) throw new Error('expected failure');
    expect(res.failure.kind).toBe('photo_not_found');
  });

  it('rejects when the recorded relativePath would escape the root (corrupt snapshot)', async () => {
    // Fabricate a corrupted snapshot whose photo record points outside
    // the library root. The function must reject it via the realpath
    // root check rather than reading whatever lives there.
    const seed = snapshot.photos[0];
    if (!seed) throw new Error('fixture must include at least one photo');
    const evil: PersistedSnapshot = {
      ...snapshot,
      photos: [
        {
          ...seed,
          id: 'evil-id',
          relativePath: '../outside.jpg',
          directoryPath: '..',
          filename: 'outside.jpg',
        },
      ],
    };
    const res = await resolveSafeSourcePath(evil, 'evil-id');
    if (res.ok) throw new Error('expected failure');
    // Most realistically the file doesn't exist (source_unreadable),
    // but if a sibling happens to exist, the root check must catch it
    // first. Either failure mode is correct — what matters is that no
    // path outside the root is returned as ok.
    expect(['source_outside_root', 'source_unreadable']).toContain(
      res.failure.kind,
    );
  });

  it('reports source_unreadable when the source file has disappeared since the scan', async () => {
    // Build a snapshot for a brand-new directory, scan it, then delete
    // the source file under it. The recorded relativePath stays valid
    // shape-wise but the file is gone.
    const tempLib = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-wall-vanish-'));
    try {
      const sourceFile = path.join(tempLib, '2024', 'gone.jpg');
      await fs.mkdir(path.dirname(sourceFile), { recursive: true });
      await fs.copyFile(
        path.join(smokeRoot, '2024', 'wedding-anna', 'img_001.jpg'),
        sourceFile,
      );
      const tempData = await fs.mkdtemp(
        path.join(os.tmpdir(), 'photo-wall-vanish-data-'),
      );
      try {
        const svc = new LibraryService({
          libraryRoot: tempLib,
          dataRoot: tempData,
        });
        await svc.initialize();
        await svc.rescan();
        const snap = svc.getActiveSnapshot()!;
        const photo = snap.photos[0];
        if (!photo) throw new Error('expected at least one photo in temp library');

        await fs.unlink(sourceFile);

        const res = await resolveSafeSourcePath(snap, photo.id);
        if (res.ok) throw new Error('expected failure after unlink');
        expect(res.failure.kind).toBe('source_unreadable');
      } finally {
        await fs.rm(tempData, { recursive: true, force: true });
      }
    } finally {
      await fs.rm(tempLib, { recursive: true, force: true });
    }
  });
});
