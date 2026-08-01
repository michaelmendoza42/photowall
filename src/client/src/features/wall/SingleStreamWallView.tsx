import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_MAX_ROW_HEIGHT,
  DEFAULT_MOSAIC_COLUMN_FACTORS,
} from './worldWidth.js';
import { shouldLoadNextPage } from './dynamicLoading.js';
import {
  collectFirstAppearancePhotoIds,
  rememberSeenPhotoIds,
} from './appearanceTracking.js';
import { computeAnchoredHoverPreviewRect } from './hoverPreview.js';
import { PixiWallSurface } from './PixiWallSurface.js';
import { WallZoomControls } from './WallZoomControls.js';
import { useTouchPinchZoom } from './useTouchPinchZoom.js';
import { useRafCameraPublisher } from './useRafCameraPublisher.js';
import { useWheelMomentumPan } from './useWheelMomentumPan.js';
import {
  DRAG_THRESHOLD_PX,
  hasCrossedThreshold,
  type DragOrigin,
} from './dragGesture.js';
import {
  buildSingleStreamLayout,
  projectSingleStreamSceneModel,
  type SingleStreamSceneRow,
  type SingleStreamSceneTile,
} from './singleStreamSceneModel.js';
import type { PhotoQueryRecord } from '../../../../shared/api/photos.js';
import { DEFAULT_OVERSCAN, type LayoutOverscan } from '../../state/layout.js';
import {
  resolveWallMediaSource,
  type WallMediaSourceResolver,
} from './mediaSourceResolver.js';
import { panBy, type CameraState } from '../../state/camera.js';
import type { WallDragState, WallStats } from './WallCanvas.js';

/** How close the bottom edge must get to the frontier before we fetch. */
const FRONTIER_THRESHOLD_PX = 800;
const MIN_WALL_ZOOM = 0.55;
const MAX_WALL_ZOOM = 2.4;
const ZOOM_SENSITIVITY = 0.0036;

export interface SingleStreamWallViewProps {
  photos: readonly PhotoQueryRecord[];
  worldWidth: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  overscan?: LayoutOverscan;
  onStatsChange?: (stats: WallStats) => void;
  camera: CameraState;
  onCameraChange: (next: CameraState) => void;
  onDragStateChange?: (state: WallDragState) => void;
  activeAlbumAreaCount?: number;
  onPhotoOpen?: (photo: PhotoQueryRecord) => void;
  isModalOpen?: boolean;
  dragThresholdPx?: number;
  mediaSourceResolver?: WallMediaSourceResolver;
}

interface ActiveDrag {
  pointerId: number;
  origin: DragOrigin;
  lastX: number;
  lastY: number;
  crossedThreshold: boolean;
}

