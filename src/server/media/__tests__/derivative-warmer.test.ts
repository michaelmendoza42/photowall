import { describe, expect, it } from 'vitest';
import type { PersistedSnapshot } from '../../snapshots/schema.js';
import type { DerivativeOutcome, DerivativeRequest, RenderPriority } from '../derivative-service.js';
import { DerivativeWarmer } from '../derivative-warmer.js';

function snapshotWith(ids: string[], snapshotId = 'snap-1'): PersistedSnapshot {
  return {
    snapshotId,
    photos: ids.map((id) => ({ id })),
  } as unknown as PersistedSnapshot;
}

function fakeDerivatives(cached: Set<string>) {
  const calls: Array<{ request: DerivativeRequest; priority: RenderPriority }> = [];
  return {
    calls,
    generate: async (
      _snapshot: PersistedSnapshot,
      request: DerivativeRequest,
      priority: RenderPriority = 'interactive',
    ): Promise<DerivativeOutcome> => {
      calls.push({ request, priority });
      const key = `${request.photoId}:${request.variant}`;
      if (request.photoId === 'broken') {
        return { ok: false, failure: { kind: 'render_failed', detail: 'bad file' } };
      }
      const fromCache = cached.has(key);
      cached.add(key);
      return {
        ok: true,
        filePath: `/cache/${key}`,
        cacheKey: key,
        fromCache,
        sourceMtimeMs: 0,
        sourceFileSize: 0,
      };
    },
  };
}

describe('DerivativeWarmer', () => {
  it('warms every photo in each overview variant at background priority', async () => {
    const derivatives = fakeDerivatives(new Set(['a:thumb']));
    const warmer = new DerivativeWarmer({ derivatives, concurrency: 2 });

    const result = await warmer.warm(snapshotWith(['a', 'b', 'broken']));

    expect(result).toEqual({
      running: false,
      snapshotId: 'snap-1',
      total: 6,
      done: 6,
      rendered: 3,
      failed: 2,
    });
    expect(new Set(derivatives.calls.map((c) => `${c.request.photoId}:${c.request.variant}`)))
      .toEqual(new Set(['a:thumb', 'a:wall', 'b:thumb', 'b:wall', 'broken:thumb', 'broken:wall']));
    expect(derivatives.calls.every((c) => c.priority === 'background')).toBe(true);
    expect(derivatives.calls.every((c) => c.request.format === 'webp')).toBe(true);
  });

  it('stops an older run when a newer snapshot starts warming', async () => {
    const cached = new Set<string>();
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const calls: string[] = [];
    const derivatives = {
      generate: async (snapshot: PersistedSnapshot, request: DerivativeRequest) => {
        calls.push(`${snapshot.snapshotId}:${request.photoId}:${request.variant}`);
        if (snapshot.snapshotId === 'old') await firstBlocked;
        cached.add(request.photoId);
        return {
          ok: true as const,
          filePath: '',
          cacheKey: '',
          fromCache: false,
          sourceMtimeMs: 0,
          sourceFileSize: 0,
        };
      },
    };
    const warmer = new DerivativeWarmer({ derivatives, concurrency: 1, variants: ['thumb'] });

    const oldRun = warmer.warm(snapshotWith(['x', 'y', 'z'], 'old'));
    const newRun = warmer.warm(snapshotWith(['n'], 'new'));
    releaseFirst();
    await Promise.all([oldRun, newRun]);

    expect(calls).toEqual(['old:x:thumb', 'new:n:thumb']);
    expect(warmer.getMetrics()).toMatchObject({ snapshotId: 'new', done: 1, running: false });
  });
});
