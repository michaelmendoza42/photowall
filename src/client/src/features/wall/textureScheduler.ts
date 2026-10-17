interface QueuedTextureLoad {
  key: string;
  start: () => void;
  cancel: () => void;
  priority: number;
  order: number;
}

/** Bounded, priority-ordered, same-key-coalescing texture decoding work. */
export class TextureLoadScheduler<T> {
  private active = 0;
  private readonly queued: QueuedTextureLoad[] = [];
  private readonly pending = new Map<string, Promise<T>>();
  private nextOrder = 0;

  constructor(private readonly maxConcurrentLoads: number) {
    if (!Number.isInteger(maxConcurrentLoads) || maxConcurrentLoads < 1) {
      throw new RangeError('maxConcurrentLoads must be a positive integer');
    }
  }

  load(key: string, work: () => Promise<T>, priority = 0): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) return existing;

    const promise = new Promise<T>((resolve, reject) => {
      const start = () => {
        this.active += 1;
        void work().then(resolve, reject).finally(() => {
          this.active -= 1;
          this.pending.delete(key);
          this.queued.shift()?.start();
        });
      };
      if (this.active < this.maxConcurrentLoads) {
        start();
      } else {
        const cancel = () => reject(new Error('Media texture load superseded'));
        this.queued.push({ key, start, cancel, priority, order: this.nextOrder });
        this.nextOrder += 1;
        this.queued.sort((left, right) =>
          right.priority - left.priority || left.order - right.order,
        );
      }
    });
    this.pending.set(key, promise);
    return promise;
  }

  /**
   * Drop queued (not yet started) loads nobody wants any more, e.g. the
   * intermediate tiers a pinch zoom passed through. Their promises reject.
   */
  dropQueuedExcept(wantedKeys: ReadonlySet<string>): void {
    for (let index = this.queued.length - 1; index >= 0; index -= 1) {
      const entry = this.queued[index]!;
      if (wantedKeys.has(entry.key)) continue;
      this.queued.splice(index, 1);
      this.pending.delete(entry.key);
      entry.cancel();
    }
  }

  getMetrics(): { active: number; queued: number; pending: number } {
    return { active: this.active, queued: this.queued.length, pending: this.pending.size };
  }
}

export function collectDisplayedTextureSources(
  entries: Iterable<{ displayedSrc: string | null }>,
): Set<string> {
  const sources = new Set<string>();
  for (const entry of entries) {
    if (entry.displayedSrc) sources.add(entry.displayedSrc);
  }
  return sources;
}

/**
 * Maps retain insertion order, so touching a URL by moving it to the end makes
 * this a least-recently-used cache. Active sources are never evicted. With a
 * byte budget, large zoomed-in textures are also evicted once the cache holds
 * more than `maxBytes` (as measured by `sizeOf`).
 */
export function evictInactiveTextures<T extends { destroy: (destroyBase?: boolean) => void }>(
  cache: Map<string, T>,
  activeSources: ReadonlySet<string>,
  maxEntries: number,
  dispose: (texture: T) => void = (texture) => texture.destroy(true),
  budget?: { maxBytes: number; sizeOf: (texture: T) => number },
): void {
  let totalBytes = 0;
  if (budget) {
    for (const texture of cache.values()) totalBytes += budget.sizeOf(texture);
  }
  const overBudget = () =>
    cache.size > maxEntries || (budget !== undefined && totalBytes > budget.maxBytes);
  for (const [src, texture] of cache) {
    if (!overBudget()) return;
    if (activeSources.has(src)) continue;
    cache.delete(src);
    if (budget) totalBytes -= budget.sizeOf(texture);
    dispose(texture);
  }
}

export function touchTexture<T>(cache: Map<string, T>, src: string, texture: T): void {
  cache.delete(src);
  cache.set(src, texture);
}
