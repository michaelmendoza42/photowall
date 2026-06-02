import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import {
  MEDIA_VARIANT_SPECS,
  type MediaFormat,
  type MediaVariant,
} from '../../shared/api/media.js';
import type { PersistedSnapshot } from '../snapshots/schema.js';
import {
  cacheFilePath,
  computeCacheKey,
  sourceFingerprint,
} from './cache-key.js';
import {
  resolveSafeSourcePath,
  type SourceResolutionFailure,
} from './source-resolver.js';

export interface DerivativeServiceLogger {
  debug?: (obj: unknown, msg?: string) => void;
  info?: (obj: unknown, msg?: string) => void;
  warn?: (obj: unknown, msg?: string) => void;
  error?: (obj: unknown, msg?: string) => void;
}

export interface DerivativeServiceOptions {
  cacheRoot: string;
  logger?: DerivativeServiceLogger;
}

export interface DerivativeRequest {
  photoId: string;
  variant: MediaVariant;
  format: MediaFormat;
}

export type DerivativeOutcome =
  | {
      ok: true;
      filePath: string;
      cacheKey: string;
      fromCache: boolean;
      sourceMtimeMs: number;
      sourceFileSize: number;
    }
  | { ok: false; failure: DerivativeFailure };

export type DerivativeFailure =
  | SourceResolutionFailure
  | { kind: 'render_failed'; detail: string };

/**
 * On-demand derivative pipeline. Each request resolves a snapshot photo
 * id to a safe source path, computes a deterministic cache key that
 * folds in the source fingerprint, and returns a file path the caller
 * can stream to the client.
 *
 * Caching policy:
 *   - cache hits skip Sharp entirely and re-use the existing file
 *   - cache writes are atomic (temp + rename) so partial writes are
 *     never visible to a concurrent reader
 *   - invalidation is implicit: a source file change updates the
 *     snapshot's mtime/size, which changes the cache key, which forces
 *     the next request to render fresh
 *
 * No in-process locking: two concurrent requests for the same key both
 * write to their own temp file and rename onto the same target. The
 * last rename wins; both files were byte-identical from a deterministic
 * pipeline. The cost is a small amount of duplicate CPU work on a cold
 * cache, which is acceptable for an MVP single-operator LAN app.
 */
export class DerivativeService {
  private readonly cacheRoot: string;
  private readonly logger?: DerivativeServiceLogger;

  constructor(options: DerivativeServiceOptions) {
    this.cacheRoot = options.cacheRoot;
    this.logger = options.logger;
  }

  getCacheRoot(): string {
    return this.cacheRoot;
  }

  async generate(
    snapshot: PersistedSnapshot,
    request: DerivativeRequest,
  ): Promise<DerivativeOutcome> {
    const resolved = await resolveSafeSourcePath(snapshot, request.photoId);
    if (!resolved.ok) {
      return { ok: false, failure: resolved.failure };
    }

    const fingerprint = sourceFingerprint(
      resolved.mtimeMs,
      resolved.fileSize,
    );
    const keyInput = {
      photoId: resolved.photoId,
      variant: request.variant,
      format: request.format,
      sourceFingerprint: fingerprint,
    };
    const cacheKey = computeCacheKey(keyInput);
    const target = cacheFilePath(this.cacheRoot, keyInput);

    if (await fileExists(target)) {
      this.logger?.debug?.(
        { photoId: resolved.photoId, variant: request.variant, format: request.format },
        'derivative cache hit',
      );
      return {
        ok: true,
        filePath: target,
        cacheKey,
        fromCache: true,
        sourceMtimeMs: resolved.mtimeMs,
        sourceFileSize: resolved.fileSize,
      };
    }

    try {
      await renderToFile(resolved.absolutePath, target, request);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger?.error?.(
        { photoId: resolved.photoId, variant: request.variant, err: detail },
        'derivative render failed',
      );
      return { ok: false, failure: { kind: 'render_failed', detail } };
    }

    this.logger?.debug?.(
      { photoId: resolved.photoId, variant: request.variant, format: request.format },
      'derivative cache miss — rendered fresh',
    );
    return {
      ok: true,
      filePath: target,
      cacheKey,
      fromCache: false,
      sourceMtimeMs: resolved.mtimeMs,
      sourceFileSize: resolved.fileSize,
    };
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function renderToFile(
  sourceAbsolutePath: string,
  targetFile: string,
  request: DerivativeRequest,
): Promise<void> {
  const spec = MEDIA_VARIANT_SPECS[request.variant];
  await fs.mkdir(path.dirname(targetFile), { recursive: true });
  const tmp = `${targetFile}.${randomUUID()}.tmp`;

  const pipeline = sharp(sourceAbsolutePath)
    .rotate()
    .resize({
      width: spec.longEdge,
      height: spec.longEdge,
      fit: 'inside',
      withoutEnlargement: true,
    });

  const finalized =
    request.format === 'webp'
      ? pipeline.webp({ quality: spec.quality })
      : pipeline.jpeg({ quality: spec.quality, mozjpeg: true });

  try {
    await finalized.toFile(tmp);
    await fs.rename(tmp, targetFile);
  } catch (err) {
    await safeUnlink(tmp);
    throw err;
  }
}

async function safeUnlink(p: string): Promise<void> {
  try {
    await fs.unlink(p);
  } catch {
    // best-effort
  }
}
