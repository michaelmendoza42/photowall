import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useLibraryFacets,
  useLibraryStatus,
  useUpdateLibraryRoot,
} from '../../hooks/useLibrary.js';
import {
  flattenPhotoPages,
  useInfinitePhotos,
} from '../../hooks/useInfinitePhotos.js';
import {
  useCreatePlaylist,
  useDeletePlaylist,
  usePlaylists,
  useUpdatePlaylist,
} from '../../hooks/usePlaylists.js';
import {
  EMPTY_FILTERS,
  ACTIVE_FILTERS_STORAGE_KEY,
  parseActiveFilters,
  pruneMissingFolders,
  toQueryFilters,
  type ActiveFilters,
} from '../../state/filters.js';
import {
  INITIAL_CAMERA,
  withViewport,
  withWorldBounds,
} from '../../state/camera.js';
import { INITIAL_LAYOUT } from '../../state/layout.js';
import { DebugOverlay } from '../debug/DebugOverlay.js';
import { FocusedPhotoLightbox } from '../modal/FocusedPhotoLightbox.js';
import { ControlsPanel } from '../controls/ControlsPanel.js';
import {
  INITIAL_FOCUSED_PHOTO_STATE,
  closeFocusedPhoto,
  openFocusedPhoto,
} from '../../state/focusedPhoto.js';
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
  type WallDragState,
  type WallStats,
} from './WallCanvas.js';
import { PhotoWallSurface } from './PhotoWallSurface.js';
import { deriveGroupedWallFoundation } from './groupedWall.js';
import {
  computeWorldWidth,
  WORLD_WIDTH_MAX,
} from './worldWidth.js';
import { deriveActiveAlbumAreaCount } from './activeAlbumAreaCount.js';
import type {
  FocusStepDirection,
  WallFocusNavigator,
} from './focusNavigation.js';
import {
  PHOTOS_PAGE_MAX_LIMIT,
  type PhotoQueryRecord,
  type PhotosQueryResponse,
} from '../../../../shared/api/photos.js';

const DEV_PAGE_SIZE_ENV = import.meta.env.VITE_PHOTOS_PAGE_SIZE as
  | string
  | undefined;

