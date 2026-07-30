import { describe, expect, it } from 'vitest';
import {
  collectDisplayedTextureSources,
  evictInactiveTextures,
  TextureLoadScheduler,
  touchTexture,
} from '../textureScheduler.js';

describe('TextureLoadScheduler', () => {
  it('coalesces same-key work and bounds distinct concurrent loads', async () => {
    const scheduler = new TextureLoadScheduler<string>(1);
    let releaseFirst!: () => void;
    const firstWork = new Promise<string>((resolve) => { releaseFirst = () => resolve('first'); });
    const first = scheduler.load('a', () => firstWork);
    const duplicate = scheduler.load('a', () => Promise.resolve('should-not-run'));
    const second = scheduler.load('b', () => Promise.resolve('second'));

    expect(scheduler.getMetrics()).toEqual({ active: 1, queued: 1, pending: 2 });
    releaseFirst();
    await expect(first).resolves.toBe('first');
    await expect(duplicate).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
    expect(scheduler.getMetrics()).toEqual({ active: 0, queued: 0, pending: 0 });
  });

  it('rejects a concurrency limit that cannot make progress', () => {
    expect(() => new TextureLoadScheduler<string>(0)).toThrow(/maxConcurrentLoads/);
  });

  it('starts higher-priority queued work before older lower-priority work', async () => {
    const scheduler = new TextureLoadScheduler<string>(1);
    const starts: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const first = scheduler.load('first', async () => {
      starts.push('first');
      await firstGate;
      return 'first';
    });
    const low = scheduler.load('low', async () => {
      starts.push('low');
      return 'low';
    }, 1);
    const high = scheduler.load('high', async () => {
      starts.push('high');
      return 'high';
    }, 10);

    expect(starts).toEqual(['first']);
    releaseFirst();
    await expect(Promise.all([first, low, high])).resolves.toEqual([
      'first',
      'low',
      'high',
    ]);
    expect(starts).toEqual(['first', 'high', 'low']);
  });

  it('releases capacity after a failed load', async () => {
    const scheduler = new TextureLoadScheduler<string>(1);
    const failed = scheduler.load('failed', async () => {
      throw new Error('decode failed');
    });
    const recovered = scheduler.load('recovered', async () => 'recovered');

    await expect(failed).rejects.toThrow('decode failed');
    await expect(recovered).resolves.toBe('recovered');
    expect(scheduler.getMetrics()).toEqual({ active: 0, queued: 0, pending: 0 });
  });

  it('retains the texture still displayed while a replacement is pending', () => {
    const sources = collectDisplayedTextureSources([
      { displayedSrc: 'old-thumb' },
      { displayedSrc: null },
    ]);

    expect(sources).toEqual(new Set(['old-thumb']));
  });

  it('evicts only inactive least-recently-used textures above the cap', () => {
    const destroyed: string[] = [];
    const cache = new Map<string, { destroy: () => void }>();
    touchTexture(cache, 'old', { destroy: () => destroyed.push('old') });
    touchTexture(cache, 'active', { destroy: () => destroyed.push('active') });
    touchTexture(cache, 'new', { destroy: () => destroyed.push('new') });

    evictInactiveTextures(cache, new Set(['active']), 1);

    expect([...cache.keys()]).toEqual(['active']);
    expect(destroyed).toEqual(['old', 'new']);
  });
});
