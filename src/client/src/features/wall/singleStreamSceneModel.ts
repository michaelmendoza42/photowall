import type { PhotoQueryRecord } from '../../../../shared/api/photos.js';
import type { LayoutOverscan } from '../../state/layout.js';
import {
  packJustifiedRows,
  type PackerResult,
} from './packer.js';
import type { PixiSceneTileInput } from './pixiScene.js';
import {
  buildSingleStreamRenderWindow,
  projectSingleStreamViewport,
  type SingleStreamRenderWindowRow,
  type SingleStreamRenderWindowTile,
} from './singleStreamRenderWindow.js';

export interface SingleStreamSceneModelInput {
  photos: readonly PhotoQueryRecord[];
  hasMore: boolean;
  worldWidth: number;
  cameraX: number;
  cameraY: number;
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  overscan: LayoutOverscan;
  maxRowHeight: number;
  columnWidthFactors?: readonly number[];
  tileScale?: number;
}

export type SingleStreamSceneTile = SingleStreamRenderWindowTile;

export type SingleStreamSceneRow = SingleStreamRenderWindowRow;

export interface SingleStreamSceneModel {
  packed: PackerResult;
  renderedRows: SingleStreamSceneRow[];
  pixiTiles: PixiSceneTileInput[];
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

export function buildSingleStreamSceneModel(
  input: SingleStreamSceneModelInput,
): SingleStreamSceneModel {
  const {
    photos,
    hasMore,
    worldWidth,
    cameraX,
    cameraY,
    zoom,
    viewportWidth,
    viewportHeight,
    overscan,
    maxRowHeight,
    columnWidthFactors,
    tileScale,
  } = input;

  const packed = packJustifiedRows(
    photos,
    {
      worldWidth,
      maxRowHeight,
      columnWidthFactors,
      tileScale,
    },
    hasMore,
  );

  const projection = projectSingleStreamViewport({
    worldWidth,
    contentHeight: packed.contentHeight,
    cameraX,
    cameraY,
    zoom,
    viewportWidth,
    viewportHeight,
  });

  const renderWindow = buildSingleStreamRenderWindow({
    packed,
    worldWidth,
    projection,
    overscan,
  });

  const pixiTiles = buildPixiSceneTileInputs(renderWindow.renderedRows);

  return {
    packed,
    renderedRows: renderWindow.renderedRows,
    pixiTiles,
    mountedRowCount: renderWindow.mountedRowCount,
    visibleStart: renderWindow.visibleStart,
    visibleEnd: renderWindow.visibleEnd,
    wrappedCameraX: renderWindow.wrappedCameraX,
    wrappedCameraY: renderWindow.wrappedCameraY,
    effectiveViewportWidth: renderWindow.effectiveViewportWidth,
    effectiveViewportHeight: renderWindow.effectiveViewportHeight,
    horizontalCopyCount: renderWindow.horizontalCopyCount,
    verticalSegmentCount: renderWindow.verticalSegmentCount,
    renderedTileCount: renderWindow.renderedTileCount,
  };
}

export function buildPixiSceneTileInputs(
  renderedRows: readonly SingleStreamSceneRow[],
): PixiSceneTileInput[] {
  return renderedRows.flatMap((row) =>
    row.tiles.map((tile) => ({
      key: tile.key,
      rowOffsetTop: row.offsetTop,
      x: tile.x,
      y: tile.y,
      width: tile.width,
      height: tile.height,
      photoId: tile.photoId,
      sourceWidth: tile.sourceWidth,
      sourceHeight: tile.sourceHeight,
    })),
  );
}
