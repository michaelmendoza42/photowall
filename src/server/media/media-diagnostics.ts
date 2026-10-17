import type { MediaFormat, MediaVariant } from '../../shared/api/media.js';
import type { DerivativeService } from './derivative-service.js';
import type { LibraryService } from '../snapshots/library-service.js';

export const MEDIA_DIAGNOSTICS_PATH = '/api/diagnostics/media';

export const MEDIA_DIAGNOSTIC_REASONS = [
  'success_cache_hit',
  'success_rendered',
  'invalid_photo_id',
  'invalid_variant',
  'invalid_format',
  'snapshot_unavailable',
  'photo_not_found',
  'source_outside_root',
  'source_unreadable',
  'render_failed',
  'delivery_failed',
] as const;

export type MediaDiagnosticReason = (typeof MEDIA_DIAGNOSTIC_REASONS)[number];
export type DiagnosticMediaVariant = MediaVariant | 'unknown';
export type DiagnosticMediaFormat = MediaFormat | 'unknown';

export interface MediaDiagnosticObservation {
  variant: DiagnosticMediaVariant;
  format: DiagnosticMediaFormat;
  status: 200 | 400 | 404 | 500 | 503;
  reason: MediaDiagnosticReason;
  durationMs: number;
}

const LATENCY_BUCKETS = ['le_50', 'le_200', 'le_1000', 'le_5000', 'gt_5000'] as const;
type LatencyBucket = (typeof LATENCY_BUCKETS)[number];

const RECENT_FAILURE_WINDOW_MS = 5 * 60 * 1000;

export class MediaDiagnostics {
  private readonly startedAt: string;
  private requestsTotal = 0;
  private readonly byReason = zeroRecord(MEDIA_DIAGNOSTIC_REASONS);
  private readonly byVariant = zeroRecord(['thumb', 'wall', 'modal', 'detail', 'unknown'] as const);
  private readonly byFormat = zeroRecord(['webp', 'jpeg', 'unknown'] as const);
  private readonly byStatus = zeroRecord(['200', '400', '404', '500', '503'] as const);
  private readonly latencyMs = zeroRecord(LATENCY_BUCKETS);
  private readonly lastSeenByReason: Partial<Record<MediaDiagnosticReason, string>> = {};

  constructor(private readonly now: () => Date = () => new Date()) {
    this.startedAt = this.now().toISOString();
  }

  record(observation: MediaDiagnosticObservation): void {
    this.requestsTotal += 1;
    this.byReason[observation.reason] += 1;
    this.byVariant[observation.variant] += 1;
    this.byFormat[observation.format] += 1;
    this.byStatus[String(observation.status) as keyof typeof this.byStatus] += 1;
    this.latencyMs[latencyBucket(observation.durationMs)] += 1;
    this.lastSeenByReason[observation.reason] = this.now().toISOString();
  }

