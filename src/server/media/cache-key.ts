import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  mediaFileExtension,
  type MediaFormat,
  type MediaVariant,
} from '../../shared/api/media.js';

/**
 * Bump when the cache layout, key inputs, or derivative pipeline output
 * change in a way that would make existing cache entries semantically
 * wrong. Existing files under earlier prefixes are harmless on disk and
 * simply become unreachable.
 */
// v2 invalidates pre-512px thumbnail derivatives created under v1.
export const CACHE_LAYOUT_VERSION = 'v2';

export interface CacheKeyInput {
  photoId: string;
  /** Distinguishes identical relative IDs stored under different configured roots. */
  libraryRoot: string;
  variant: MediaVariant;
  format: MediaFormat;
  /**
   * Stable fingerprint of the source file (mtime + size). When the
   * source file changes on disk and the scanner records new metadata,
   * this fingerprint changes and the next request misses cache.
   */
  sourceFingerprint: string;
  /** Fingerprint of the curator's edit; absent for the original photo. */
  editVersion?: string;
}

/**
 * Deterministic cache key. SHA-256 keeps collisions out of reach and
 * the layout version is mixed into the input so a future pipeline
 * change cannot accidentally serve a stale-but-key-compatible file.
 */
export function computeCacheKey(input: CacheKeyInput): string {
  const hash = createHash('sha256');
  hash.update(CACHE_LAYOUT_VERSION);
  hash.update('\0');
  hash.update(input.photoId);
  hash.update('\0');
  hash.update(input.libraryRoot);
  hash.update('\0');
  hash.update(input.variant);
  hash.update('\0');
  hash.update(input.format);
  hash.update('\0');
  hash.update(input.sourceFingerprint);
  // Only edited photos mix this in, so existing cache entries stay valid.
  if (input.editVersion) {
    hash.update('\0edit:');
    hash.update(input.editVersion);
  }
  return hash.digest('hex');
}

/**
 * Resolve a cache key to its on-disk path. Files are sharded by the
 * first two hex characters so a single directory never collects more
 * than ~1/256 of entries even at large libraries.
 */
export function cacheFilePath(cacheRoot: string, input: CacheKeyInput): string {
  const key = computeCacheKey(input);
  const ext = mediaFileExtension(input.format);
  return path.join(
    cacheRoot,
    CACHE_LAYOUT_VERSION,
    key.slice(0, 2),
    `${key.slice(2)}.${ext}`,
  );
}

/**
 * Source fingerprint derived from filesystem metadata available on the
 * snapshot photo record. Kept short and deterministic; the cache key
 * hash absorbs the entropy.
 */
export function sourceFingerprint(mtimeMs: number, fileSize: number): string {
  return `${Math.trunc(mtimeMs)}-${fileSize}`;
}
