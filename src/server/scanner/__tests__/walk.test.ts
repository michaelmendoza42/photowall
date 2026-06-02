import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { scanLibrary } from '../walk.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..', '..');
const fixturesRoot = path.join(repoRoot, 'fixtures');
const smokeRoot = path.join(fixturesRoot, 'library-smoke');
const edgeRoot = path.join(fixturesRoot, 'library-edge');

interface SmokeManifest {
  libraries: {
    'library-smoke': {
      expected: {
        photoCount: number;
        warningCount: number;
        yearFacets: Array<{ year: number; photoCount: number }>;
        topLevelFolders: Array<{
          path: string;
          photoCount: number;
          directPhotoCount: number;
        }>;
        photos: Array<{
          relativePath: string;
          width: number;
          height: number;
          year: number | null;
          yearSource: string;
        }>;
      };
    };
    'library-edge': {
      expected: {
        photoCount: number;
        warningCount: number;
        yearFacets: Array<{ year: number; photoCount: number }>;
        photos: Array<{
          relativePath: string;
          year: number | null;
          yearSource: string;
        }>;
        expectedWarnings: Array<{ kind: string; path: string }>;
      };
    };
  };
}

let manifest: SmokeManifest;

beforeAll(async () => {
  const raw = await fs.readFile(
    path.join(fixturesRoot, 'manifest.json'),
    'utf8',
  );
  manifest = JSON.parse(raw) as SmokeManifest;
});

describe('scanLibrary — library-smoke fixture', () => {
  it('discovers the expected photos with the expected dimensions', async () => {
    const result = await scanLibrary(await fs.realpath(smokeRoot));
    const expected = manifest.libraries['library-smoke'].expected;

    expect(result.warnings).toEqual([]);
    expect(result.photos).toHaveLength(expected.photoCount);

    const byPath = new Map(result.photos.map((p) => [p.relativePath, p]));
    for (const ep of expected.photos) {
      const actual = byPath.get(ep.relativePath);
      expect(
        actual,
        `expected to discover ${ep.relativePath}`,
      ).toBeDefined();
      expect(actual!.width).toBe(ep.width);
      expect(actual!.height).toBe(ep.height);
      expect(actual!.year).toBe(ep.year);
      expect(actual!.yearSource).toBe(ep.yearSource);
      expect(actual!.aspectRatio).toBeCloseTo(ep.width / ep.height, 5);
    }
  });

  it('sorts photos by normalized relative path so default ordering is deterministic', async () => {
    const result = await scanLibrary(await fs.realpath(smokeRoot));
    const paths = result.photos.map((p) => p.relativePath);
    const sorted = [...paths].sort();
    expect(paths).toEqual(sorted);
  });

  it('builds year facets that match the manifest', async () => {
    const result = await scanLibrary(await fs.realpath(smokeRoot));
    expect(result.years).toEqual(
      manifest.libraries['library-smoke'].expected.yearFacets,
    );
  });

  it('builds top-level folder facets with correct subtree counts', async () => {
    const result = await scanLibrary(await fs.realpath(smokeRoot));
    const expectedTop =
      manifest.libraries['library-smoke'].expected.topLevelFolders;
    for (const ef of expectedTop) {
      const actual = result.folders.find((f) => f.path === ef.path);
      expect(actual, `missing folder facet for ${ef.path}`).toBeDefined();
      expect(actual!.depth).toBe(1);
      expect(actual!.photoCount).toBe(ef.photoCount);
      expect(actual!.directPhotoCount).toBe(ef.directPhotoCount);
    }
    // Root folder facet should aggregate everything.
    const root = result.folders.find((f) => f.path === '');
    expect(root).toBeDefined();
    expect(root!.depth).toBe(0);
    expect(root!.photoCount).toBe(
      manifest.libraries['library-smoke'].expected.photoCount,
    );
  });

  it('silently skips non-image files at the root (no warnings)', async () => {
    const result = await scanLibrary(await fs.realpath(smokeRoot));
    expect(
      result.photos.some((p) => p.filename === 'NOTES.txt'),
    ).toBe(false);
    expect(result.warnings).toEqual([]);
  });
});

