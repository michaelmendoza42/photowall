import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DEFAULT_MAX_ROW_HEIGHT,
  DEFAULT_MOSAIC_COLUMN_FACTORS,
  DEFAULT_TARGET_ROW_HEIGHT,
} from './worldWidth.js';
import {
  computeWrappedAxisCopies,
  computeWrappedVisibleRowSegments,
} from './virtualization.js';
import { shouldLoadNextPage } from './dynamicLoading.js';
import {
  collectFirstAppearancePhotoIds,
  rememberSeenPhotoIds,
} from './appearanceTracking.js';
import { packJustifiedRows, type PackerResult } from './packer.js';
import {
  computeAnchoredHoverPreviewRect,
} from './hoverPreview.js';
import {
  DRAG_THRESHOLD_PX,
  hasCrossedThreshold,
  type DragOrigin,
} from './dragGesture.js';
import type { PhotoQueryRecord } from '../../../../shared/api/photos.js';
import { mediaResourcePath } from '../../../../shared/api/media.js';
import { DEFAULT_OVERSCAN, type LayoutOverscan } from '../../state/layout.js';
import {
  panBy,
  wrapTravelOffset,
  type CameraState,
} from '../../state/camera.js';

/** How close the bottom edge must get to the frontier before we fetch. */
const FRONTIER_THRESHOLD_PX = 800;

export interface WallStats {
  totalRows: number;
  mountedRows: number;
  visibleStart: number;
  visibleEnd: number;
  /** Continuous vertical travel offset (legacy debug label). */
  scrollTop: number;
  contentHeight: number;
  worldWidth: number;
  packedPhotoCount: number;
}

export interface WallDragState {
  /** True while a pointer is being held down on the canvas. */
  active: boolean;
  /** True once the active pointer has crossed the drag threshold. */
  crossedThreshold: boolean;
}

export const INITIAL_DRAG_STATE: WallDragState = {
  active: false,
  crossedThreshold: false,
};

export interface WallCanvasProps {
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
  /**
   * Fired when a tile receives a non-drag click. Suppressed when the
   * preceding pointer gesture crossed the drag threshold so a drag-pan
   * does not also open the modal.
   */
  onPhotoOpen?: (photo: PhotoQueryRecord) => void;
  /** True while the focused-photo modal is open. */
  isModalOpen?: boolean;
  /** Override for unit tests; defaults to {@link DRAG_THRESHOLD_PX}. */
  dragThresholdPx?: number;
}

interface ActiveDrag {
  pointerId: number;
  origin: DragOrigin;
  /** Last pointer coords that have been applied to camera panning. */
  lastX: number;
  lastY: number;
  crossedThreshold: boolean;
}

interface RenderedTileInstance {
  key: string;
  photoId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shouldFadeOnMount: boolean;
}

interface RenderedRowInstance {
  key: string;
  rowIndex: number;
  offsetTop: number;
  height: number;
  tiles: RenderedTileInstance[];
}

