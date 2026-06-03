import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LibraryRootError,
  LibraryService,
} from '../library-service.js';
import { DataRootError, resolveSnapshotPaths } from '../storage.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..', '..');
const smokeRoot = path.join(repoRoot, 'fixtures', 'library-smoke');

describe('LibraryService', () => {
  let dataRoot: string;

  beforeEach(async () => {
    dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-wall-data-'));
  });

  afterEach(async () => {
    await fs.rm(dataRoot, { recursive: true, force: true });
  });

  it('initialize creates the cache directory and reports no warm-load when fresh', async () => {
    const service = new LibraryService({ libraryRoot: smokeRoot, dataRoot });
    await service.initialize();
    const paths = resolveSnapshotPaths(dataRoot);
    const cacheStat = await fs.stat(paths.cacheDir);
    expect(cacheStat.isDirectory()).toBe(true);
    expect(service.getStateView().warmLoaded).toBe(false);
    expect(service.getStateView().state).toBe('idle');
    expect(service.getActiveSnapshot()).toBeNull();
  });

  it('rescan produces a snapshot, persists it, and a second LibraryService warm-loads it', async () => {
    const service = new LibraryService({ libraryRoot: smokeRoot, dataRoot });
    await service.initialize();
    const snapshot = await service.rescan();

    expect(snapshot.photoCount).toBe(5);
    expect(snapshot.years.map((y) => y.year)).toEqual([2023, 2024]);
    expect(service.getStateView().state).toBe('ready');
    expect(service.getStateView().lastRescanStartedAt).not.toBeNull();
    expect(service.getStateView().lastRescanCompletedAt).not.toBeNull();

    const snapshotFile = resolveSnapshotPaths(dataRoot).snapshotFile;
    const persistedRaw = await fs.readFile(snapshotFile, 'utf8');
    const persisted = JSON.parse(persistedRaw);
    expect(persisted.snapshotId).toBe(snapshot.snapshotId);

    // Fresh service over the same data root warm-loads the snapshot.
    const second = new LibraryService({ libraryRoot: smokeRoot, dataRoot });
    await second.initialize();
    expect(second.getStateView().warmLoaded).toBe(true);
    expect(second.getStateView().state).toBe('ready');
    expect(second.getActiveSnapshot()?.snapshotId).toBe(snapshot.snapshotId);
  });

  it('coalesces concurrent rescan() calls onto a single in-flight scan', async () => {
    const service = new LibraryService({ libraryRoot: smokeRoot, dataRoot });
    await service.initialize();

    const [a, b, c] = await Promise.all([
      service.rescan(),
      service.rescan(),
      service.rescan(),
    ]);
    expect(a.snapshotId).toBe(b.snapshotId);
    expect(b.snapshotId).toBe(c.snapshotId);
  });

  it('rejects a missing library root with LibraryRootError', async () => {
    const bogus = path.join(os.tmpdir(), 'photo-wall-nonexistent-xyz');
    const service = new LibraryService({ libraryRoot: bogus, dataRoot });
    await expect(service.initialize()).rejects.toBeInstanceOf(LibraryRootError);
  });

  it('rejects a library root that is a file rather than a directory', async () => {
    const filePath = path.join(dataRoot, 'not-a-dir.txt');
    await fs.writeFile(filePath, 'hi');
    const service = new LibraryService({
      libraryRoot: filePath,
      dataRoot: path.join(dataRoot, 'sub'),
    });
    await expect(service.initialize()).rejects.toBeInstanceOf(LibraryRootError);
  });

  it('rejects a data root that is a file rather than a writable directory', async () => {
    const filePath = path.join(dataRoot, 'not-a-dir.txt');
    await fs.writeFile(filePath, 'hi');
    const service = new LibraryService({
      libraryRoot: smokeRoot,
      dataRoot: filePath,
    });
    await expect(service.initialize()).rejects.toBeInstanceOf(DataRootError);
  });

  it('rejects a data root that overlaps the library root', async () => {
    const libraryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-wall-lib-'));
    const nestedDataRoot = path.join(libraryRoot, 'app-data');
    const service = new LibraryService({
      libraryRoot,
      dataRoot: nestedDataRoot,
    });
    await expect(service.initialize()).rejects.toBeInstanceOf(DataRootError);
    await fs.rm(libraryRoot, { recursive: true, force: true });
  });

  it('ignores a corrupt prior snapshot rather than crashing initialize', async () => {
    const paths = resolveSnapshotPaths(dataRoot);
    await fs.mkdir(dataRoot, { recursive: true });
    await fs.writeFile(paths.snapshotFile, 'this is not json');
    const service = new LibraryService({ libraryRoot: smokeRoot, dataRoot });
    await service.initialize();
    expect(service.getStateView().warmLoaded).toBe(false);
    expect(service.getActiveSnapshot()).toBeNull();
  });

  it('ignores a prior snapshot with the wrong schemaVersion', async () => {
    const paths = resolveSnapshotPaths(dataRoot);
    await fs.mkdir(dataRoot, { recursive: true });
    await fs.writeFile(
      paths.snapshotFile,
      JSON.stringify({
        schemaVersion: 999,
        snapshotId: 'fake',
        libraryRoot: smokeRoot,
        scannedAt: new Date().toISOString(),
        scanDurationMs: 0,
        photoCount: 0,
        photos: [],
        folders: [],
        years: [],
        warnings: [],
      }),
    );
    const service = new LibraryService({ libraryRoot: smokeRoot, dataRoot });
    await service.initialize();
    expect(service.getStateView().warmLoaded).toBe(false);
  });
});
