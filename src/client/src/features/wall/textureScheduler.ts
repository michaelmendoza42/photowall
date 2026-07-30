interface QueuedTextureLoad {
  start: () => void;
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
        this.queued.push({ start, priority, order: this.nextOrder });
        this.nextOrder += 1;
        this.queued.sort((left, right) =>
          right.priority - left.priority || left.order - right.order,
        );
      }
    });
    this.pending.set(key, promise);
    return promise;
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
 * this a least-recently-used cache. Active sources are never evicted.
 */
export function evictInactiveTextures<T extends { destroy: (destroyBase?: boolean) => void }>(
  cache: Map<string, T>,
  activeSources: ReadonlySet<string>,
  maxEntries: number,
  dispose: (texture: T) => void = (texture) => texture.destroy(true),
): void {
  for (const [src, texture] of cache) {
    if (cache.size <= maxEntries) return;
    if (activeSources.has(src)) continue;
    cache.delete(src);
    dispose(texture);
  }
}

export function touchTexture<T>(cache: Map<string, T>, src: string, texture: T): void {
  cache.delete(src);
  cache.set(src, texture);
}
