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
import { editVersion, type PhotoEdit } from '../../shared/api/edits.js';
import { renderEdit } from './edit-render.js';
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
  /** Caps CPU/disk-heavy cold Sharp renders; cache hits bypass this queue. */
  maxConcurrentRenders?: number;
}

export interface DerivativeRequest {
  photoId: string;
  variant: MediaVariant;
  format: MediaFormat;
  /** The curator's light edit to apply; the original file is never changed. */
  edit?: PhotoEdit;
}

/**
 * Browser requests are interactive. Background warming only takes a render
 * permit when no interactive request is waiting for one.
 */
export type RenderPriority = 'interactive' | 'background';

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
  private readonly maxConcurrentRenders: number;
  private readonly inFlight = new Map<string, Promise<DerivativeOutcome>>();
  private activeRenders = 0;
  private queuedRenders = 0;
  private readonly interactiveWaiters: Array<() => void> = [];
  private readonly backgroundWaiters: Array<() => void> = [];

  constructor(options: DerivativeServiceOptions) {
    this.cacheRoot = options.cacheRoot;
    this.logger = options.logger;
    const maxConcurrentRenders = options.maxConcurrentRenders ?? 4;
    if (!Number.isInteger(maxConcurrentRenders) || maxConcurrentRenders < 1) {
      throw new RangeError('maxConcurrentRenders must be a positive integer');
    }
    this.maxConcurrentRenders = maxConcurrentRenders;
  }

  getCacheRoot(): string {
    return this.cacheRoot;
  }

  getMetrics(): { activeRenders: number; queuedRenders: number; inFlightRenders: number } {
    return {
      activeRenders: this.activeRenders,
      queuedRenders: this.queuedRenders,
      inFlightRenders: this.inFlight.size,
    };
  }

  async generate(
    snapshot: PersistedSnapshot,
    request: DerivativeRequest,
    priority: RenderPriority = 'interactive',
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
      libraryRoot: snapshot.libraryRoot,
      variant: request.variant,
      format: request.format,
      sourceFingerprint: fingerprint,
      ...(request.edit ? { editVersion: editVersion(request.edit) } : {}),
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

    const existingRender = this.inFlight.get(cacheKey);
    if (existingRender) return existingRender;

    const render = this.renderWithPermit(async () => {
      // Another queued request may have populated the cache while this one waited.
      if (await fileExists(target)) {
        return {
          ok: true as const,
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
        return { ok: false as const, failure: { kind: 'render_failed' as const, detail } };
      }
      this.logger?.debug?.(
        { photoId: resolved.photoId, variant: request.variant, format: request.format },
        'derivative cache miss — rendered fresh',
      );
      return {
        ok: true as const,
        filePath: target,
        cacheKey,
        fromCache: false,
        sourceMtimeMs: resolved.mtimeMs,
        sourceFileSize: resolved.fileSize,
      };
    }, priority);
    this.inFlight.set(cacheKey, render);
    try {
      return await render;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  protected async renderWithPermit<T>(
    work: () => Promise<T>,
    priority: RenderPriority = 'interactive',
  ): Promise<T> {
    if (this.activeRenders >= this.maxConcurrentRenders) {
      const waiters =
        priority === 'interactive' ? this.interactiveWaiters : this.backgroundWaiters;
      this.queuedRenders += 1;
      await new Promise<void>((resolve) => waiters.push(resolve));
      this.queuedRenders -= 1;
    } else {
      this.activeRenders += 1;
    }
    try {
      return await work();
    } finally {
      // Hand the permit straight to the next waiter (interactive first) so a
      // newly arriving request can't jump the queue between release and wake.
      const next = this.interactiveWaiters.shift() ?? this.backgroundWaiters.shift();
      if (next) next();
      else this.activeRenders -= 1;
    }
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

  const pipeline = request.edit
    ? await renderEdit(sourceAbsolutePath, request.edit, spec.longEdge)
    : sharp(sourceAbsolutePath).rotate().resize({
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
