import type { MediaVariant } from '../../../../shared/api/media.js';

export const BROWSER_MEDIA_DIAGNOSTIC_EVENTS = [
  'requested',
  'image_ready',
  'decode_fallback',
  'texture_created',
  'sprite_applied',
  'load_failed',
  'texture_create_failed',
  'superseded',
] as const;

export type BrowserMediaDiagnosticEvent =
  (typeof BROWSER_MEDIA_DIAGNOSTIC_EVENTS)[number];

const VARIANTS = ['thumb', 'wall', 'modal', 'detail', 'unknown'] as const;
type DiagnosticVariant = MediaVariant | 'unknown';

export class BrowserMediaDiagnostics {
  private readonly startedAt = new Date().toISOString();
  private readonly byEvent = zeroRecord(BROWSER_MEDIA_DIAGNOSTIC_EVENTS);
  private readonly byVariant = zeroRecord(VARIANTS);
  private lastFailureAt: string | null = null;
  private scheduler: { getMetrics: () => { active: number; queued: number; pending: number } } | null = null;

  record(event: BrowserMediaDiagnosticEvent, variant: DiagnosticVariant): void {
    this.byEvent[event] += 1;
    this.byVariant[variant] += 1;
    if (event === 'load_failed' || event === 'texture_create_failed') {
      this.lastFailureAt = new Date().toISOString();
    }
  }

  registerScheduler(scheduler: { getMetrics: () => { active: number; queued: number; pending: number } }): () => void {
    this.scheduler = scheduler;
    return () => {
      if (this.scheduler === scheduler) this.scheduler = null;
    };
  }

  snapshot(): BrowserMediaDiagnosticsSnapshot {
    const scheduler = this.scheduler?.getMetrics() ?? { active: 0, queued: 0, pending: 0 };
    const heuristics: BrowserMediaDiagnosticsSnapshot['heuristics'] = [];
    if (this.byEvent.load_failed > 0 || this.byEvent.texture_create_failed > 0) {
      heuristics.push({
        code: 'browser_texture_failures_observed',
        severity: 'error',
        evidence: {
          loadFailed: this.byEvent.load_failed,
          textureCreateFailed: this.byEvent.texture_create_failed,
          lastFailureAt: this.lastFailureAt,
        },
      });
    }
    if (scheduler.queued > 0) {
      heuristics.push({
        code: 'browser_texture_backpressure',
        severity: 'warning',
        evidence: { ...scheduler },
      });
    }
    if (this.byEvent.decode_fallback > 0) {
      heuristics.push({
        code: 'decode_fallbacks_observed',
        severity: 'info',
        evidence: { count: this.byEvent.decode_fallback },
      });
    }

    return {
      startedAt: this.startedAt,
      generatedAt: new Date().toISOString(),
      counters: {
        byEvent: { ...this.byEvent },
        byVariant: { ...this.byVariant },
      },
      scheduler,
      heuristics,
    };
  }
}

export interface BrowserMediaDiagnosticsSnapshot {
  startedAt: string;
  generatedAt: string;
  counters: {
    byEvent: Record<BrowserMediaDiagnosticEvent, number>;
    byVariant: Record<DiagnosticVariant, number>;
  };
  scheduler: { active: number; queued: number; pending: number };
  heuristics: Array<{
    code:
      | 'browser_texture_failures_observed'
      | 'browser_texture_backpressure'
      | 'decode_fallbacks_observed';
    severity: 'info' | 'warning' | 'error';
    evidence: Record<string, string | number | null>;
  }>;
}

export const browserMediaDiagnostics = new BrowserMediaDiagnostics();

export async function waitForMediaImage(
  image: Pick<HTMLImageElement, 'decode' | 'onerror' | 'onload' | 'src'>,
  src: string,
  options: { timeoutMs?: number; onDecodeFallback?: () => void } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  let decodeRejected = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Media image load failed'));
  });
  image.src = src;
  const decoded = image.decode().catch((error: unknown) => {
    decodeRejected = true;
    throw error;
  });
  const timedOut = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error('Media image load timed out')), timeoutMs);
  });

  try {
    try {
      await Promise.race([decoded, loaded, timedOut]);
    } catch (error) {
      if (!decodeRejected) throw error;
      options.onDecodeFallback?.();
      await Promise.race([loaded, timedOut]);
    }
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function mediaVariantFromSource(src: string): DiagnosticVariant {
  try {
    const variant = new URL(src, globalThis.location?.origin ?? 'http://localhost')
      .searchParams.get('variant');
    return variant === 'thumb' || variant === 'wall' || variant === 'modal' || variant === 'detail'
      ? variant
      : 'unknown';
  } catch {
    return 'unknown';
  }
}

const diagnosticsHandle = Object.freeze({
  snapshot: (): BrowserMediaDiagnosticsSnapshot => browserMediaDiagnostics.snapshot(),
});

(globalThis as typeof globalThis & {
  photoWallMediaDiagnostics?: typeof diagnosticsHandle;
}).photoWallMediaDiagnostics = diagnosticsHandle;

function zeroRecord<const T extends readonly string[]>(keys: T): Record<T[number], number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T[number], number>;
}
