import { describe, expect, it } from 'vitest';
import {
  MEDIA_VARIANT_SPECS,
  THUMBNAIL_LONG_EDGE_PX,
  mediaResourcePath,
} from './media.js';

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

  it('keeps overview thumbnail resolution on one shared tuning point', () => {
    expect(THUMBNAIL_LONG_EDGE_PX).toBe(512);
    expect(MEDIA_VARIANT_SPECS.thumb.longEdge).toBe(THUMBNAIL_LONG_EDGE_PX);
  });
});
