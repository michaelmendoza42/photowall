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
  DEFAULT_TARGET_ROW_HEIGHT,
} from './worldWidth.js';
import { computeVisibleRowRange } from './virtualization.js';
import { shouldLoadNextPage } from './dynamicLoading.js';
import { packJustifiedRows, type PackerResult } from './packer.js';
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
  type CameraState,
} from '../../state/camera.js';

/** How close the bottom edge must get to the frontier before we fetch. */
const FRONTIER_THRESHOLD_PX = 800;

export interface WallStats {
  totalRows: number;
  mountedRows: number;
  visibleStart: number;
  visibleEnd: number;
  /** Vertical camera offset (replaces legacy DOM scrollTop). */
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
  /** Override for unit tests; defaults to {@link DRAG_THRESHOLD_PX}. */
  dragThresholdPx?: number;
}

interface ActiveDrag {
  pointerId: number;
  origin: DragOrigin;
  /** Pointer coords from the previous move event, for incremental deltas. */
  lastX: number;
  lastY: number;
  crossedThreshold: boolean;
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
    dragThresholdPx = DRAG_THRESHOLD_PX,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<ActiveDrag | null>(null);
  // Mirror the prop into a ref so wheel/pointer handlers always read the
  // latest camera without forcing rebinds on every state tick.
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

  const [viewportHeight, setViewportHeight] = useState(0);
  // Mirror the live drag flag into React state so the `data-dragging`
  // attribute updates on the same tick as the gesture, not on the next
  // unrelated render. The ref above remains the source of truth inside
  // the high-frequency pointer handlers.
  const [dragActive, setDragActive] = useState(false);

  // Track viewport height of the canvas. ResizeObserver fires
  // synchronously after mount so the first render measures the actual
  // CSS layout size, not a 0 placeholder.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const apply = (): void => setViewportHeight(el.clientHeight);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const packed: PackerResult = useMemo(() => {
    return packJustifiedRows(
      photos,
      {
        worldWidth,
        targetRowHeight: DEFAULT_TARGET_ROW_HEIGHT,
        maxRowHeight: DEFAULT_MAX_ROW_HEIGHT,
      },
      hasNextPage,
    );
  }, [photos, worldWidth, hasNextPage]);

  const visible = useMemo(
    () =>
      computeVisibleRowRange({
        rows: packed.rows,
        scrollTop: camera.y,
        viewportHeight,
        overscan,
      }),
    [packed.rows, camera.y, viewportHeight, overscan],
  );

  // Dynamic loading: fire whenever the geometry says we are within
  // the frontier threshold. Driven by camera.y now that native scroll
  // is gone.
  useEffect(() => {
    if (
      shouldLoadNextPage({
        scrollTop: camera.y,
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
    onStatsChange({
      totalRows: packed.rows.length,
      mountedRows: Math.max(0, visible.endIndex - visible.startIndex),
      visibleStart: visible.startIndex,
      visibleEnd: visible.endIndex,
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
    visible.startIndex,
    visible.endIndex,
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

      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;

      // Move the camera opposite the drag delta so the world appears
      // to follow the pointer.
      const next = panBy(cameraRef.current, { dx: -dx, dy: -dy });
      if (next !== cameraRef.current) {
        cameraRef.current = next;
        cameraChangeRef.current(next);
      }

      if (
        !drag.crossedThreshold &&
        hasCrossedThreshold(
          drag.origin,
          { x: event.clientX, y: event.clientY },
          dragThresholdPx,
        )
      ) {
        drag.crossedThreshold = true;
        dragStateChangeRef.current?.({
          active: true,
          crossedThreshold: true,
        });
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
      dragRef.current = null;
      setDragActive(false);
      dragStateChangeRef.current?.({
        active: false,
        crossedThreshold: false,
      });
    },
    [],
  );

  const mountedRows = packed.rows.slice(visible.startIndex, visible.endIndex);

  // The world is centered horizontally when it is narrower than the
  // viewport. When wider, the camera owns the horizontal offset.
  const worldOffsetX = worldWidth >= camera.viewport.width
    ? -camera.x
    : Math.round((camera.viewport.width - worldWidth) / 2);

  return (
    <div
      className="wall-canvas"
      data-testid="wall-canvas"
      data-mounted-rows={mountedRows.length}
      data-total-rows={packed.rows.length}
      data-content-height={packed.contentHeight}
      data-world-width={worldWidth}
      data-camera-x={Math.round(camera.x)}
      data-camera-y={Math.round(camera.y)}
      data-dragging={dragActive ? 'true' : 'false'}
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={endDrag}
    >
      <div
        className="wall-canvas__world"
        style={{
          height: packed.contentHeight,
          width: worldWidth,
          transform: `translate3d(${worldOffsetX}px, ${-camera.y}px, 0)`,
        }}
      >
        {mountedRows.map((row) => (
          <div
            key={row.index}
            className="wall-canvas__row"
            data-row-index={row.index}
            style={{
              transform: `translate3d(0, ${row.offsetTop}px, 0)`,
              height: row.height,
              width: worldWidth,
            }}
          >
            {row.tiles.map((tile) => (
              <div
                key={tile.photoId}
                className="wall-canvas__tile"
                style={{
                  transform: `translate3d(${tile.x}px, 0, 0)`,
                  width: tile.width,
                  height: tile.height,
                }}
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
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