function parseDevPageSize(): number | undefined {
  if (!DEV_PAGE_SIZE_ENV) return undefined;
  const parsed = Number.parseInt(DEV_PAGE_SIZE_ENV, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function WallShell(): JSX.Element {
  const [filters, setFilters] = useState<ActiveFilters>(() => {
    if (typeof window === 'undefined') return EMPTY_FILTERS;
    // Persist the operator's active wall selection so a reload returns
    // to the same filtered browsing context instead of silently dropping
    // back to the global wall.
    return parseActiveFilters(window.localStorage.getItem(ACTIVE_FILTERS_STORAGE_KEY));
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [controlsError, setControlsError] = useState<string | null>(null);
  const [libraryRootError, setLibraryRootError] = useState<string | null>(null);
  const [camera, setCamera] = useState(INITIAL_CAMERA);
  const [wallStats, setWallStats] = useState<WallStats | null>(null);
  const [dragState, setDragState] = useState<WallDragState>(INITIAL_DRAG_STATE);
  const [focusedPhoto, setFocusedPhoto] = useState(INITIAL_FOCUSED_PHOTO_STATE);

  const handlePhotoClose = useCallback(() => {
    setFocusedPhoto((prev) => closeFocusedPhoto(prev));
  }, []);

  const statusQuery = useLibraryStatus();
  const updateLibraryRoot = useUpdateLibraryRoot();
  const facetsQuery = useLibraryFacets(
    statusQuery.data?.scanState === 'ready',
  );
  const playlistsQuery = usePlaylists();
  const createPlaylist = useCreatePlaylist();
  const updatePlaylist = useUpdatePlaylist();
  const deletePlaylist = useDeletePlaylist();
  const queryFilters = useMemo(() => toQueryFilters(filters), [filters]);

  const devPageSize = parseDevPageSize();
  // The wall lays out the whole selection at once, so every photo record
  // loads up front (in big pages); images still load as they come on screen.
  const photosQuery = useInfinitePhotos({
    filters: queryFilters,
    enabled: statusQuery.data?.scanState === 'ready',
    limit: devPageSize ?? PHOTOS_PAGE_MAX_LIMIT,
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
  const groupedFoundation = useMemo(() => {
    if (!firstPage) return null;
    return deriveGroupedWallFoundation({
      filters: firstPage.appliedFilters,
      facets: facetsQuery.data ?? null,
      photos,
      snapshotId: firstPage.snapshotId,
      worldWidth,
    });
  }, [firstPage, facetsQuery.data, photos, worldWidth]);

  const activeAlbumAreaCount = useMemo(
    () =>
      deriveActiveAlbumAreaCount({
        filters: firstPage?.appliedFilters ?? {
          years: filters.years,
          folders: filters.folders,
          excludeFolders: filters.excludeFolders,
          playlistId: filters.playlistId,
        },
        facets: facetsQuery.data ?? null,
        photos,
        snapshotId: firstPage?.snapshotId ?? statusQuery.data?.snapshotId ?? null,
        worldWidth,
      }),
    [
      firstPage,
      filters.years,
      filters.folders,
      filters.excludeFolders,
      filters.playlistId,
      facetsQuery.data,
      photos,
      statusQuery.data?.snapshotId,
      worldWidth,
    ],
  );

  const handlePhotoOpen = useCallback((photo: PhotoQueryRecord) => {
    setFocusedPhoto((prev) => openFocusedPhoto(prev, photo));
  }, []);

  const focusNavigatorRef = useRef<WallFocusNavigator | null>(null);
  const photosByIdRef = useRef(new Map<string, PhotoQueryRecord>());
  photosByIdRef.current = useMemo(
    () => new Map(photos.map((photo) => [photo.id, photo])),
    [photos],
  );
  const focusedPhotoIdRef = useRef<string | null>(null);
  focusedPhotoIdRef.current = focusedPhoto.photo?.id ?? null;

  const handleFocusStep = useCallback((direction: FocusStepDirection) => {
    const currentId = focusedPhotoIdRef.current;
    if (!currentId) return;
    const nextId = focusNavigatorRef.current?.step(currentId, direction);
    const next = nextId ? photosByIdRef.current.get(nextId) : undefined;
    if (!next) return;
    // Track it now so rapid presses step from here rather than the
    // photo React has not re-rendered away from yet.
    focusedPhotoIdRef.current = next.id;
    setFocusedPhoto((prev) => openFocusedPhoto(prev, next));
  }, []);
  const handleFocusNext = useCallback(
    () => handleFocusStep('next'),
    [handleFocusStep],
  );
  const handleFocusPrevious = useCallback(
    () => handleFocusStep('previous'),
    [handleFocusStep],
  );

  // Saved selections can name folders that have since disappeared from
  // the library; drop them once the scanned folder list is known.
  const facetFolders = facetsQuery.data?.folders;
  useEffect(() => {
    if (!facetFolders || facetFolders.length === 0) return;
    const paths = facetFolders.map((f) => f.path);
    setFilters((prev) => pruneMissingFolders(prev, paths));
  }, [facetFolders]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      ACTIVE_FILTERS_STORAGE_KEY,
      JSON.stringify(filters),
    );
  }, [filters]);

  useEffect(() => {
    if (!photosQuery.hasNextPage || photosQuery.isFetchingNextPage) return;
    void photosQuery.fetchNextPage();
  }, [
    photosQuery.hasNextPage,
    photosQuery.isFetchingNextPage,
    photosQuery.fetchNextPage,
  ]);

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

  const handleFiltersChange = useCallback((next: ActiveFilters) => {
    setControlsError(null);
    setFilters(next);
  }, []);

  const handleLibraryRootChange = useCallback(
    (nextRoot: string) => {
      const trimmed = nextRoot.trim();
      if (trimmed.length === 0) {
        setLibraryRootError('Library root is required.');
        return;
      }
      setControlsError(null);
      setLibraryRootError(null);
      updateLibraryRoot.mutate(
        { libraryRoot: trimmed },
        {
          onSuccess: () => {
            setMenuOpen(false);
            setFilters(EMPTY_FILTERS);
          },
          onError: (err) => {
            setLibraryRootError(`Could not open that root: ${err.message}`);
          },
        },
      );
    },
    [updateLibraryRoot],
  );

  const handleCreatePlaylist = useCallback(
    (name: string) => {
      setControlsError(null);
      createPlaylist.mutate(
        {
          name,
          filters: {
            years: filters.years,
            folders: filters.folders,
            excludeFolders: filters.excludeFolders,
          },
        },
        {
          onSuccess: (record) => {
            // Adopt the new playlist as the current selection so the
            // operator immediately sees their save as "active".
            setFilters((prev) => ({ ...prev, playlistId: record.id }));
          },
          onError: (err) => {
            setControlsError(`Could not save playlist: ${err.message}`);
          },
        },
      );
    },
    [createPlaylist, filters.years, filters.folders, filters.excludeFolders],
  );

  const handleUpdatePlaylist = useCallback(
    (id: string, patch: { name?: string }) => {
      setControlsError(null);
      // A `patch` with only a name is a rename. An empty patch is the
      // shape used by "Update with current filters" — translate it into
      // a filters update at this layer so the ControlsPanel does not
      // need to know the live filter state in two different places.
      const isRename = patch.name !== undefined;
      const payload = isRename
        ? { name: patch.name as string }
        : {
            filters: {
              years: filters.years,
              folders: filters.folders,
              excludeFolders: filters.excludeFolders,
            },
          };
      updatePlaylist.mutate(
        { id, patch: payload },
        {
          onError: (err) => {
            setControlsError(`Could not update playlist: ${err.message}`);
          },
        },
      );
    },
    [updatePlaylist, filters.years, filters.folders, filters.excludeFolders],
  );

  const handleDeletePlaylist = useCallback(
    (id: string) => {
      setControlsError(null);
      deletePlaylist.mutate(id, {
        onSuccess: () => {
          // Drop the playlist out of the active selection if it was
          // selected. Inline year/folder filters survive so the wall
          // does not blank unexpectedly.
          setFilters((prev) =>
            prev.playlistId === id ? { ...prev, playlistId: null } : prev,
          );
        },
        onError: (err) => {
          setControlsError(`Could not delete playlist: ${err.message}`);
        },
      });
    },
    [deletePlaylist],
  );

  const playlists = playlistsQuery.data?.playlists ?? [];

  const sharedWallProps = {
    photos,
    worldWidth,
    hasNextPage: photosQuery.hasNextPage,
    isFetchingNextPage: photosQuery.isFetchingNextPage,
    onLoadMore: handleLoadMore,
    onStatsChange: setWallStats,
    camera,
    onCameraChange: setCamera,
    onDragStateChange: setDragState,
    onPhotoOpen: handlePhotoOpen,
    isModalOpen: focusedPhoto.photo !== null,
    focusNavigatorRef,
  };

  const activeLayoutMode = groupedFoundation?.mode ?? 'single';

  return (
    <main
      className="wall"
      data-testid="wall-shell"
      data-screen={screen.kind}
      data-modal-open={focusedPhoto.photo ? 'true' : 'false'}
      data-controls-open={menuOpen ? 'true' : 'false'}
      data-layout-mode={activeLayoutMode}
      data-active-album-area-count={activeAlbumAreaCount}
    >
      {screen.kind === 'loading' && <LoadingState />}
      {screen.kind === 'config-error' && (
        <ConfigErrorState
          message={screen.message}
          status={screen.status}
          rootChangePending={updateLibraryRoot.isPending}
          rootChangeError={libraryRootError}
          onRootChange={handleLibraryRootChange}
        />
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
      {screen.kind === 'ready' && firstPage && photosQuery.hasNextPage && (
        <LoadingState />
      )}
      {screen.kind === 'ready' && firstPage && !photosQuery.hasNextPage && (
        <PhotoWallSurface
          {...sharedWallProps}
          groupedFoundation={groupedFoundation}
          activeAlbumAreaCount={activeAlbumAreaCount}
        />
      )}

      <ControlsPanel
        open={menuOpen}
        onToggleOpen={() => setMenuOpen((v) => !v)}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        facets={facetsQuery.data ?? null}
        playlists={playlists}
        onCreatePlaylist={handleCreatePlaylist}
        onUpdatePlaylist={handleUpdatePlaylist}
        onDeletePlaylist={handleDeletePlaylist}
        createPending={createPlaylist.isPending}
        updatePending={updatePlaylist.isPending}
        deletePending={deletePlaylist.isPending}
        errorMessage={controlsError}
      />

      {focusedPhoto.photo && (
        <FocusedPhotoLightbox
          photo={focusedPhoto.photo}
          onClose={handlePhotoClose}
          onNext={handleFocusNext}
          onPrevious={handleFocusPrevious}
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
