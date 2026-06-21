import type {
  MosaicLabCategoryFamily,
  MosaicLabFootprintKey,
} from './types.js';

export const MOSAIC_LAB_GEOMETRY_EPSILON = 1e-6;

export interface MosaicLabRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MosaicLabPackingFrame extends MosaicLabRect {
  x: 0;
  y: 0;
}

/**
 * Canonical logical layout contract for Mosaic Lab geometry.
 *
 * - `frame` is the finite occupancy target that the packer must cover.
 * - Tile occupancy is measured against logical tile rectangles, not DOM output.
 * - `gutterPx` is a render-time join hint only; it must never carve holes out of
 *   logical occupancy or change overlap/black-space metrics.
 * - `globalZoom` is a uniform render scale applied after layout. It changes only
 *   rendered coordinates, not the underlying footprint vocabulary or metrics.
 */
export interface MosaicLabPackingContract {
  frame: MosaicLabPackingFrame;
  gutterPx: number;
  globalZoom: number;
}

export interface MosaicLabPackedTileRect extends MosaicLabRect {
  tileId: string;
  footprintKey: MosaicLabFootprintKey;
  categoryFamily: MosaicLabCategoryFamily;
}

function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
}

function assertPositiveNumber(value: number, label: string): void {
  assertFiniteNumber(value, label);
  if (value <= 0) {
    throw new Error(`${label} must be greater than 0`);
  }
}

function assertNonNegativeNumber(value: number, label: string): void {
  assertFiniteNumber(value, label);
  if (value < 0) {
    throw new Error(`${label} must be greater than or equal to 0`);
  }
}

export function createPackingFrame(input: {
  width: number;
  height: number;
}): MosaicLabPackingFrame {
  const { width, height } = input;
  assertPositiveNumber(width, 'frame.width');
  assertPositiveNumber(height, 'frame.height');

  return Object.freeze({
    x: 0,
    y: 0,
    width,
    height,
  });
}

export function definePackingContract(input: {
  width: number;
  height: number;
  gutterPx?: number;
  globalZoom?: number;
}): MosaicLabPackingContract {
  const {
    width,
    height,
    gutterPx = 0,
    globalZoom = 1,
  } = input;

  assertNonNegativeNumber(gutterPx, 'gutterPx');
  assertPositiveNumber(globalZoom, 'globalZoom');

  return Object.freeze({
    frame: createPackingFrame({ width, height }),
    gutterPx,
    globalZoom,
  });
}

export function createPackedTileRect(input: {
  tileId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  footprintKey: MosaicLabFootprintKey;
  categoryFamily: MosaicLabCategoryFamily;
}): MosaicLabPackedTileRect {
  const {
    tileId,
    x,
    y,
    width,
    height,
    footprintKey,
    categoryFamily,
  } = input;

  if (!tileId) {
    throw new Error('tileId must be non-empty');
  }

  assertFiniteNumber(x, 'tile.x');
  assertFiniteNumber(y, 'tile.y');
  assertPositiveNumber(width, 'tile.width');
  assertPositiveNumber(height, 'tile.height');

  return Object.freeze({
    tileId,
    x,
    y,
    width,
    height,
    footprintKey,
    categoryFamily,
  });
}

export function computeRectArea(rect: MosaicLabRect): number {
  return rect.width * rect.height;
}

export function scaleRectForRender<T extends MosaicLabRect>(
  rect: T,
  input: Pick<MosaicLabPackingContract, 'globalZoom'> | number,
): T {
  const globalZoom = typeof input === 'number' ? input : input.globalZoom;
  assertPositiveNumber(globalZoom, 'globalZoom');

  return {
    ...rect,
    x: rect.x * globalZoom,
    y: rect.y * globalZoom,
    width: rect.width * globalZoom,
    height: rect.height * globalZoom,
  };
}
