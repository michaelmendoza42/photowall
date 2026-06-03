import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLibraryFacets, useLibraryStatus } from '../../hooks/useLibrary.js';
import {
  flattenPhotoPages,
  useInfinitePhotos,
} from '../../hooks/useInfinitePhotos.js';
import { usePlaylists } from '../../hooks/usePlaylists.js';
import { EMPTY_FILTERS, toQueryFilters } from '../../state/filters.js';
import {
  INITIAL_CAMERA,
  withViewport,
  withWorldBounds,
} from '../../state/camera.js';
import { INITIAL_LAYOUT } from '../../state/layout.js';
import { DebugOverlay } from '../debug/DebugOverlay.js';
import {
  ConfigErrorState,
  EmptyLibraryState,
  LoadingState,
  NoResultsState,
  ScanningState,
  SnapshotChangedState,
} from './WallScreens.js';
import { deriveWallScreenState } from './wallScreenState.js';
import {
  INITIAL_DRAG_STATE,
  WallCanvas,
  type WallDragState,
  type WallStats,
} from './WallCanvas.js';
import {
  computeWorldWidth,
  WORLD_WIDTH_MAX,
} from './worldWidth.js';
import type { PhotosQueryResponse } from '../../../../shared/api/photos.js';

const DEV_PAGE_SIZE_ENV = import.meta.env.VITE_PHOTOS_PAGE_SIZE as
  | string
  | undefined;

