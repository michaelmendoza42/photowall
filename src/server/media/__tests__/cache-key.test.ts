import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CACHE_LAYOUT_VERSION,
  cacheFilePath,
  computeCacheKey,
  sourceFingerprint,
} from '../cache-key.js';

describe('cache-key', () => {
  const baseInput = {
    photoId: 'abc123',
    libraryRoot: '/photos/library-a',
    variant: 'wall' as const,
    format: 'webp' as const,
    sourceFingerprint: '1700000000000-204800',
  };

  it('produces stable, deterministic keys for identical input', () => {
    const a = computeCacheKey(baseInput);
    const b = computeCacheKey({ ...baseInput });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the source fingerprint changes (invalidation property)', () => {
    const before = computeCacheKey(baseInput);
    const after = computeCacheKey({
      ...baseInput,
      sourceFingerprint: '1700000000001-204800',
    });
    expect(before).not.toBe(after);
  });

  it('changes when the configured library root changes', () => {
    const a = computeCacheKey(baseInput);
    const b = computeCacheKey({ ...baseInput, libraryRoot: '/photos/library-b' });
    expect(a).not.toBe(b);
  });

  it('changes when the variant changes', () => {
    const wall = computeCacheKey({ ...baseInput, variant: 'wall' });
    const modal = computeCacheKey({ ...baseInput, variant: 'modal' });
    expect(wall).not.toBe(modal);
  });

  it('changes when the format changes', () => {
    const webp = computeCacheKey({ ...baseInput, format: 'webp' });
    const jpeg = computeCacheKey({ ...baseInput, format: 'jpeg' });
    expect(webp).not.toBe(jpeg);
  });

  it('changes when the photoId changes', () => {
    const a = computeCacheKey(baseInput);
    const b = computeCacheKey({ ...baseInput, photoId: 'xyz789' });
    expect(a).not.toBe(b);
  });

  it('shards files under cacheRoot/<layout-version>/<2-char-prefix>/', () => {
    const file = cacheFilePath('/tmp/photo-wall-cache', baseInput);
    const parts = file.split(path.sep);
    expect(parts).toContain(CACHE_LAYOUT_VERSION);
    expect(file.endsWith('.webp')).toBe(true);
    const versionIdx = parts.indexOf(CACHE_LAYOUT_VERSION);
    expect(parts[versionIdx + 1]).toMatch(/^[0-9a-f]{2}$/);
    expect(parts[versionIdx + 2]).toMatch(/^[0-9a-f]{62}\.webp$/);
  });

  it('uses .jpg extension for jpeg format', () => {
    const file = cacheFilePath('/tmp/cache', { ...baseInput, format: 'jpeg' });
    expect(file.endsWith('.jpg')).toBe(true);
  });

  it('sourceFingerprint truncates fractional mtime to keep keys stable across reads', () => {
    expect(sourceFingerprint(1700000000123.456, 2048)).toBe(
      '1700000000123-2048',
    );
    expect(sourceFingerprint(1700000000123.999, 2048)).toBe(
      '1700000000123-2048',
    );
  });
});
