import type { MediaFormat, MediaVariant } from '../../shared/api/media.js';
import type { PersistedSnapshot } from '../snapshots/schema.js';
import type { PhotoEdit } from '../../shared/api/edits.js';
import type { DerivativeService, DerivativeServiceLogger } from './derivative-service.js';

export interface DerivativeWarmerOptions {
  derivatives: Pick<DerivativeService, 'generate'>;
  logger?: DerivativeServiceLogger;
  /** Variants the wall shows before the user zooms in close. */
  variants?: readonly MediaVariant[];
  format?: MediaFormat;
  /** Background renders in flight; keep below the service's permit cap. */
  concurrency?: number;
  /** The curator's edit for a photo path, so warm renders match what the wall asks for. */
  editFor?: (relativePath: string) => PhotoEdit | undefined;
}

export interface DerivativeWarmerMetrics {
  running: boolean;
  snapshotId: string | null;
  total: number;
  done: number;
  rendered: number;
  failed: number;
}

/**
 * Pre-generates the wall's overview derivatives for a whole snapshot so
 * panning hits the disk cache instead of decoding full-size originals on
 * demand. Cached entries cost one stat; misses render at background
 * priority, behind any waiting browser request. Starting a new run (a new
 * snapshot) stops the previous one.
 */
export class DerivativeWarmer {
  private readonly derivatives: Pick<DerivativeService, 'generate'>;
  private readonly logger?: DerivativeServiceLogger;
  private readonly variants: readonly MediaVariant[];
  private readonly format: MediaFormat;
  private readonly concurrency: number;
  private readonly editFor?: (relativePath: string) => PhotoEdit | undefined;
  private generation = 0;
  private metrics: DerivativeWarmerMetrics = {
    running: false,
    snapshotId: null,
    total: 0,
    done: 0,
    rendered: 0,
    failed: 0,
  };

  constructor(options: DerivativeWarmerOptions) {
    this.derivatives = options.derivatives;
    this.logger = options.logger;
    this.variants = options.variants ?? ['thumb', 'wall'];
    this.format = options.format ?? 'webp';
    this.concurrency = options.concurrency ?? 2;
    this.editFor = options.editFor;
    if (!Number.isInteger(this.concurrency) || this.concurrency < 1) {
      throw new RangeError('concurrency must be a positive integer');
    }
  }

  getMetrics(): DerivativeWarmerMetrics {
    return { ...this.metrics };
  }

  stop(): void {
    this.generation += 1;
    this.metrics.running = false;
  }

  async warm(snapshot: PersistedSnapshot): Promise<DerivativeWarmerMetrics> {
    this.generation += 1;
    const generation = this.generation;
    const jobs = snapshot.photos.flatMap((photo) =>
      this.variants.map((variant) => ({
        photoId: photo.id,
        variant,
        edit: this.editFor?.(photo.relativePath),
      })),
    );
    this.metrics = {
      running: true,
      snapshotId: snapshot.snapshotId,
      total: jobs.length,
      done: 0,
      rendered: 0,
      failed: 0,
    };
    const startedAt = Date.now();
    this.logger?.info?.(
      { snapshotId: snapshot.snapshotId, jobs: jobs.length, variants: this.variants },
      'derivative warm-up started',
    );

    let next = 0;
    const progressEvery = Math.max(500, Math.ceil(jobs.length / 20));
    const worker = async (): Promise<void> => {
      while (generation === this.generation && next < jobs.length) {
        const job = jobs[next]!;
        next += 1;
        try {
          const outcome = await this.derivatives.generate(
            snapshot,
            {
              photoId: job.photoId,
              variant: job.variant,
              format: this.format,
              ...(job.edit ? { edit: job.edit } : {}),
            },
            'background',
          );
          if (generation !== this.generation) return;
          if (!outcome.ok) this.metrics.failed += 1;
          else if (!outcome.fromCache) this.metrics.rendered += 1;
        } catch {
          if (generation !== this.generation) return;
          this.metrics.failed += 1;
        }
        this.metrics.done += 1;
        if (this.metrics.done % progressEvery === 0) {
          this.logger?.info?.({ ...this.metrics }, 'derivative warm-up progress');
        }
      }
    };

    await Promise.all(Array.from({ length: this.concurrency }, worker));
    if (generation === this.generation) {
      this.metrics.running = false;
      this.logger?.info?.(
        { ...this.metrics, durationMs: Date.now() - startedAt },
        'derivative warm-up finished',
      );
    }
    return this.getMetrics();
  }
}