  snapshot(deps: {
    library: LibraryService;
    derivatives: DerivativeService;
  }): MediaDiagnosticsSnapshot {
    const libraryView = deps.library.getStateView();
    const active = deps.library.getActiveSnapshot();
    const derivativeQueue = deps.derivatives.getMetrics();
    const now = this.now();
    const heuristics: MediaDiagnosticHeuristic[] = [];

    if (libraryView.state === 'error') {
      heuristics.push({
        code: 'library_scan_failed',
        severity: 'error',
        evidence: { scanState: libraryView.state },
      });
    } else if (!active) {
      heuristics.push({
        code: 'library_not_ready',
        severity: 'warning',
        evidence: { scanState: libraryView.state },
      });
    } else if (active.photoCount === 0) {
      heuristics.push({
        code: 'no_photos_discovered',
        severity: 'warning',
        evidence: { photoCount: 0, warningCount: active.warnings.length },
      });
    } else if (this.requestsTotal === 0) {
      heuristics.push({
        code: 'no_media_requests_seen',
        severity: 'info',
        evidence: { photoCount: active.photoCount },
      });
    }

    addRecentFailureHeuristic(
      heuristics,
      now,
      this.byReason,
      this.lastSeenByReason,
      ['source_unreadable', 'source_outside_root', 'photo_not_found'],
      'source_resolution_failures',
    );
    addRecentFailureHeuristic(
      heuristics,
      now,
      this.byReason,
      this.lastSeenByReason,
      ['render_failed', 'delivery_failed'],
      'derivative_delivery_failures',
    );

    if (derivativeQueue.queuedRenders > 0) {
      heuristics.push({
        code: 'derivative_backpressure',
        severity: 'warning',
        evidence: derivativeQueue,
      });
    }

    return {
      startedAt: this.startedAt,
      generatedAt: now.toISOString(),
      requestCounters: {
        total: this.requestsTotal,
        byReason: { ...this.byReason },
        byVariant: { ...this.byVariant },
        byFormat: { ...this.byFormat },
        byStatus: { ...this.byStatus },
        latencyMs: { ...this.latencyMs },
      },
      library: {
        scanState: libraryView.state,
        photoCount: active?.photoCount ?? 0,
        warningCount: active?.warnings.length ?? 0,
        warmLoaded: libraryView.warmLoaded,
      },
      derivativeQueue,
      heuristics,
    };
  }
}

export interface MediaDiagnosticHeuristic {
  code:
    | 'library_scan_failed'
    | 'library_not_ready'
    | 'no_photos_discovered'
    | 'no_media_requests_seen'
    | 'source_resolution_failures'
    | 'derivative_delivery_failures'
    | 'derivative_backpressure';
  severity: 'info' | 'warning' | 'error';
  evidence: Record<string, string | number>;
}

export interface MediaDiagnosticsSnapshot {
  startedAt: string;
  generatedAt: string;
  requestCounters: {
    total: number;
    byReason: Record<MediaDiagnosticReason, number>;
    byVariant: Record<DiagnosticMediaVariant, number>;
    byFormat: Record<DiagnosticMediaFormat, number>;
    byStatus: Record<'200' | '400' | '404' | '500' | '503', number>;
    latencyMs: Record<LatencyBucket, number>;
  };
  library: {
    scanState: ReturnType<LibraryService['getStateView']>['state'];
    photoCount: number;
    warningCount: number;
    warmLoaded: boolean;
  };
  derivativeQueue: ReturnType<DerivativeService['getMetrics']>;
  heuristics: MediaDiagnosticHeuristic[];
}

function latencyBucket(durationMs: number): LatencyBucket {
  if (durationMs <= 50) return 'le_50';
  if (durationMs <= 200) return 'le_200';
  if (durationMs <= 1_000) return 'le_1000';
  if (durationMs <= 5_000) return 'le_5000';
  return 'gt_5000';
}

function zeroRecord<const T extends readonly string[]>(keys: T): Record<T[number], number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T[number], number>;
}

function addRecentFailureHeuristic(
  heuristics: MediaDiagnosticHeuristic[],
  now: Date,
  counts: Record<MediaDiagnosticReason, number>,
  lastSeen: Partial<Record<MediaDiagnosticReason, string>>,
  reasons: readonly MediaDiagnosticReason[],
  code: 'source_resolution_failures' | 'derivative_delivery_failures',
): void {
  const recent = reasons
    .map((reason) => ({ reason, at: lastSeen[reason], count: counts[reason] }))
    .filter((entry): entry is { reason: MediaDiagnosticReason; at: string; count: number } =>
      entry.at !== undefined && now.getTime() - new Date(entry.at).getTime() <= RECENT_FAILURE_WINDOW_MS,
    );
  if (recent.length === 0) return;

  heuristics.push({
    code,
    severity: 'error',
    evidence: {
      cumulativeCount: recent.reduce((total, entry) => total + entry.count, 0),
      lastSeenWithinSeconds: RECENT_FAILURE_WINDOW_MS / 1000,
    },
  });
}
