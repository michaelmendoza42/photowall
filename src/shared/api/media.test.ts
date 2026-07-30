import { describe, expect, it } from 'vitest';
import { mediaResourcePath } from './media.js';

describe('mediaResourcePath', () => {
  it('keeps the legacy path when no source version is supplied', () => {
    expect(mediaResourcePath('photo id', 'thumb')).toBe(
      '/api/media/photo%20id?variant=thumb&format=webp',
    );
  });

  it('adds an encoded opaque source version for immutable browser caches', () => {
    expect(mediaResourcePath('photo-1', 'wall', 'webp', 'mtime:12/34')).toBe(
      '/api/media/photo-1?variant=wall&format=webp&v=mtime%3A12%2F34',
    );
  });
});
