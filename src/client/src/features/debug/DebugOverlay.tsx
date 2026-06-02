import { useState } from 'react';
import type {
  LibraryFacetsResponse,
  LibraryStatusResponse,
} from '../../../../shared/api/library.js';
import type { CameraState } from '../../state/camera.js';
import { summarizeFilters, type ActiveFilters } from '../../state/filters.js';
import type { LayoutState } from '../../state/layout.js';
import type { WallScreenState } from '../wall/wallScreenState.js';
import type { WallStats } from '../wall/WallCanvas.js';

interface DebugOverlayProps {
  screen: WallScreenState;
  filters: ActiveFilters;
  camera: CameraState;
  layout: LayoutState;
  status: LibraryStatusResponse | null;
  facets: LibraryFacetsResponse | null;
  playlistCount: number | null;
  wallStats?: WallStats | null;
}

/**
 * Compact dev-only diagnostics panel. Gated by `import.meta.env.DEV` in
 * the calling site, but also self-checks so it never ships into the
 * production bundle if a future change forgets the gate.
 */
export function DebugOverlay(props: DebugOverlayProps): JSX.Element | null {
  const [collapsed, setCollapsed] = useState(false);

  if (!import.meta.env.DEV && import.meta.env.MODE !== 'test') {
    return null;
  }

  const {
    screen,
    filters,
    camera,
    layout,
    status,
    facets,
    playlistCount,
    wallStats,
  } = props;

  const pageInfo =
    screen.kind === 'ready'
      ? {
          loaded: screen.page.photos.length,
          total: screen.page.totalMatching,
          nextCursor: screen.page.nextCursor !== null,
        }
      : null;

  return (
    <aside
      className={
        collapsed ? 'debug-overlay debug-overlay--collapsed' : 'debug-overlay'
      }
      data-testid="debug-overlay"
    >
      <header className="debug-overlay__header">
        <span className="debug-overlay__title">debug · wall</span>
        <button
          type="button"
          className="debug-overlay__toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-controls="debug-overlay-body"
        >
          {collapsed ? '+' : '−'}
        </button>
      </header>
      {!collapsed && (
        <dl className="debug-overlay__body" id="debug-overlay-body">
          <dt>screen</dt>
          <dd data-testid="debug-screen">{screen.kind}</dd>

          <dt>snapshot</dt>
          <dd>{status?.snapshotId ?? '—'}</dd>

          <dt>scan</dt>
          <dd>
            {status?.scanState ?? '—'} · photos={status?.photoCount ?? 0} ·
            warm={String(status?.warmLoaded ?? false)}
          </dd>

          <dt>filters</dt>
          <dd data-testid="debug-filters">{summarizeFilters(filters)}</dd>

          <dt>photos loaded</dt>
          <dd>
            {pageInfo
              ? `${pageInfo.loaded}/${pageInfo.total} · nextCursor=${String(pageInfo.nextCursor)}`
              : '—'}
          </dd>

          <dt>facets</dt>
          <dd>
            years={facets?.years.length ?? 0} ·
            folders={facets?.folders.length ?? 0}
          </dd>

          <dt>playlists</dt>
          <dd>{playlistCount ?? '—'}</dd>

          <dt>camera x,y</dt>
          <dd data-testid="debug-camera">
            {camera.x.toFixed(0)}, {camera.y.toFixed(0)}
          </dd>

          <dt>viewport</dt>
          <dd>
            {camera.viewport.width}×{camera.viewport.height}
          </dd>

          <dt>world</dt>
          <dd>
            {camera.world.width} ×{' '}
            {camera.world.height === null ? '?' : camera.world.height}
          </dd>

          <dt>layout</dt>
          <dd>
            rows={layout.rows.length} · contentH={Math.round(layout.contentHeight)} ·
            overscan↑{layout.overscan.rowsAbove}↓{layout.overscan.rowsBelow}
          </dd>

          <dt>wall</dt>
          <dd data-testid="debug-wall-stats">
            {wallStats
              ? `mounted=${wallStats.mountedRows}/${wallStats.totalRows} · visible=[${wallStats.visibleStart},${wallStats.visibleEnd}) · scrollY=${Math.round(wallStats.scrollTop)} · packed=${wallStats.packedPhotoCount}`
              : '—'}
          </dd>
        </dl>
      )}
    </aside>
  );
}