interface HoverPreviewState {
  photoId: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export function WallCanvas(props: WallCanvasProps): JSX.Element {
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
    onPhotoOpen,
    isModalOpen = false,
    dragThresholdPx = DRAG_THRESHOLD_PX,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<ActiveDrag | null>(null);
  const pressedPhotoIdRef = useRef<string | null>(null);
  const seenPhotoIdsRef = useRef<Set<string>>(new Set());

  // Mirror props into refs so wheel/pointer handlers always read the
  // latest callbacks without forcing rebinds on every state tick.
  const cameraRef = useRef(camera);
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  const cameraChangeRef = useRef(onCameraChange);
  useEffect(() => {
    cameraChangeRef.current = onCameraChange;
  }, [onCameraChange]);

  const dragStateChangeRef = useRef(onDragStateChange);
  useEffect(() => {
    dragStateChangeRef.current = onDragStateChange;
  }, [onDragStateChange]);

  const photoOpenRef = useRef(onPhotoOpen);
  useEffect(() => {
    photoOpenRef.current = onPhotoOpen;
  }, [onPhotoOpen]);

  // O(1) photo lookup by id for pointer activation and hover-preview
  // geometry.
  const photosById = useMemo(() => {
    const m = new Map<string, PhotoQueryRecord>();
    for (const p of photos) m.set(p.id, p);
    return m;
  }, [photos]);

  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  // Mirror the live drag flag into React state so the `data-dragging`
  // attribute updates on the same tick as the gesture, not on the next
  // unrelated render. The ref above remains the source of truth inside
  // the high-frequency pointer handlers.
  const [dragActive, setDragActive] = useState(false);
  const [hoverPreview, setHoverPreview] = useState<HoverPreviewState | null>(null);

  // Track viewport size of the canvas. ResizeObserver fires
  // synchronously after mount so the first render measures the actual
  // CSS layout size, not a 0 placeholder.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const apply = (): void => {
      const next = { width: el.clientWidth, height: el.clientHeight };
      setViewportSize((prev) =>
        prev.width === next.width && prev.height === next.height ? prev : next
      );
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const viewportWidth = viewportSize.width;
  const viewportHeight = viewportSize.height;

  const packed: PackerResult = useMemo(() => {
    return packJustifiedRows(
      photos,
      {
        worldWidth,
        targetRowHeight: DEFAULT_TARGET_ROW_HEIGHT,
        maxRowHeight: DEFAULT_MAX_ROW_HEIGHT,
        columnWidthFactors: DEFAULT_MOSAIC_COLUMN_FACTORS,
      },
      hasNextPage,
    );
  }, [photos, worldWidth, hasNextPage]);

  const wrappedCameraX = useMemo(
    () => wrapTravelOffset(camera.x, worldWidth),
    [camera.x, worldWidth],
  );
  const wrappedCameraY = useMemo(
    () => wrapTravelOffset(camera.y, packed.contentHeight),
    [camera.y, packed.contentHeight],
  );

  const horizontalCopies = useMemo(
    () =>
      computeWrappedAxisCopies({
        period: worldWidth,
        viewportSize: viewportWidth,
        wrappedOffset: wrappedCameraX,
      }),
    [worldWidth, viewportWidth, wrappedCameraX],
  );

  const verticalSegments = useMemo(
    () =>
      computeWrappedVisibleRowSegments({
        rows: packed.rows,
        contentHeight: packed.contentHeight,
        wrappedScrollTop: wrappedCameraY,
        viewportHeight,
        overscan,
      }),
    [packed.rows, packed.contentHeight, wrappedCameraY, viewportHeight, overscan],
  );

  const renderPlan = useMemo(() => {
    const firstAppearanceIds: string[] = [];
    const renderedRows: RenderedRowInstance[] = [];
    const seenPhotoIds = seenPhotoIdsRef.current;

    for (const segment of verticalSegments) {
      const rows = packed.rows.slice(segment.startIndex, segment.endIndex);
      for (const row of rows) {
        const rowFreshIds = collectFirstAppearancePhotoIds(
          row.tiles.map((tile) => tile.photoId),
          seenPhotoIds,
        );
        const rowFreshIdSet = new Set(rowFreshIds);
        firstAppearanceIds.push(...rowFreshIds);

        const rowTiles: RenderedTileInstance[] = [];
        for (const xCopy of horizontalCopies) {
          for (const tile of row.tiles) {
            rowTiles.push({
              key: `${row.index}:${segment.copyIndex}:${xCopy.copyIndex}:${tile.photoId}`,
              photoId: tile.photoId,
              x: tile.x + xCopy.offset,
              y: tile.y - row.offsetTop,
              width: tile.width,
              height: tile.height,
              shouldFadeOnMount: rowFreshIdSet.has(tile.photoId),
            });
          }
        }

        renderedRows.push({
          key: `${row.index}:${segment.copyIndex}`,
          rowIndex: row.index,
          offsetTop: row.offsetTop + segment.copyOffset,
          height: row.height,
          tiles: rowTiles,
        });
      }
    }

    const mountedRowIndices = new Set(renderedRows.map((row) => row.rowIndex));

    return {
      renderedRows,
      firstAppearanceIds: collectFirstAppearancePhotoIds(
        firstAppearanceIds,
        seenPhotoIds,
      ),
      mountedRowCount: mountedRowIndices.size,
    };
  }, [verticalSegments, packed.rows, horizontalCopies]);

  useEffect(() => {
    rememberSeenPhotoIds(seenPhotoIdsRef.current, renderPlan.firstAppearanceIds);
  }, [renderPlan.firstAppearanceIds]);

  useEffect(() => {
    if (dragActive || isModalOpen) {
      setHoverPreview(null);
    }
  }, [dragActive, isModalOpen]);

  // Dynamic loading: fire whenever the absolute travel position says we
  // are within the frontier threshold. Wrapped render position is
  // intentionally ignored so looping around the top does not stall
  // loading of later pages.
  useEffect(() => {
    if (
      shouldLoadNextPage({
        travelY: camera.y,
        viewportHeight,
        contentHeight: packed.contentHeight,
        thresholdPx: FRONTIER_THRESHOLD_PX,
        isFetchingNext: isFetchingNextPage,
        hasNextPage,
      })
    ) {
      onLoadMore();
    }
  }, [
    camera.y,
    viewportHeight,
    packed.contentHeight,
    isFetchingNextPage,
    hasNextPage,
    onLoadMore,
  ]);

  // Report stats up for the debug overlay so the parent does not need
  // to duplicate the geometry math.
  useEffect(() => {
    if (!onStatsChange) return;
    const visibleStart =
      verticalSegments.length > 0
        ? Math.min(...verticalSegments.map((segment) => segment.startIndex))
        : 0;
    const visibleEnd =
      verticalSegments.length > 0
        ? Math.max(...verticalSegments.map((segment) => segment.endIndex))
        : 0;
    onStatsChange({
      totalRows: packed.rows.length,
      mountedRows: renderPlan.mountedRowCount,
      visibleStart,
      visibleEnd,
      scrollTop: camera.y,
      contentHeight: packed.contentHeight,
      worldWidth,
      packedPhotoCount: packed.packedPhotoCount,
    });
  }, [
    onStatsChange,
    packed.rows.length,
    packed.contentHeight,
    packed.packedPhotoCount,
    renderPlan.mountedRowCount,
    verticalSegments,
    camera.y,
    worldWidth,
  ]);

  // The native wheel event is attached imperatively because React's
  // synthetic wheel handler binds as passive by default, which would
  // forbid `preventDefault` and let the browser also page-scroll.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const onWheel = (event: WheelEvent): void => {
      // Honor the event regardless of axis lock — trackpads emit both
      // deltaX and deltaY for 2D gestures.
      event.preventDefault();
      setHoverPreview(null);
      const next = panBy(cameraRef.current, {
        dx: event.deltaX,
        dy: event.deltaY,
      });
      if (next !== cameraRef.current) {
        // Update the ref optimistically so a burst of wheel events
        // between React renders compounds off the latest value rather
        // than a stale snapshot.
        cameraRef.current = next;
        cameraChangeRef.current(next);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Only react to the primary pointer (mouse left button / single
      // touch / pen). Right-click and middle-click should not pan.
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      if (dragRef.current) return;

      setHoverPreview(null);

      const target = event.target as HTMLElement | null;
      pressedPhotoIdRef.current =
        target?.closest<HTMLElement>('[data-photo-id]')?.dataset['photoId'] ??
        null;

      dragRef.current = {
        pointerId: event.pointerId,
        origin: { startX: event.clientX, startY: event.clientY },
        lastX: event.clientX,
        lastY: event.clientY,
        crossedThreshold: false,
      };
      // Pointer capture keeps move/up flowing if the pointer leaves the
      // canvas mid-drag. Guard against environments where the pointer
      // isn't bound to a real device (e.g., synthetic Playwright /
      // DevTools events) — capture isn't load-bearing for the gesture.
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
    },
    [],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

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

      // Move the camera opposite the drag delta so the world appears
      // to follow the pointer. We do not pan before the threshold is
      // crossed, which keeps minor click jitter from shifting the wall
      // out from under the click target.
      const next = panBy(cameraRef.current, { dx: -dx, dy: -dy });
      if (next !== cameraRef.current) {
        cameraRef.current = next;
        cameraChangeRef.current(next);
      }
    },
    [dragThresholdPx],
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
    [photosById],
  );

