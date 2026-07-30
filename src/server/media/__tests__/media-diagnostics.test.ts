import { describe, expect, it } from 'vitest';
import type { DerivativeService } from '../derivative-service.js';
import { MediaDiagnostics } from '../media-diagnostics.js';
import type { LibraryService } from '../../snapshots/library-service.js';

function dependencies(options?: {
  scanState?: 'idle' | 'scanning' | 'ready' | 'error';
  photoCount?: number;
  queuedRenders?: number;
}) {
  const scanState = options?.scanState ?? 'ready';
  const photoCount = options?.photoCount ?? 3;
  const library = {
    getStateView: () => ({
      state: scanState,
      warmLoaded: false,
      active: photoCount >= 0 ? {} : null,
      lastError: null,
      lastRescanStartedAt: null,
      lastRescanCompletedAt: null,
    }),
    getActiveSnapshot: () => ({
      photoCount,
      warnings: [],
    }),
  } as unknown as LibraryService;
  const derivatives = {
    getMetrics: () => ({
      activeRenders: 1,
      queuedRenders: options?.queuedRenders ?? 0,
      inFlightRenders: 1,
    }),
  } as unknown as DerivativeService;
  return { library, derivatives };
}

describe('MediaDiagnostics', () => {
  it('records only fixed aggregate dimensions and latency buckets', () => {
    const diagnostics = new MediaDiagnostics(() => new Date('2026-07-28T12:00:00Z'));
    diagnostics.record({
      variant: 'thumb',
      format: 'webp',
      status: 200,
      reason: 'success_rendered',
      durationMs: 75,
    });

    const snapshot = diagnostics.snapshot(dependencies());
    expect(snapshot.requestCounters.total).toBe(1);
    expect(snapshot.requestCounters.byReason.success_rendered).toBe(1);
    expect(snapshot.requestCounters.byVariant.thumb).toBe(1);
    expect(snapshot.requestCounters.latencyMs.le_200).toBe(1);
    expect(JSON.stringify(snapshot)).not.toMatch(/photoId|libraryRoot|filePath|url/i);
  });

  it('expires failure heuristics while preserving cumulative counters', () => {
    let now = new Date('2026-07-28T12:00:00Z');
    const diagnostics = new MediaDiagnostics(() => now);
    diagnostics.record({
      variant: 'wall',
      format: 'webp',
      status: 500,
      reason: 'render_failed',
      durationMs: 10,
    });

    expect(diagnostics.snapshot(dependencies()).heuristics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'derivative_delivery_failures',
          evidence: expect.objectContaining({ cumulativeCount: 1 }),
        }),
      ]),
    );

    now = new Date('2026-07-28T12:06:00Z');
    const later = diagnostics.snapshot(dependencies());
    expect(later.requestCounters.byReason.render_failed).toBe(1);
    expect(later.heuristics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'derivative_delivery_failures' }),
      ]),
    );
  });

  it('reports current library and derivative-pressure heuristics', () => {
    const diagnostics = new MediaDiagnostics();
    const snapshot = diagnostics.snapshot(
      dependencies({ scanState: 'scanning', photoCount: 0, queuedRenders: 2 }),
    );
    expect(snapshot.heuristics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'no_photos_discovered' }),
        expect.objectContaining({ code: 'derivative_backpressure' }),
      ]),
    );
  });
});
