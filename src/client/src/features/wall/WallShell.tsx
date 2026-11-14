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
  useAlbumCuration,
  useCurationSession,
  useChooseCuratorPin,
  useClearVipPin,
  useCuratorLogin,
  useCuratorLogout,
  useSetVipPin,
  useMovePhoto,
  usePhotoEdit,
  useRescanLibrary,
  useSetAlbumDisplay,
  useSetDefaultView,
  useSetDisplayDefaults,
  useSetPhotoFeatured,
  useSetPhotoFrame,
  useSetPhotoPrivate,
  useStarPhoto,
} from '../../hooks/useCuration.js';
import { createShare, fetchShare } from '../../api/curation.js';
import { queryKeys } from '../../hooks/queryKeys.js';
import {
  SHARE_URL_PARAM,
  isInHiddenFolder,
  DEFAULT_WALL_DISPLAY,
  type FrameChoice,
  type FrameMat,
  type PhotoFeaturedConflictResponse,
  type PhotoFrame,
  type WallSpacing,
} from '../../../../shared/api/curation.js';
import { ApiError } from '../../api/http.js';
import {
  effectiveWallDisplay,
  readWallDisplayPreference,
  writeWallDisplayPreference,
  type WallDisplayPreference,
} from '../../state/wallDisplay.js';
import { resolvePhotoFrame } from './featuredFrames.js';
import { CurationToast, type CurationToastState } from './CurationToast.js';
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
import { readWallSpot, writeWallSpot, type WallSpot } from './wallSpot.js';
import { FocusedPhotoLightbox } from '../modal/FocusedPhotoLightbox.js';
import { PhotoEditor } from '../editor/PhotoEditor.js';
import { isNeutralEdit, type PhotoEdit } from '../../../../shared/api/edits.js';
import { ControlsPanel } from '../controls/ControlsPanel.js';
import {
  INITIAL_FOCUSED_PHOTO_STATE,
  closeFocusedPhoto,
  openFocusedPhoto,
  updateFocusedPhoto,
} from '../../state/focusedPhoto.js';
import {
  ConfigErrorState,
  EmptyLibraryState,
  LoadingState,
  NoResultsState,
  NothingOnDisplayState,
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
import { deriveAlbumAreas, isShownFromBestOf, photoAlbumName } from './albumAreas.js';
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
  type PhotosQuerySuccessResponse,
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
  // The PIN form only appears on the unlisted curator and VIP routes,
  // which open straight onto it.
  const [pinEntry, setPinEntry] = useState(() => pinEntryRoute());
  const [menuOpen, setMenuOpen] = useState(pinEntry !== null);
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
  // A saved snapshot is enough to show the wall; a background rescan
  // doesn't need to finish first.
  const hasSnapshot = Boolean(statusQuery.data?.snapshotId);
  const sessionQuery = useCurationSession();
  const session = sessionQuery.data ?? null;
  const isCurator = session?.curator === true;
  // Wall spacing and photo-view frames: the curator's defaults, unless this
  // viewer chose otherwise (remembered on this browser).
  const [displayPreference, setDisplayPreference] = useState(() => readWallDisplayPreference());
  const display = effectiveWallDisplay(session?.display ?? DEFAULT_WALL_DISPLAY, displayPreference);
  const updateDisplayPreference = useCallback((next: WallDisplayPreference) => {
    setDisplayPreference(next);
    writeWallDisplayPreference(next);
  }, []);
  // The curator can preview the wall as a guest sees it while keeping
  // every curator tool. Remembered on this browser.
  const [previewAsGuest, setPreviewAsGuest] = useState(() => readGuestPreview());
  const guestView = isCurator && session?.enabled === true && previewAsGuest;
  const handleGuestPreviewChange = useCallback((on: boolean) => {
    setPreviewAsGuest(on);
    try {
      window.localStorage.setItem(GUEST_PREVIEW_STORAGE_KEY, on ? '1' : '0');
    } catch {
      // Private mode or blocked storage: the switch still works this visit.
    }
  }, []);
  // The wall uses the guest's facets while previewing; the album tree
  // keeps the curator's own, so closed albums can still be opened.
  const facetsQuery = useLibraryFacets(hasSnapshot, guestView);
  const curatorFacetsQuery = useLibraryFacets(hasSnapshot && guestView, false);
  const treeFacets = guestView ? curatorFacetsQuery.data : facetsQuery.data;
  const albumsQuery = useAlbumCuration(isCurator);
  const curatorLogin = useCuratorLogin();
  const choosePin = useChooseCuratorPin();
  const curatorLogout = useCuratorLogout();
  const setVipPin = useSetVipPin();
  const setDisplayDefaults = useSetDisplayDefaults();
  const clearVipPin = useClearVipPin();
  const setAlbumDisplay = useSetAlbumDisplay();
  const setDefaultView = useSetDefaultView();
  const movePhoto = useMovePhoto();
  const photoEdit = usePhotoEdit();
  const [editingPhoto, setEditingPhoto] = useState<PhotoQueryRecord | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const rescanLibrary = useRescanLibrary();
  const [toast, setToast] = useState<CurationToastState | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharePending, setSharePending] = useState(false);
  // A share link opened on load: the photo to center once the wall is up.
  const pendingShareAnchorRef = useRef<{ photoId: string; zoom: number | null } | null>(
    null,
  );
  // Where this tab was before a reload; a share link in the address bar
  // takes over instead.
  const [initialSpot] = useState(() =>
    typeof window === 'undefined' ||
    new URL(window.location.href).searchParams.has(SHARE_URL_PARAM)
      ? null
      : readWallSpot(),
  );
  const pendingSpotRef = useRef<WallSpot | null>(initialSpot);
  const queryFilters = useMemo(() => toQueryFilters(filters), [filters]);

  const devPageSize = parseDevPageSize();
  // The wall lays out the whole selection at once, so every photo record
  // loads up front (in big pages); images still load as they come on screen.
  const photosQuery = useInfinitePhotos({
    filters: queryFilters,
    enabled: hasSnapshot,
    limit: devPageSize ?? PHOTOS_PAGE_MAX_LIMIT,
    viewAsGuest: guestView,
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


  // The wall may have opened from the saved snapshot while a rescan ran.
  // If that rescan found changes (a new snapshot id), reload the photos.
  const statusSnapshotId = statusQuery.data?.snapshotId ?? null;
  const pagesSnapshotId =
    pages?.find((p): p is PhotosQuerySuccessResponse => !('error' in p))?.snapshotId ?? null;
  useEffect(() => {
    if (!statusSnapshotId || !pagesSnapshotId || statusSnapshotId === pagesSnapshotId) return;
    void queryClient.invalidateQueries({ queryKey: ['photos'] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.libraryFacets });
  }, [statusSnapshotId, pagesSnapshotId, queryClient]);

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

  // The wall's album areas, Favorites included, even when it lays out as
  // one stream.
  const albumAreas = useMemo(
    () =>
      firstPage
        ? deriveAlbumAreas({
            filters: firstPage.appliedFilters,
            facets: facetsQuery.data ?? null,
            photos,
            snapshotId: firstPage.snapshotId,
            worldWidth,
          }).albums
        : [],
    [firstPage, facetsQuery.data, photos, worldWidth],
  );

  const activeAlbumAreaCount = useMemo(
    () =>
      deriveActiveAlbumAreaCount({
        filters: firstPage?.appliedFilters ?? {
          years: filters.years,
          folders: filters.folders,
          excludeFolders: filters.excludeFolders,
          ...(filters.starred ? { starred: true } : {}),
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
      filters.starred,
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

  const lastStepDirectionRef = useRef<FocusStepDirection>('next');
  const handleFocusStep = useCallback((direction: FocusStepDirection) => {
    const currentId = focusedPhotoIdRef.current;
    if (!currentId) return;
    lastStepDirectionRef.current = direction;
    const nextId = focusNavigatorRef.current?.step(currentId, direction);
    const next = nextId ? photosByIdRef.current.get(nextId) : undefined;
    if (!next) return;
    // Track it now so rapid presses step from here rather than the
    // photo React has not re-rendered away from yet.
    focusedPhotoIdRef.current = next.id;
    setFocusedPhoto((prev) => openFocusedPhoto(prev, next));
  }, []);
  // Move off a photo that is leaving the wall: step on, or close when
  // there is nowhere to go.
  const stepPast = useCallback(
    (photoId: string, direction: FocusStepDirection) => {
      if (focusedPhotoIdRef.current !== photoId) return;
      handleFocusStep(direction);
      if (focusedPhotoIdRef.current === photoId) handlePhotoClose();
    },
    [handleFocusStep, handlePhotoClose],
  );
  // A visitor without the curator's rights never stays on a photo they can
  // no longer see (made private, or its album put away, since their wall
  // loaded): once the wall refreshes without it, step on the way they were
  // going, or close when nothing is left.
  const canSeeEverything = isCurator && session?.enabled === true;
  const focusedId = focusedPhoto.photo?.id ?? null;
  const focusedLeftWall =
    focusedId !== null && photos.length > 0 && !photosByIdRef.current.has(focusedId);
  useEffect(() => {
    if (!focusedLeftWall || canSeeEverything || !focusedId) return;
    stepPast(focusedId, lastStepDirectionRef.current);
  }, [focusedLeftWall, canSeeEverything, focusedId, stepPast]);
  // A focused image that fails to load may be one this visitor can no
  // longer see; refresh the wall so the step above can move past it.
  const handleFocusedImageError = useCallback(() => {
    if (!canSeeEverything) void queryClient.invalidateQueries({ queryKey: ['photos'] });
  }, [canSeeEverything, queryClient]);
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
  // The curator's own folders, so previewing as a guest never prunes
  // closed albums out of the curator's selection.
  const facetFolders = treeFacets?.folders;
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
      viewerOfCuratedWall: session?.enabled === true && (!isCurator || guestView),
    }),
    [
      session?.enabled,
      isCurator,
      guestView,
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

  // Once unlocked, leave the PIN route so a reload is the plain wall.
  const isVip = session?.vip === true;
  useEffect(() => {
    if (pinEntry === null || !(isCurator || isVip)) return;
    setPinEntry(null);
    const url = new URL(window.location.href);
    url.pathname = '/';
    window.history.replaceState(window.history.state, '', url.toString());
  }, [pinEntry, isCurator, isVip]);

  const handleLogin = useCallback(
    (pin: string) => {
      setControlsError(null);
      curatorLogin.mutate(pin, {
        onError: (err) =>
          setControlsError(
            err.message === 'pin_invalid' ? 'That PIN is not right.' : `Could not unlock: ${err.message}`,
          ),
      });
    },
    [curatorLogin],
  );

  const handleChoosePin = useCallback(
    (pin: string, code: string) => {
      setControlsError(null);
      choosePin.mutate(
        { pin, code },
        {
          onError: (err) =>
            setControlsError(
              err.message === 'setup_code_invalid'
                ? 'That setup code is not right.'
                : `Could not set the PIN: ${err.message}`,
            ),
        },
      );
    },
    [choosePin],
  );

  const handleLogout = useCallback(() => {
    setControlsError(null);
    curatorLogout.mutate(undefined, {
      onError: (err) => setControlsError(`Could not lock: ${err.message}`),
    });
  }, [curatorLogout]);

  const handleSetVipPin = useCallback(
    (pin: string | null) => {
      setControlsError(null);
      const onError = (err: Error) =>
        setControlsError(
          err.message === 'vip_pin_invalid'
            ? 'The VIP PIN needs 4 or more characters.'
            : `Could not change the VIP PIN: ${err.message}`,
        );
      if (pin === null) clearVipPin.mutate(undefined, { onError });
      else setVipPin.mutate(pin, { onError });
    },
    [setVipPin, clearVipPin],
  );

  const handleSetDisplay = useCallback(
    (folder: string, onDisplay: boolean) => {
      setControlsError(null);
      setAlbumDisplay.mutate(
        { folder, onDisplay },
        { onError: (err) => setControlsError(`Could not update the album: ${err.message}`) },
      );
    },
    [setAlbumDisplay],
  );

  const defaultViewFolders = albumsQuery.data?.defaultView;
  const handleToggleDefault = useCallback(
    (folder: string) => {
      const current = defaultViewFolders ?? [];
      const next = current.includes(folder)
        ? current.filter((f) => f !== folder)
        : [...current, folder];
      setControlsError(null);
      setDefaultView.mutate(
        { folders: next },
        { onError: (err) => setControlsError(`Could not update the default view: ${err.message}`) },
      );
    },
    [defaultViewFolders, setDefaultView],
  );

  const defaultStarred = albumsQuery.data?.defaultStarred ?? false;
  const handleToggleDefaultStarred = useCallback(() => {
    setControlsError(null);
    setDefaultView.mutate(
      { folders: defaultViewFolders ?? [], starred: !defaultStarred },
      { onError: (err) => setControlsError(`Could not update the default view: ${err.message}`) },
    );
  }, [defaultStarred, defaultViewFolders, setDefaultView]);

  const handleRescan = useCallback(() => {
    rescanLibrary.mutate(undefined, {
      onSuccess: () => setToast({ message: 'Rescanning the library…' }),
      onError: (err) => setToast({ message: `Rescan failed: ${err.message}`, tone: 'error' }),
    });
  }, [rescanLibrary]);

  // Share the albums the wall is showing (the default view included)
  // and the photo in the middle of the screen.
  const appliedFilters = firstPage?.appliedFilters;
  const handleShare = useCallback(() => {
    const view = focusNavigatorRef.current?.currentView() ?? { photoId: null, zoom: null };
    setSharePending(true);
    setControlsError(null);
    createShare({
      folders: appliedFilters?.folders ?? filters.folders,
      excludeFolders: appliedFilters?.excludeFolders ?? filters.excludeFolders,
      anchorPhotoId: view.photoId,
      zoom: view.zoom,
      ...((appliedFilters?.starred ?? filters.starred) ? { starred: true } : {}),
    })
      .then((record) => {
        const url = new URL(window.location.href);
        url.search = '';
        url.hash = '';
        url.searchParams.set(SHARE_URL_PARAM, record.id);
        setShareUrl(url.toString());
        // The clipboard API needs a secure context; over plain LAN http
        // the link stays in the box to copy by hand.
        void navigator.clipboard?.writeText(url.toString()).catch(() => undefined);
      })
      .catch((err: Error) => setControlsError(`Could not make a share link: ${err.message}`))
      .finally(() => setSharePending(false));
  }, [appliedFilters, filters.folders, filters.excludeFolders, filters.starred]);

  // Open a share link: adopt its albums, then center its photo once the
  // wall has laid out. The link is dropped from the address bar so a
  // reload keeps whatever the viewer does next.
  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get(SHARE_URL_PARAM);
    if (!id) return;
    url.searchParams.delete(SHARE_URL_PARAM);
    window.history.replaceState(window.history.state, '', url.toString());
    fetchShare(id)
      .then((record) => {
        if (record.anchorPhotoId) {
          pendingShareAnchorRef.current = { photoId: record.anchorPhotoId, zoom: record.zoom };
        }
        setFilters({
          years: [],
          folders: [...record.folders].sort(),
          excludeFolders: [...record.excludeFolders].sort(),
          ...(record.starred ? { starred: true } : {}),
        });
      })
      .catch(() => setToast({ message: 'That share link no longer exists.', tone: 'error' }));
  }, []);

  const wallReady = screen.kind === 'ready' && Boolean(firstPage) && !photosQuery.hasNextPage;

  // A new spacing re-lays out the whole wall: fade to black, switch
  // underneath, fade back, so the photos jumping about never shows. Before
  // the wall is up there's nothing to hide.
  const [shownSpacing, setShownSpacing] = useState<WallSpacing>(display.spacing);
  const veilRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (display.spacing === shownSpacing) return undefined;
    const veil = veilRef.current;
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!wallReady || !veil || reducedMotion) {
      setShownSpacing(display.spacing);
      return undefined;
    }
    let cancelled = false;
    veil.style.transition = `opacity ${SPACING_FADE_OUT_MS}ms ease-in`;
    veil.style.opacity = '1';
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setShownSpacing(display.spacing);
      // Let the new wall paint before fading back in.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          veil.style.transition = `opacity ${SPACING_FADE_IN_MS}ms ease-out`;
          veil.style.opacity = '0';
        }),
      );
    }, SPACING_FADE_OUT_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [display.spacing, shownSpacing, wallReady]);
  useEffect(() => {
    const anchor = pendingShareAnchorRef.current;
    if (!wallReady || !anchor || !photosByIdRef.current.has(anchor.photoId)) return undefined;
    // Let the wall view finish its own first centering first.
    const frame = requestAnimationFrame(() => {
      if (focusNavigatorRef.current?.centerOn(anchor.photoId, anchor.zoom)) {
        pendingShareAnchorRef.current = null;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [wallReady, photos]);

  // A reload comes back to the same spot on the wall, and reopens the
  // photo that was open, unless a share link takes over. Saved per tab
  // when the page goes away.
  useEffect(() => {
    const spot = pendingSpotRef.current;
    if (!wallReady || !spot) return undefined;
    const frame = requestAnimationFrame(() => {
      const navigator = focusNavigatorRef.current;
      if (!navigator) return;
      pendingSpotRef.current = null;
      if (photosByIdRef.current.has(spot.photoId)) navigator.centerOn(spot.photoId, spot.zoom);
      const focused = spot.focusedPhotoId
        ? photosByIdRef.current.get(spot.focusedPhotoId)
        : undefined;
      if (focused) handlePhotoOpen(focused);
    });
    return () => cancelAnimationFrame(frame);
  }, [wallReady, photos, handlePhotoOpen]);

  useEffect(() => {
    const save = () => {
      // Still restoring: keep the spot from before the reload.
      if (pendingSpotRef.current) return;
      const view = focusNavigatorRef.current?.currentView();
      writeWallSpot(
        view?.photoId
          ? { photoId: view.photoId, zoom: view.zoom, focusedPhotoId: focusedPhotoIdRef.current }
          : null,
      );
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') save();
    };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const runMove = useCallback(
    (photo: PhotoQueryRecord, action: 'hide' | 'restore', undoable: boolean) => {
      movePhoto.mutate(
        { photoId: photo.id, action },
        {
          onSuccess: (result) => {
            // Step on to the next photo so curating can continue.
            stepPast(photo.id, 'next');
            const verb = action === 'hide' ? 'Hidden' : 'Restored';
            setToast({
              message: `${verb}: ${photo.filename}`,
              ...(undoable
                ? {
                    actionLabel: 'Undo',
                    onAction: () =>
                      runMove(result.photo, action === 'hide' ? 'restore' : 'hide', false),
                  }
                : {}),
            });
          },
          onError: (err) =>
            setToast({
              message: `Could not ${action === 'hide' ? 'hide' : 'restore'} ${photo.filename}: ${err.message}`,
              tone: 'error',
            }),
        },
      );
    },
    [stepPast, movePhoto],
  );

  const focusedPhotoRecord = focusedPhoto.photo;
  const curatorAction = useMemo(() => {
    if (!focusedPhotoRecord || !isCurator || !session?.libraryWrites) return undefined;
    const kind = isInHiddenFolder(focusedPhotoRecord.directoryPath) ? 'restore' : 'hide';
    return {
      kind,
      pending: movePhoto.isPending,
      onRun: () => runMove(focusedPhotoRecord, kind, true),
    } as const;
  }, [focusedPhotoRecord, isCurator, session?.libraryWrites, movePhoto.isPending, runMove]);

  const focusedFromBestOf =
    focusedPhotoRecord !== null && isShownFromBestOf(focusedPhotoRecord, albumAreas);

  const starPhoto = useStarPhoto();
  const runStar = useCallback(
    (photo: PhotoQueryRecord, starred: boolean, leavesWall: boolean) => {
      starPhoto.mutate(
        { photoId: photo.id, starred },
        {
          onSuccess: (result) => {
            if (!leavesWall) {
              // Show the new state right away; the wall refetches behind.
              setFocusedPhoto((prev) => updateFocusedPhoto(prev, result.photo));
              return;
            }
            // Unstarred while showing in Favorites: it leaves the wall, so
            // step on to the next photo, as Hide does.
            stepPast(photo.id, 'next');
            setToast({
              message: `Taken out of Favorites: ${photo.filename}`,
              actionLabel: 'Undo',
              onAction: () => runStar(result.photo, true, false),
            });
          },
          onError: (err) =>
            setToast({
              message: `Could not change Favorites for ${photo.filename}: ${err.message}`,
              tone: 'error',
            }),
        },
      );
    },
    [stepPast, starPhoto],
  );
  const curatorStar = useMemo(() => {
    if (!focusedPhotoRecord || !isCurator) return undefined;
    const starred = focusedPhotoRecord.starred === true;
    return {
      starred,
      pending: starPhoto.isPending,
      onToggle: () => runStar(focusedPhotoRecord, !starred, starred && focusedFromBestOf),
    };
  }, [focusedPhotoRecord, isCurator, starPhoto.isPending, runStar, focusedFromBestOf]);

  const setPhotoFeatured = useSetPhotoFeatured();
  // The album's current featured photo, while the curator confirms
  // replacing it with the focused one.
  const [featuredConflict, setFeaturedConflict] = useState<{
    photoId: string;
    current: PhotoQueryRecord;
    frame: FrameChoice;
    mat: FrameMat;
  } | null>(null);
  const runFeatured = useCallback(
    (
      photo: PhotoQueryRecord,
      featured: boolean,
      replace: boolean,
      frame?: FrameChoice,
      mat?: FrameMat,
    ) => {
      setPhotoFeatured.mutate(
        { photoId: photo.id, featured, replace, ...(frame ? { frame } : {}), ...(mat ? { mat } : {}) },
        {
          onSuccess: (result) => {
            setFeaturedConflict(null);
            setFocusedPhoto((prev) => updateFocusedPhoto(prev, result.photo));
          },
          onError: (err) => {
            const current = featuredConflictPhoto(err);
            if (current) {
              setFeaturedConflict({
                photoId: photo.id,
                current,
                frame: frame ?? 'random',
                mat: mat ?? 'frame',
              });
              return;
            }
            setFeaturedConflict(null);
            setToast({
              message: `Could not change the featured photo: ${err.message}`,
              tone: 'error',
            });
          },
        },
      );
    },
    [setPhotoFeatured],
  );
  const curatorFeatured = useMemo(() => {
    if (!focusedPhotoRecord || !isCurator) return undefined;
    if (isInHiddenFolder(focusedPhotoRecord.directoryPath)) return undefined;
    const featured = focusedPhotoRecord.featured === true;
    const replacing =
      featuredConflict?.photoId === focusedPhotoRecord.id ? featuredConflict.current : undefined;
    return {
      featured,
      frame: focusedPhotoRecord.frame ?? UNPICKED_FRAME,
      pending: setPhotoFeatured.isPending,
      onFeature: (frame: FrameChoice, mat: FrameMat) =>
        runFeatured(focusedPhotoRecord, true, false, frame, mat),
      onUnfeature: () => runFeatured(focusedPhotoRecord, false, false),
      replacing,
      onConfirmReplace: () =>
        runFeatured(focusedPhotoRecord, true, true, featuredConflict?.frame, featuredConflict?.mat),
      onCancelReplace: () => setFeaturedConflict(null),
    };
  }, [focusedPhotoRecord, isCurator, setPhotoFeatured.isPending, runFeatured, featuredConflict]);

  const setPhotoFrame = useSetPhotoFrame();
  const curatorFrame = useMemo(() => {
    if (!focusedPhotoRecord || !isCurator) return undefined;
    return {
      current: focusedPhotoRecord.frame ?? UNPICKED_FRAME,
      pending: setPhotoFrame.isPending,
      onSave: (frame: FrameChoice, mat: FrameMat) =>
        setPhotoFrame.mutate(
          { photoId: focusedPhotoRecord.id, frame, mat },
          {
            onSuccess: ({ photo }) => setFocusedPhoto((prev) => updateFocusedPhoto(prev, photo)),
            onError: (err) =>
              setToast({ message: `Could not change the frame: ${err.message}`, tone: 'error' }),
          },
        ),
    };
  }, [focusedPhotoRecord, isCurator, setPhotoFrame]);

  const setPhotoPrivate = useSetPhotoPrivate();
  const curatorPrivate = useMemo(() => {
    if (!focusedPhotoRecord || !isCurator) return undefined;
    const isPrivate = focusedPhotoRecord.private === true;
    return {
      private: isPrivate,
      pending: setPhotoPrivate.isPending,
      onToggle: () =>
        setPhotoPrivate.mutate(
          { photoId: focusedPhotoRecord.id, private: !isPrivate },
          {
            onSuccess: ({ photo }) => setFocusedPhoto((prev) => updateFocusedPhoto(prev, photo)),
            onError: (err) =>
              setToast({
                message: `Could not change ${focusedPhotoRecord.filename}: ${err.message}`,
                tone: 'error',
              }),
          },
        ),
    };
  }, [focusedPhotoRecord, isCurator, setPhotoPrivate]);

  const handleEditOpen = useMemo(() => {
    if (!focusedPhotoRecord || !isCurator) return undefined;
    return () => {
      setEditError(null);
      setEditingPhoto(focusedPhotoRecord);
    };
  }, [focusedPhotoRecord, isCurator]);

  // Save (or, with null, revert) an edit; the toast can undo it.
  const runEdit = useCallback(
    (photo: PhotoQueryRecord, edit: PhotoEdit | null) => {
      const apply = (target: PhotoQueryRecord, next: PhotoEdit | null, undoable: boolean) => {
        const previous = target.edit ?? null;
        photoEdit.mutate(
          { photoId: target.id, edit: next },
          {
            onSuccess: (result) => {
              setEditingPhoto(null);
              setFocusedPhoto((prev) => updateFocusedPhoto(prev, result.photo));
              setToast({
                message: `${next ? 'Edited' : 'Back to the original'}: ${target.filename}`,
                ...(undoable
                  ? { actionLabel: 'Undo', onAction: () => apply(result.photo, previous, false) }
                  : {}),
              });
            },
            onError: (err) => {
              setEditError(`Could not save: ${err.message}`);
              setToast({ message: `Could not save the edit: ${err.message}`, tone: 'error' });
            },
          },
        );
      };
      apply(photo, edit, true);
    },
    [photoEdit],
  );

  // A refetch of the same albums keeps the viewer's place on the wall.
  const selectionKey = useMemo(
    () => JSON.stringify([queryFilters, guestView]),
    [queryFilters, guestView],
  );

  // Featured photos the wall draws as hero tiles: not those showing in
  // Favorites, which has no featured photo of its own.
  const featuredPhotoIds = useMemo(
    () =>
      new Set(
        photos
          .filter((photo) => photo.featured && !isShownFromBestOf(photo, albumAreas))
          .map((photo) => photo.id),
      ),
    [photos, albumAreas],
  );

  const sharedWallProps = {
    photos,
    featuredPhotoIds,
    spacing: shownSpacing,
    randomFrames: display.randomFrames,
    selectionKey,
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
      {screen.kind === 'nothing-on-display' && <NothingOnDisplayState />}
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

      <div className="wall-veil" ref={veilRef} aria-hidden="true" data-testid="wall-veil" />
      <ControlsPanel
        open={menuOpen}
        onToggleOpen={() => setMenuOpen((v) => !v)}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        facets={treeFacets ?? null}
        curation={{
          session,
          albums: albumsQuery.data ?? null,
          onLogin: handleLogin,
          onChoosePin: handleChoosePin,
          onLogout: handleLogout,
          onSetVipPin: handleSetVipPin,
          vipPinPending: setVipPin.isPending || clearVipPin.isPending,
          onSetDisplay: handleSetDisplay,
          onToggleDefault: handleToggleDefault,
          onToggleDefaultStarred: handleToggleDefaultStarred,
          onSetDisplayDefaults: (next) =>
            setDisplayDefaults.mutate(next, {
              onError: (err) =>
                setToast({ message: `Could not save the defaults: ${err.message}`, tone: 'error' }),
            }),
          onRescan: handleRescan,
          previewAsGuest: guestView,
          onPreviewAsGuestChange: handleGuestPreviewChange,
          pinEntry,
          loginPending: curatorLogin.isPending || choosePin.isPending,
          rescanPending: rescanLibrary.isPending,
        }}
        share={{ onShare: handleShare, pending: sharePending, url: shareUrl }}
        wall={{
          spacing: display.spacing,
          onSpacingChange: (spacing) => updateDisplayPreference({ ...displayPreference, spacing }),
          lightboxFrames: display.lightboxFrames,
          onLightboxFramesChange: (lightboxFrames) =>
            updateDisplayPreference({ ...displayPreference, lightboxFrames }),
          customized: Object.keys(displayPreference).length > 0,
          onReset: () => updateDisplayPreference({}),
        }}
        errorMessage={controlsError}
      />

      {focusedPhoto.photo && !editingPhoto && (
        <FocusedPhotoLightbox
          photo={focusedPhoto.photo}
          onClose={handlePhotoClose}
          onNext={handleFocusNext}
          onPrevious={handleFocusPrevious}
          curatorAction={curatorAction}
          curatorStar={curatorStar}
          curatorFeatured={curatorFeatured}
          curatorFrame={curatorFrame}
          frame={display.lightboxFrames ? resolvePhotoFrame(focusedPhoto.photo, display.randomFrames) : undefined}
          curatorPrivate={curatorPrivate}
          sourceAlbum={focusedFromBestOf ? photoAlbumName(focusedPhoto.photo) : undefined}
          onEdit={handleEditOpen}
          onImageError={handleFocusedImageError}
        />
      )}

      {editingPhoto && (
        <PhotoEditor
          photo={editingPhoto}
          saving={photoEdit.isPending}
          error={editError}
          onCancel={() => setEditingPhoto(null)}
          onSave={(edit) => runEdit(editingPhoto, isNeutralEdit(edit) ? null : edit)}
          onRevert={() => runEdit(editingPhoto, null)}
        />
      )}

      {guestView && (
        <button
          type="button"
          className="guest-preview-badge"
          data-testid="guest-preview-badge"
          onClick={() => handleGuestPreviewChange(false)}
          title="The wall shows what guests see. Click to go back to your full view."
        >
          Previewing as guest · Exit
        </button>
      )}

      {toast && <CurationToast toast={toast} onDismiss={dismissToast} />}

      {import.meta.env.DEV && (
        <DebugOverlay
          screen={screen}
          filters={filters}
          camera={camera}
          layout={layout}
          status={statusQuery.data ?? null}
          facets={facetsQuery.data ?? null}
          wallStats={wallStats}
          dragState={dragState}
        />
      )}
    </main>
  );
}

const GUEST_PREVIEW_STORAGE_KEY = 'photo-wall.preview-as-guest';

/** The album's current featured photo, when featuring failed because of it. */
function featuredConflictPhoto(err: unknown): PhotoQueryRecord | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const body = err.body as Partial<PhotoFeaturedConflictResponse> | null;
  return body?.error === 'featured_exists' && body.current ? body.current : null;
}

/** What an unpicked photo hangs in: a random frame with that frame's own mat. */
const UNPICKED_FRAME: PhotoFrame = { frame: 'random', mat: 'frame' };
const SPACING_FADE_OUT_MS = 150;
const SPACING_FADE_IN_MS = 200;

function readGuestPreview(): boolean {
  try {
    return window.localStorage.getItem(GUEST_PREVIEW_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Unlisted path that shows the curator PIN form: `/curate`. */
export const CURATOR_ROUTE = '/curate';
/** Unlisted path where a guest enters the VIP PIN: `/vip`. */
export const VIP_ROUTE = '/vip';

function pinEntryRoute(): 'curator' | 'vip' | null {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname.replace(/\/+$/, '');
  return path === CURATOR_ROUTE ? 'curator' : path === VIP_ROUTE ? 'vip' : null;
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