interface HoverPreviewState {
  photo: PhotoQueryRecord;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface RenderedTileInstance extends SingleStreamSceneTile {
  shouldFadeOnMount: boolean;
}

interface RenderedRowInstance extends Omit<SingleStreamSceneRow, 'tiles'> {
  tiles: RenderedTileInstance[];
}

export function SingleStreamWallView(props: SingleStreamWallViewProps): JSX.Element {
  const {
    photos,
    worldWidth,
    hasNextPage,
    isFetchingNextPage,
    onLoadMore,
    overscan = DEFAULT_OVERSCAN,
    onStatsChange,
    camera,
    onCameraChange,
    onDragStateChange,
    activeAlbumAreaCount = 1,
    onPhotoOpen,
    isModalOpen = false,
    dragThresholdPx = DRAG_THRESHOLD_PX,
    mediaSourceResolver,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<ActiveDrag | null>(null);
  const pressedPhotoIdRef = useRef<string | null>(null);
  const seenPhotoIdsRef = useRef<Set<string>>(new Set());

  const cameraRef = useRef(camera);
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  const { publish: publishCamera, flush: flushCamera } = useRafCameraPublisher(onCameraChange);
  const {
    start: startWheelMomentum,
    cancel: cancelWheelMomentum,
  } = useWheelMomentumPan({ cameraRef, publishCamera, flushCamera });

  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [dragActive, setDragActive] = useState(false);
  const [hoverPreview, setHoverPreview] = useState<HoverPreviewState | null>(null);
  const [zoom, setZoom] = useState(1);

  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useTouchPinchZoom(containerRef, zoomRef, setZoom, MIN_WALL_ZOOM, MAX_WALL_ZOOM);

  const dragStateChangeRef = useRef(onDragStateChange);
  useEffect(() => {
    dragStateChangeRef.current = onDragStateChange;
  }, [onDragStateChange]);

  const photoOpenRef = useRef(onPhotoOpen);
  useEffect(() => {
    photoOpenRef.current = onPhotoOpen;
  }, [onPhotoOpen]);

  const photosById = useMemo(() => {
    const map = new Map<string, PhotoQueryRecord>();
    for (const photo of photos) map.set(photo.id, photo);
    return map;
  }, [photos]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const apply = (): void => {
      const next = { width: el.clientWidth, height: el.clientHeight };
      setViewportSize((prev) =>
        prev.width === next.width && prev.height === next.height ? prev : next,
      );
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const packedLayout = useMemo(
    () =>
      buildSingleStreamLayout({
        photos,
        hasMore: hasNextPage,
        worldWidth,
        maxRowHeight: DEFAULT_MAX_ROW_HEIGHT,
        columnWidthFactors: DEFAULT_MOSAIC_COLUMN_FACTORS,
      }),
    [photos, hasNextPage, worldWidth],
  );

  const sceneModel = useMemo(
    () =>
      projectSingleStreamSceneModel({
        packed: packedLayout,
        worldWidth,
        cameraX: camera.x,
        cameraY: camera.y,
        zoom,
        viewportWidth: viewportSize.width,
        viewportHeight: viewportSize.height,
        overscan,
      }),
    [
      packedLayout,
      worldWidth,
      camera.x,
      camera.y,
      zoom,
      viewportSize.width,
      viewportSize.height,
      overscan,
    ],
  );

  const renderPlan = useMemo(() => {
    const visiblePhotoIds = sceneModel.renderedRows.flatMap((row) =>
      row.tiles.map((tile) => tile.photoId),
    );
    const firstAppearanceIds = collectFirstAppearancePhotoIds(
      visiblePhotoIds,
      seenPhotoIdsRef.current,
    );
    const firstAppearanceIdSet = new Set(firstAppearanceIds);

    const renderedRows: RenderedRowInstance[] = sceneModel.renderedRows.map((row) => ({
      ...row,
      tiles: row.tiles.map((tile) => ({
        ...tile,
        shouldFadeOnMount: firstAppearanceIdSet.has(tile.photoId),
      })),
    }));

    return {
      renderedRows,
      firstAppearanceIds,
    };
  }, [sceneModel.renderedRows]);

  useEffect(() => {
    rememberSeenPhotoIds(seenPhotoIdsRef.current, renderPlan.firstAppearanceIds);
  }, [renderPlan.firstAppearanceIds]);

  useEffect(() => {
    if (dragActive || isModalOpen) {
      setHoverPreview(null);
    }
    if (isModalOpen) {
      cancelWheelMomentum();
    }
  }, [dragActive, isModalOpen, cancelWheelMomentum]);

  useEffect(() => {
    if (
      shouldLoadNextPage({
        travelY: camera.y,
        viewportHeight: sceneModel.effectiveViewportHeight,
        contentHeight: sceneModel.packed.contentHeight,
        thresholdPx: FRONTIER_THRESHOLD_PX,
        isFetchingNext: isFetchingNextPage,
        hasNextPage,
      })
    ) {
      onLoadMore();
    }
  }, [
    camera.y,
    sceneModel.effectiveViewportHeight,
    sceneModel.packed.contentHeight,
    isFetchingNextPage,
    hasNextPage,
    onLoadMore,
  ]);

  useEffect(() => {
    if (!onStatsChange) return;
    onStatsChange({
      totalRows: sceneModel.packed.rows.length,
      mountedRows: sceneModel.mountedRowCount,
      visibleStart: sceneModel.visibleStart,
      visibleEnd: sceneModel.visibleEnd,
      scrollTop: camera.y,
      contentHeight: sceneModel.packed.contentHeight,
      worldWidth,
      packedPhotoCount: sceneModel.packed.packedPhotoCount,
    });
  }, [
    onStatsChange,
    sceneModel.packed.rows.length,
    sceneModel.mountedRowCount,
    sceneModel.visibleStart,
    sceneModel.visibleEnd,
    sceneModel.packed.contentHeight,
    sceneModel.packed.packedPhotoCount,
    camera.y,
    worldWidth,
  ]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      cancelWheelMomentum();
      setHoverPreview(null);

      if (event.ctrlKey || event.metaKey) {
        const nextZoom = clamp(
          zoomRef.current * Math.exp(-event.deltaY * ZOOM_SENSITIVITY),
          MIN_WALL_ZOOM,
          MAX_WALL_ZOOM,
        );
        if (nextZoom !== zoomRef.current) {
          zoomRef.current = nextZoom;
          setZoom(nextZoom);
        }
        return;
      }

      const panDelta = {
        dx: event.deltaX / zoomRef.current,
        dy: event.deltaY / zoomRef.current,
      };
      const next = panBy(cameraRef.current, panDelta);
      if (next !== cameraRef.current) {
        cameraRef.current = next;
        publishCamera(next);
        startWheelMomentum(panDelta);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [cancelWheelMomentum, publishCamera, startWheelMomentum]);

  const changeZoom = useCallback((factor: number) => {
    const nextZoom = clamp(zoomRef.current * factor, MIN_WALL_ZOOM, MAX_WALL_ZOOM);
    if (nextZoom !== zoomRef.current) {
      zoomRef.current = nextZoom;
      setZoom(nextZoom);
    }
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    if (dragRef.current) return;

    cancelWheelMomentum();
    setHoverPreview(null);

    const target = event.target as HTMLElement | null;
    pressedPhotoIdRef.current =
      target?.closest<HTMLElement>('[data-photo-id]')?.dataset['photoId'] ?? null;

    dragRef.current = {
      pointerId: event.pointerId,
      origin: { startX: event.clientX, startY: event.clientY },
      lastX: event.clientX,
      lastY: event.clientY,
      crossedThreshold: false,
    };

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }

    setDragActive(true);
    dragStateChangeRef.current?.({
      active: true,
      crossedThreshold: false,
    });
  }, [cancelWheelMomentum]);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      if (!drag.crossedThreshold) {
        if (
          !hasCrossedThreshold(
            drag.origin,
            { x: event.clientX, y: event.clientY },
            dragThresholdPx,
          )
        ) {
          return;
        }

        drag.crossedThreshold = true;
        dragStateChangeRef.current?.({
          active: true,
          crossedThreshold: true,
        });
      }

      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;

      const next = panBy(cameraRef.current, {
        dx: -dx / zoomRef.current,
        dy: -dy / zoomRef.current,
      });
      if (next !== cameraRef.current) {
        cameraRef.current = next;
        publishCamera(next);
      }
    },
    [dragThresholdPx, publishCamera],
  );

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        /* ignore */
      }
      const shouldOpenPhoto =
        !drag.crossedThreshold && event.type === 'pointerup'
          ? pressedPhotoIdRef.current
          : null;

      flushCamera();
      dragRef.current = null;
      pressedPhotoIdRef.current = null;
      setDragActive(false);
      dragStateChangeRef.current?.({
        active: false,
        crossedThreshold: false,
      });

      if (!shouldOpenPhoto) return;
      const photo = photosById.get(shouldOpenPhoto);
      if (!photo) return;
      setHoverPreview(null);
      photoOpenRef.current?.(photo);
    },
    [flushCamera, photosById],
  );

  const updateHoverPreview = useCallback(
    (tileEl: HTMLDivElement, photoId: string) => {
      if (!supportsFinePointerHover()) return;
      if (
        dragRef.current ||
        isModalOpen ||
        viewportSize.width <= 0 ||
        viewportSize.height <= 0
      ) {
        return;
      }
      const photo = photosById.get(photoId);
      if (!photo) return;

      const tileRect = tileEl.getBoundingClientRect();
      const previewViewport =
        typeof window === 'undefined'
          ? { width: viewportSize.width, height: viewportSize.height }
          : { width: window.innerWidth, height: window.innerHeight };
      const previewRect = computeAnchoredHoverPreviewRect({
        viewport: previewViewport,
        tile: {
          left: tileRect.left,
          top: tileRect.top,
          width: tileRect.width,
          height: tileRect.height,
        },
        photo: { width: photo.width, height: photo.height },
      });

      if (previewRect.width <= 0 || previewRect.height <= 0) return;

      setHoverPreview({
        photo,
        left: previewRect.left,
        top: previewRect.top,
        width: previewRect.width,
        height: previewRect.height,
      });
    },
    [isModalOpen, photosById, viewportSize.height, viewportSize.width],
  );

  const handleTilePointerEnter = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, photoId: string) => {
      updateHoverPreview(event.currentTarget, photoId);
    },
    [updateHoverPreview],
  );

  const handleTilePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, photoId: string) => {
      updateHoverPreview(event.currentTarget, photoId);
    },
    [updateHoverPreview],
  );

  const handleTilePointerLeave = useCallback((photoId: string) => {
    setHoverPreview((prev) => (prev?.photo.id === photoId ? null : prev));
  }, []);

  return (
    <div
      className="wall-canvas"
      data-testid="wall-canvas"
      data-mounted-rows={sceneModel.mountedRowCount}
      data-total-rows={sceneModel.packed.rows.length}
      data-content-height={sceneModel.packed.contentHeight}
      data-world-width={worldWidth}
      data-camera-x={Math.round(camera.x)}
      data-camera-y={Math.round(camera.y)}
      data-render-x={Math.round(sceneModel.wrappedCameraX)}
      data-render-y={Math.round(sceneModel.wrappedCameraY)}
      data-render-window-row-copies={sceneModel.renderedRows.length}
      data-render-window-segments={sceneModel.verticalSegmentCount}
      data-render-window-x-copies={sceneModel.horizontalCopyCount}
      data-rendered-tiles={sceneModel.renderedTileCount}
      data-dragging={dragActive ? 'true' : 'false'}
      data-layout-mode="single"
      data-active-album-area-count={activeAlbumAreaCount}
      data-zoom={zoom.toFixed(2)}
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <PixiWallSurface
        tiles={sceneModel.pixiTiles.map((tile) => ({
          ...tile,
          sourceMtimeMs: photosById.get(tile.photoId)?.mtimeMs,
        }))}
        viewportWidth={viewportSize.width}
        viewportHeight={viewportSize.height}
        worldWidth={worldWidth}
        worldHeight={sceneModel.packed.contentHeight}
        zoom={zoom}
        mediaSourceResolver={mediaSourceResolver}
      />

      <WallZoomControls
        onZoomOut={() => changeZoom(1 / 1.25)}
        onZoomIn={() => changeZoom(1.25)}
      />

      <div
        className="wall-canvas__world wall-canvas__world--hit-targets"
        style={{
          height: sceneModel.packed.contentHeight,
          width: worldWidth,
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
        }}
      >
        {renderPlan.renderedRows.map((row) => (
          <div
            key={row.key}
            className="wall-canvas__row"
            style={{
              transform: `translate3d(0, ${row.offsetTop}px, 0)`,
              height: row.height,
              width: worldWidth,
            }}
          >
            {row.tiles.map((tile) => (
              <V2WallTile
                key={tile.key}
                tile={tile}
                onPointerEnter={handleTilePointerEnter}
                onPointerMove={handleTilePointerMove}
                onPointerLeave={handleTilePointerLeave}
              />
            ))}
          </div>
        ))}
      </div>

      {hoverPreview && (
        <div
          className="wall-hover-preview"
          data-testid="wall-hover-preview"
          data-photo-id={hoverPreview.photo.id}
          style={hoverPreviewStyle(hoverPreview)}
        >
          <img
            className="wall-hover-preview__img"
            data-testid="wall-hover-preview-image"
            data-media-variant="modal"
            src={resolveWallMediaSource(
              hoverPreview.photo,
              'modal',
              mediaSourceResolver,
            )}
            alt=""
            draggable={false}
          />
        </div>
      )}
    </div>
  );
}