describe('scanLibrary — library-edge fixture', () => {
  it('handles hidden entries, unsupported files, rootward years, missing years, and corrupt images', async () => {
    const result = await scanLibrary(await fs.realpath(edgeRoot));
    const expected = manifest.libraries['library-edge'].expected;

    expect(result.photos).toHaveLength(expected.photoCount);

    const byPath = new Map(result.photos.map((p) => [p.relativePath, p]));
    for (const ep of expected.photos) {
      const actual = byPath.get(ep.relativePath);
      expect(actual, `expected ${ep.relativePath}`).toBeDefined();
      expect(actual!.year).toBe(ep.year);
      expect(actual!.yearSource).toBe(ep.yearSource);
    }

    // Hidden entries must not surface anywhere.
    expect(
      result.photos.some((p) => p.relativePath.includes('.hidden')),
    ).toBe(false);
    expect(
      result.warnings.some((w) => w.path.includes('.hidden')),
    ).toBe(false);

    // Corrupt image must emit exactly one metadata-failed warning.
    const corruptWarnings = result.warnings.filter(
      (w) =>
        w.kind === 'metadata-failed' && w.path === 'corrupt/broken.jpg',
    );
    expect(corruptWarnings).toHaveLength(1);
    expect(result.warnings.length).toBe(expected.warningCount);
  });
});

describe('scanLibrary — symlink and root-escape handling', () => {
  let tmpRoot: string;
  let outsideDir: string;

  beforeAll(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-wall-walk-'));
    outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-wall-outside-'));

    // One good photo so the scan has something to compare against.
    await fs.mkdir(path.join(tmpRoot, '2024'), { recursive: true });
    await sharp({
      create: {
        width: 24,
        height: 24,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .jpeg({ quality: 60 })
      .toFile(path.join(tmpRoot, '2024', 'inside.jpg'));

    // An "outside" target the symlink will point to.
    await sharp({
      create: {
        width: 24,
        height: 24,
        channels: 3,
        background: { r: 40, g: 50, b: 60 },
      },
    })
      .jpeg({ quality: 60 })
      .toFile(path.join(outsideDir, 'leak.jpg'));

    // Symlink inside the root pointing outside — must be skipped with a warning.
    await fs.symlink(
      path.join(outsideDir, 'leak.jpg'),
      path.join(tmpRoot, '2024', 'leak-symlink.jpg'),
    );

    // Symlink inside the root pointing to another file inside the root —
    // still skipped (we never follow symlinks at all).
    await fs.symlink(
      path.join(tmpRoot, '2024', 'inside.jpg'),
      path.join(tmpRoot, '2024', 'dup-symlink.jpg'),
    );
  });

  afterAll(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
    await fs.rm(outsideDir, { recursive: true, force: true });
  });

  it('skips symlinks without following them and records a warning', async () => {
    const result = await scanLibrary(await fs.realpath(tmpRoot));

    // The real photo was discovered.
    expect(
      result.photos.some((p) => p.relativePath === '2024/inside.jpg'),
    ).toBe(true);

    // Neither symlink shows up as a photo.
    expect(
      result.photos.some((p) =>
        p.relativePath.endsWith('leak-symlink.jpg'),
      ),
    ).toBe(false);
    expect(
      result.photos.some((p) =>
        p.relativePath.endsWith('dup-symlink.jpg'),
      ),
    ).toBe(false);

    // Both symlinks produce a symlink-skipped warning.
    const symlinkWarnings = result.warnings.filter(
      (w) => w.kind === 'symlink-skipped',
    );
    expect(symlinkWarnings).toHaveLength(2);
  });
});
