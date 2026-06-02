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
import type { PhotoQueryRecord } from '../../../../shared/api/photos.js';
import { mediaResourcePath } from '../../../../shared/api/media.js';
import { DEFAULT_OVERSCAN, type LayoutOverscan } from '../../state/layout.js';

/** How close the bottom edge must get to the frontier before we fetch. */
const FRONTIER_THRESHOLD_PX = 800;

export interface WallStats {
  totalRows: number;
  mountedRows: number;
  visibleStart: number;
  visibleEnd: number;
  scrollTop: number;
  contentHeight: number;
  worldWidth: number;
  packedPhotoCount: number;
}

export interface WallCanvasProps {
  photos: readonly PhotoQueryRecord[];
  worldWidth: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  overscan?: LayoutOverscan;
  onStatsChange?: (stats: WallStats) => void;
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
  } = props;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  // Track viewport height of the scroll container. ResizeObserver fires
  // synchronously after mount so the first render measures the actual
  // CSS layout size, not a 0 placeholder.
  useLayoutEffect(() => {
    const el = scrollRef.current;
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
        scrollTop,
        viewportHeight,
        overscan,
      }),
    [packed.rows, scrollTop, viewportHeight, overscan],
  );

  // Dynamic loading: fire whenever the geometry says we are within
  // the frontier threshold. `useEffect` debounces the call to the
  // post-render tick, so a single scroll tick can't queue two fetches.
  useEffect(() => {
    if (
      shouldLoadNextPage({
        scrollTop,
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
    scrollTop,
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
      scrollTop,
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
    scrollTop,
    worldWidth,
  ]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const mountedRows = packed.rows.slice(visible.startIndex, visible.endIndex);

  return (
    <div
      className="wall-canvas"
      data-testid="wall-canvas"
      data-mounted-rows={mountedRows.length}
      data-total-rows={packed.rows.length}
      data-content-height={packed.contentHeight}
      data-world-width={worldWidth}
      ref={scrollRef}
      onScroll={handleScroll}
    >
      <div
        className="wall-canvas__world"
        style={{
          height: packed.contentHeight,
          width: worldWidth,
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