function V2WallTile(props: {
  tile: RenderedTileInstance;
  onPointerEnter?: (
    event: React.PointerEvent<HTMLDivElement>,
    photoId: string,
  ) => void;
  onPointerMove?: (
    event: React.PointerEvent<HTMLDivElement>,
    photoId: string,
  ) => void;
  onPointerLeave?: (photoId: string) => void;
}): JSX.Element {
  const { tile, onPointerEnter, onPointerMove, onPointerLeave } = props;
  const shouldFadeOnMountRef = useRef(tile.shouldFadeOnMount);

  return (
    <div
      className="wall-canvas__tile"
      data-testid="wall-photo-tile"
      data-photo-id={tile.photoId}
      data-appearance={shouldFadeOnMountRef.current ? 'fresh' : 'seen'}
      style={tileStyle(tile.x, tile.y, tile.width, tile.height)}
      onPointerEnter={(event) => onPointerEnter?.(event, tile.photoId)}
      onPointerMove={(event) => onPointerMove?.(event, tile.photoId)}
      onPointerLeave={() => onPointerLeave?.(tile.photoId)}
    />
  );
}

function tileStyle(
  x: number,
  y: number,
  width: number,
  height: number,
): React.CSSProperties {
  return {
    width,
    height,
    '--tile-x': `${x}px`,
    '--tile-y': `${y}px`,
  } as unknown as React.CSSProperties;
}

function hoverPreviewStyle(preview: HoverPreviewState): React.CSSProperties {
  return {
    width: preview.width,
    height: preview.height,
    '--hover-preview-left': `${preview.left}px`,
    '--hover-preview-top': `${preview.top}px`,
  } as unknown as React.CSSProperties;
}

function supportsFinePointerHover(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
