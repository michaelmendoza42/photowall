import type { LayoutOverscan } from '../../state/layout.js';
import { wrapTravelOffset } from '../../state/camera.js';
import type { PackedTile, PackerResult } from './packer.js';
import {
  computeWrappedAxisCopies,
  computeWrappedVisibleRowSegments,
  isNearViewportHorizontally,
} from './virtualization.js';

export interface SingleStreamViewportProjection {
  wrappedCameraX: number;
  wrappedCameraY: number;
  effectiveViewportWidth: number;
  effectiveViewportHeight: number;
}

export interface SingleStreamRenderWindowTile {
  key: string;
  photoId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  /** Edge tiles that overlap the next copy draw above (see radialWall). */
  layer: number;
}

export interface SingleStreamRenderWindowRow {
  key: string;
  rowIndex: number;
  offsetTop: number;
  height: number;
  tiles: SingleStreamRenderWindowTile[];
}

export interface SingleStreamRenderWindow {
  renderedRows: SingleStreamRenderWindowRow[];
  mountedRowCount: number;
  visibleStart: number;
  visibleEnd: number;
  wrappedCameraX: number;
  wrappedCameraY: number;
  effectiveViewportWidth: number;
  effectiveViewportHeight: number;
  horizontalCopyCount: number;
  verticalSegmentCount: number;
  renderedTileCount: number;
}

export function projectSingleStreamViewport(input: {
  worldWidth: number;
  contentHeight: number;
  cameraX: number;
  cameraY: number;
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
}): SingleStreamViewportProjection {
  const {
    worldWidth,
    contentHeight,
    cameraX,
    cameraY,
    zoom,
    viewportWidth,
    viewportHeight,
  } = input;

  const normalizedZoom = zoom > 0 ? zoom : 1;

  return {
    wrappedCameraX: wrapTravelOffset(cameraX, worldWidth),
    wrappedCameraY: wrapTravelOffset(cameraY, contentHeight),
    effectiveViewportWidth: viewportWidth / normalizedZoom,
    effectiveViewportHeight: viewportHeight / normalizedZoom,
  };
}

export function buildSingleStreamRenderWindow(input: {
  packed: PackerResult;
  worldWidth: number;
  projection: SingleStreamViewportProjection;
  overscan: LayoutOverscan;
}): SingleStreamRenderWindow {
  const { packed, worldWidth, projection, overscan } = input;

  const horizontalCopies = computeWrappedAxisCopies({
    period: worldWidth,
    viewportSize: projection.effectiveViewportWidth,
    wrappedOffset: projection.wrappedCameraX,
  });

  const verticalSegments = computeWrappedVisibleRowSegments({
    rows: packed.rows,
    contentHeight: packed.contentHeight,
    wrappedScrollTop: projection.wrappedCameraY,
    viewportHeight: projection.effectiveViewportHeight,
    overscan,
  });

  const renderedRows: SingleStreamRenderWindowRow[] = [];

  for (const segment of verticalSegments) {
    const rows = packed.rows.slice(segment.startIndex, segment.endIndex);
    for (const row of rows) {
      renderedRows.push({
        key: `${row.index}:${segment.copyIndex}`,
        rowIndex: row.index,
        offsetTop: row.offsetTop + segment.copyOffset,
        height: row.height,
        tiles: buildWrappedRowTiles({
          rowIndex: row.index,
          copyIndex: segment.copyIndex,
          rowOffsetTop: row.offsetTop,
          tiles: row.tiles,
          horizontalCopies,
          viewportWidth: projection.effectiveViewportWidth,
        }),
      });
    }
  }

  const mountedRowIndices = new Set(renderedRows.map((row) => row.rowIndex));
  const renderedTileCount = renderedRows.reduce(
    (total, row) => total + row.tiles.length,
    0,
  );

  return {
    renderedRows,
    mountedRowCount: mountedRowIndices.size,
    visibleStart:
      verticalSegments.length > 0
        ? Math.min(...verticalSegments.map((segment) => segment.startIndex))
        : 0,
    visibleEnd:
      verticalSegments.length > 0
        ? Math.max(...verticalSegments.map((segment) => segment.endIndex))
        : 0,
    wrappedCameraX: projection.wrappedCameraX,
    wrappedCameraY: projection.wrappedCameraY,
    effectiveViewportWidth: projection.effectiveViewportWidth,
    effectiveViewportHeight: projection.effectiveViewportHeight,
    horizontalCopyCount: horizontalCopies.length,
    verticalSegmentCount: verticalSegments.length,
    renderedTileCount,
  };
}

function buildWrappedRowTiles(input: {
  rowIndex: number;
  copyIndex: number;
  rowOffsetTop: number;
  tiles: readonly PackedTile[];
  horizontalCopies: readonly { copyIndex: number; offset: number }[];
  viewportWidth: number;
}): SingleStreamRenderWindowTile[] {
  const { rowIndex, copyIndex, rowOffsetTop, tiles, horizontalCopies, viewportWidth } = input;
  const nextTiles: SingleStreamRenderWindowTile[] = [];

  for (const xCopy of horizontalCopies) {
    tiles.forEach((tile, tileIndex) => {
      if (!isNearViewportHorizontally(tile.x + xCopy.offset, tile.width, viewportWidth)) {
        return;
      }
      // The index keeps keys unique where an edge repeat shares a photo.
      nextTiles.push({
        key: `${rowIndex}:${copyIndex}:${xCopy.copyIndex}:${tileIndex}:${tile.photoId}`,
        photoId: tile.photoId,
        x: tile.x + xCopy.offset,
        y: tile.y - rowOffsetTop,
        width: tile.width,
        height: tile.height,
        sourceWidth: tile.sourceWidth,
        sourceHeight: tile.sourceHeight,
        layer: tile.layer ?? 0,
      });
    });
  }

  return nextTiles;
}
