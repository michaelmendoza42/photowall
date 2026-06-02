import { useEffect, useMemo, useState } from 'react';
import { useLibraryFacets, useLibraryStatus } from '../../hooks/useLibrary.js';
import { usePhotosPage } from '../../hooks/usePhotosPage.js';
import { usePlaylists } from '../../hooks/usePlaylists.js';
import { EMPTY_FILTERS, toQueryFilters } from '../../state/filters.js';
import { INITIAL_CAMERA, withViewport } from '../../state/camera.js';
import { INITIAL_LAYOUT, withLoadedPhotos } from '../../state/layout.js';
import { DebugOverlay } from '../debug/DebugOverlay.js';
import {
  ConfigErrorState,
  EmptyLibraryState,
  LoadingState,
  NoResultsState,
  ReadyState,
  ScanningState,
  SnapshotChangedState,
} from './WallScreens.js';
import { deriveWallScreenState } from './wallScreenState.js';

export function WallShell(): JSX.Element {
  const [filters] = useState(EMPTY_FILTERS);
  const [camera, setCamera] = useState(INITIAL_CAMERA);

  const statusQuery = useLibraryStatus();
  const facetsQuery = useLibraryFacets(
    statusQuery.data?.scanState === 'ready',
  );
  const playlistsQuery = usePlaylists();
  const queryFilters = useMemo(() => toQueryFilters(filters), [filters]);
  const photoPageQuery = usePhotosPage({
    filters: queryFilters,
    cursor: null,
    enabled: statusQuery.data?.scanState === 'ready',
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

  // Phase 3 task 1 only owns the *contract* for layout state. The real
  // packer lands in task 2, so for now the loaded-photos input is the
  // only field that actually changes when a page arrives.
  const layout = useMemo(() => {
    if (photoPageQuery.data && !('error' in photoPageQuery.data)) {
      return withLoadedPhotos(INITIAL_LAYOUT, photoPageQuery.data.photos);
    }
    return INITIAL_LAYOUT;
  }, [photoPageQuery.data]);

  useEffect(() => {
    document.body.dataset['appReady'] = 'true';
  }, []);

  const screen = deriveWallScreenState({
    statusQuery,
    photoPageQuery,
    filters,
  });

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
      {screen.kind === 'ready' && (
        <ReadyState status={screen.status} page={screen.page} />
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
        />
      )}
    </main>
  );
}