function parseDevPageSize(): number | undefined {
  if (!DEV_PAGE_SIZE_ENV) return undefined;
  const parsed = Number.parseInt(DEV_PAGE_SIZE_ENV, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function WallShell(): JSX.Element {
  const [filters] = useState(EMPTY_FILTERS);
  const [camera, setCamera] = useState(INITIAL_CAMERA);
  const [wallStats, setWallStats] = useState<WallStats | null>(null);
  const [dragState, setDragState] = useState<WallDragState>(INITIAL_DRAG_STATE);

  const statusQuery = useLibraryStatus();
  const facetsQuery = useLibraryFacets(
    statusQuery.data?.scanState === 'ready',
  );
  const playlistsQuery = usePlaylists();
  const queryFilters = useMemo(() => toQueryFilters(filters), [filters]);

  const devPageSize = parseDevPageSize();
  const photosQuery = useInfinitePhotos({
    filters: queryFilters,
    enabled: statusQuery.data?.scanState === 'ready',
    ...(devPageSize !== undefined ? { limit: devPageSize } : {}),
  });

  useEffect(() => {
    function syncViewport(): void {
      setCamera((prev) =>
        withViewport(prev, {
          width: window.innerWidth,
          height: window.innerHeight,
        }),
      );
    }
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  const worldWidth = useMemo(
    () => computeWorldWidth(camera.viewport.width || WORLD_WIDTH_MAX),
    [camera.viewport.width],
  );

  // Keep camera world bounds in sync with the laid-out content so the
  // debug overlay (and future pan task) always reads accurate values.
  useEffect(() => {
    if (!wallStats) return;
    setCamera((prev) =>
      withWorldBounds(prev, {
        width: wallStats.worldWidth,
        height: wallStats.contentHeight,
      }),
    );
  }, [wallStats]);

  // Snapshot-changed coherence: if any page in the loaded set carries
  // an error response, drop all photo pages and let the query refetch
  // from the new snapshot. Mixing pre- and post-rotation rows would
  // render rows whose photoIds no longer exist on the active snapshot.
  const queryClient = useQueryClient();
  const pages = photosQuery.data?.pages;
  const hasSnapshotChanged = useMemo(
    () => Boolean(pages && pages.some((p) => 'error' in p)),
    [pages],
  );
  useEffect(() => {
    if (!hasSnapshotChanged) return;
    queryClient.removeQueries({
      queryKey: ['photos', 'pages'],
    });
    void photosQuery.refetch();
    // `photosQuery.refetch` identity is stable across renders for the
    // same query; including it in deps is safe.
  }, [hasSnapshotChanged, queryClient, photosQuery]);

  const successPages = useMemo(
    () => flattenPhotoPages(pages),
    [pages],
  );
  const photos = useMemo(
    () => successPages.flatMap((p) => p.photos),
    [successPages],
  );
  const firstPage = successPages[0];

  const screenInput = useMemo(
    () => ({
      statusQuery: {
        isLoading: statusQuery.isLoading,
        error: statusQuery.error,
        data: statusQuery.data,
      },
      photoPageQuery: {
        isLoading: photosQuery.isLoading,
        error: photosQuery.error,
        data: derivePhotoPageData(pages),
      },
      filters,
    }),
    [
      statusQuery.isLoading,
      statusQuery.error,
      statusQuery.data,
      photosQuery.isLoading,
      photosQuery.error,
      pages,
      filters,
    ],
  );

  const screen = deriveWallScreenState(screenInput);

  const handleLoadMore = useCallback(() => {
    if (!photosQuery.hasNextPage || photosQuery.isFetchingNextPage) return;
    void photosQuery.fetchNextPage();
  }, [
    photosQuery.hasNextPage,
    photosQuery.isFetchingNextPage,
    photosQuery.fetchNextPage,
  ]);

  useEffect(() => {
    document.body.dataset['appReady'] = 'true';
  }, []);

  const layout = useMemo(() => {
    if (!wallStats) {
      return { ...INITIAL_LAYOUT, photos };
    }
    return {
      photos,
      // The overlay only consumes counts/heights, so a row-count summary
      // is enough — we do not need to ship the full tile geometry up.
      rows: new Array(wallStats.totalRows).fill(null),
      contentHeight: wallStats.contentHeight,
      overscan: INITIAL_LAYOUT.overscan,
    };
  }, [photos, wallStats]);

  return (
    <main className="wall" data-testid="wall-shell" data-screen={screen.kind}>
      {screen.kind === 'loading' && <LoadingState />}
      {screen.kind === 'config-error' && (
        <ConfigErrorState message={screen.message} status={screen.status} />
      )}
      {screen.kind === 'scanning' && <ScanningState status={screen.status} />}
      {screen.kind === 'empty-library' && (
        <EmptyLibraryState status={screen.status} />
      )}
      {screen.kind === 'no-results' && (
        <NoResultsState status={screen.status} filters={screen.filters} />
      )}
      {screen.kind === 'snapshot-changed' && (
        <SnapshotChangedState status={screen.status} />
      )}
      {screen.kind === 'ready' && firstPage && (
        <WallCanvas
          photos={photos}
          worldWidth={worldWidth}
          hasNextPage={photosQuery.hasNextPage}
          isFetchingNextPage={photosQuery.isFetchingNextPage}
          onLoadMore={handleLoadMore}
          onStatsChange={setWallStats}
          camera={camera}
          onCameraChange={setCamera}
          onDragStateChange={setDragState}
        />
      )}

      {import.meta.env.DEV && (
        <DebugOverlay
          screen={screen}
          filters={filters}
          camera={camera}
          layout={layout}
          status={statusQuery.data ?? null}
          facets={facetsQuery.data ?? null}
          playlistCount={playlistsQuery.data?.playlists.length ?? null}
          wallStats={wallStats}
          dragState={dragState}
        />
      )}
    </main>
  );
}

/**
 * The shell's screen-state derivation only needs a snapshot of the
 * "first page" — enough to decide loading / no-results / ready /
 * snapshot-changed. Surface the latest error page if one exists so the
 * snapshot-changed branch still triggers; otherwise hand back the
 * first success page.
 */
function derivePhotoPageData(
  pages: readonly PhotosQueryResponse[] | undefined,
): PhotosQueryResponse | undefined {
  if (!pages || pages.length === 0) return undefined;
  const errorPage = pages.find((p) => 'error' in p);
  if (errorPage) return errorPage;
  return pages[0];
}