  const updateHoverPreview = useCallback(
    (tileEl: HTMLDivElement, photoId: string) => {
      if (!supportsFinePointerHover()) return;
      if (dragRef.current || isModalOpen || viewportWidth <= 0 || viewportHeight <= 0) {
        return;
      }
      const photo = photosById.get(photoId);
      if (!photo) return;

      const tileRect = tileEl.getBoundingClientRect();
      // Use the real browser viewport here so hover sizing matches the
      // focused-photo modal contract exactly. The canvas box can diverge
      // from window dimensions once overlays/debug surfaces enter the page.
      const previewViewport =
        typeof window === 'undefined'
          ? { width: viewportWidth, height: viewportHeight }
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
        photoId,
        left: previewRect.left,
        top: previewRect.top,
        width: previewRect.width,
        height: previewRect.height,
      });
    },
    [isModalOpen, photosById, viewportWidth, viewportHeight],
  );

  const handleTilePointerEnter = useCallback(
    (
      event: React.PointerEvent<HTMLDivElement>,
      photoId: string,
    ) => {
      updateHoverPreview(event.currentTarget, photoId);
    },
    [updateHoverPreview],
  );

  const handleTilePointerMove = useCallback(
    (
      event: React.PointerEvent<HTMLDivElement>,
      photoId: string,
    ) => {
      updateHoverPreview(event.currentTarget, photoId);
    },
    [updateHoverPreview],
  );

  const handleTilePointerLeave = useCallback((photoId: string) => {
    setHoverPreview((prev) => (prev?.photoId === photoId ? null : prev));
  }, []);

  return (
    <div
      className="wall-canvas"
      data-testid="wall-canvas"
      data-mounted-rows={renderPlan.mountedRowCount}
      data-total-rows={packed.rows.length}
      data-content-height={packed.contentHeight}
      data-world-width={worldWidth}
      data-camera-x={Math.round(camera.x)}
      data-camera-y={Math.round(camera.y)}
      data-render-x={Math.round(wrappedCameraX)}
      data-render-y={Math.round(wrappedCameraY)}
      data-dragging={dragActive ? 'true' : 'false'}
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div
        className="wall-canvas__world"
        style={{
          height: packed.contentHeight,
          width: worldWidth,
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
              <WallCanvasTile
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
          data-photo-id={hoverPreview.photoId}
          style={hoverPreviewStyle(hoverPreview)}
        >
          <img
            className="wall-hover-preview__img"
            data-testid="wall-hover-preview-image"
            data-media-variant="modal"
            src={mediaResourcePath(hoverPreview.photoId, 'modal')}
            alt=""
            draggable={false}
          />
        </div>
      )}
    </div>
  );
}

function WallCanvasTile(
  props: {
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
  },
): JSX.Element {
  const { tile, onPointerEnter, onPointerMove, onPointerLeave } = props;
  // Latch the mount-time appearance decision so unrelated rerenders do
  // not strip the fade class before the initial opacity animation ends.
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
    >
      <img
        className="wall-canvas__img"
        src={mediaResourcePath(tile.photoId, 'wall')}
        width={Math.round(tile.width)}
        height={Math.round(tile.height)}
        loading="lazy"
        decoding="async"
        alt=""
        draggable={false}
      />
    </div>
  );
}

/**
 * Build a tile style object that includes the per-tile translate
 * custom properties. Custom properties are not part of the standard
 * `CSSProperties` type, so the cast goes through `unknown` to keep
 * strict mode happy while still landing a valid style object at
 * runtime.
 */
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
