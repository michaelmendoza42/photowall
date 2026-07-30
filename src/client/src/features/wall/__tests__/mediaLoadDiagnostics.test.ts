import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BrowserMediaDiagnostics,
  mediaVariantFromSource,
  waitForMediaImage,
} from '../mediaLoadDiagnostics.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('BrowserMediaDiagnostics', () => {
  it('tracks fixed texture-pipeline stages without retaining source identifiers', () => {
    const diagnostics = new BrowserMediaDiagnostics();
    diagnostics.record('requested', 'thumb');
    diagnostics.record('image_ready', 'thumb');
    diagnostics.record('texture_created', 'thumb');
    diagnostics.record('sprite_applied', 'thumb');

    const snapshot = diagnostics.snapshot();
    expect(snapshot.counters.byEvent.requested).toBe(1);
    expect(snapshot.counters.byEvent.sprite_applied).toBe(1);
    expect(snapshot.counters.byVariant.thumb).toBe(4);
    expect(JSON.stringify(snapshot)).not.toMatch(/photoId|source|path|url/i);
  });

  it('classifies failures and queue pressure using aggregate evidence', () => {
    const diagnostics = new BrowserMediaDiagnostics();
    diagnostics.registerScheduler({
      getMetrics: () => ({ active: 4, queued: 7, pending: 11 }),
    });
    diagnostics.record('load_failed', 'wall');

    expect(diagnostics.snapshot().heuristics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'browser_texture_failures_observed' }),
        expect.objectContaining({ code: 'browser_texture_backpressure' }),
      ]),
    );
  });
});

describe('waitForMediaImage', () => {
  it('uses the load event when decode rejects', async () => {
    const onDecodeFallback = vi.fn();
    const image = fakeImage({
      decode: Promise.reject(new Error('decode unavailable')),
      load: true,
    });

    await expect(
      waitForMediaImage(image, '/media', { onDecodeFallback }),
    ).resolves.toBeUndefined();
    expect(onDecodeFallback).toHaveBeenCalledOnce();
  });

  it('times out stalled image work so scheduler capacity can recover', async () => {
    vi.useFakeTimers();
    const image = fakeImage({
      decode: new Promise<void>(() => undefined),
      load: false,
    });
    const result = waitForMediaImage(image, '/media', { timeoutMs: 25 });
    const assertion = expect(result).rejects.toThrow('Media image load timed out');

    await vi.advanceTimersByTimeAsync(25);
    await assertion;
  });
});

describe('mediaVariantFromSource', () => {
  it('extracts only supported fixed variants', () => {
    expect(mediaVariantFromSource('/api/media/a?variant=modal&format=webp')).toBe('modal');
    expect(mediaVariantFromSource('data:image/svg+xml,hello')).toBe('unknown');
    expect(mediaVariantFromSource('/api/media/a?variant=unexpected')).toBe('unknown');
  });
});

function fakeImage(options: { decode: Promise<void>; load: boolean }): Pick<
  HTMLImageElement,
  'decode' | 'onerror' | 'onload' | 'src'
> {
  let source = '';
  let image: Pick<HTMLImageElement, 'decode' | 'onerror' | 'onload' | 'src'>;
  image = {
    decode: () => options.decode,
    onerror: null,
    onload: null,
    get src() {
      return source;
    },
    set src(value: string) {
      source = value;
      const loadHandler = image.onload;
      if (options.load && loadHandler) {
        setTimeout(
          () => loadHandler.call(image as unknown as GlobalEventHandlers, new Event('load')),
          0,
        );
      }
    },
  };
  return image;
}
