// Next/previous order for the focused-photo view.
//
// The wall is a column mosaic, so the order snakes through it: down one
// column, up the neighbouring one, down the next, and so on. Every step
// lands on a photo touching the one before it (the same column, or the
// next column over at a turn), and the order is one cycle through every
// packed photo, so repeated stepping never circles a small local group.
// Grouped walls snake through each album area in turn, top to bottom.

import type { CameraState } from '../../state/camera.js';
import type { PackedRow, PackedTile } from './packer.js';
import { computeWrapAwareCameraTarget } from './signpostNavigation.js';

export type FocusStepDirection = 'next' | 'previous';

export interface FocusNavigation {
  /** Every packed photo id, in snake order. */
  order: string[];
  tilesById: Map<string, PackedTile>;
}

/** Imperative handle a wall view registers so the shell can step focus. */
export interface WallFocusNavigator {
  /**
   * Move focus one photo along the order and center the wall camera on
   * it. Returns the new photo id, or `null` when there is nowhere to go.
   */
  step(photoId: string, direction: FocusStepDirection): string | null;
}

const EDGE_EPSILON_PX = 0.5;

interface ColumnChain {
  x: number;
  width: number;
  top: number;
  bottom: number;
  tiles: PackedTile[];
}

export function buildFocusNavigation(
  rows: readonly PackedRow[],
): FocusNavigation {
  const tilesById = new Map<string, PackedTile>();
  for (const row of rows) {
    for (const tile of row.tiles) {
      if (!tilesById.has(tile.photoId)) tilesById.set(tile.photoId, tile);
    }
  }

  const chains = buildColumnChains([...tilesById.values()]);
  const order: string[] = [];
  for (const block of groupAdjoiningChains(chains)) {
    block.forEach((chain, index) => {
      const tiles = index % 2 === 0 ? chain.tiles : [...chain.tiles].reverse();
      for (const tile of tiles) order.push(tile.photoId);
    });
  }
  return { order, tilesById };
}

/** The neighbouring id in the order, wrapping at the ends. */
export function stepFocusOrder(
  order: readonly string[],
  photoId: string,
  direction: FocusStepDirection,
): string | null {
  const index = order.indexOf(photoId);
  if (index < 0 || order.length < 2) return null;
  const offset = direction === 'next' ? 1 : -1;
  return order[(index + offset + order.length) % order.length] ?? null;
}

/**
 * Camera travel offset that puts the tile's center at the viewport
 * center, choosing whichever wrapped copy of the tile is nearest.
 */
export function cameraCenteredOnTile(
  camera: CameraState,
  tile: Pick<PackedTile, 'x' | 'y' | 'width' | 'height'>,
  zoom: number,
): { x: number; y: number } {
  return computeWrapAwareCameraTarget({
    camera,
    targetX: tile.x + tile.width / 2,
    targetY: tile.y + tile.height / 2,
    zoom,
  });
}

/** Vertically contiguous runs of tiles sharing one column's x and width. */
function buildColumnChains(tiles: PackedTile[]): ColumnChain[] {
  const sorted = [...tiles].sort(
    (a, b) => a.x - b.x || a.width - b.width || a.y - b.y,
  );
  const chains: ColumnChain[] = [];
  let current: ColumnChain | null = null;
  for (const tile of sorted) {
    if (
      current &&
      near(current.x, tile.x) &&
      near(current.width, tile.width) &&
      near(current.bottom, tile.y)
    ) {
      current.tiles.push(tile);
      current.bottom = tile.y + tile.height;
      continue;
    }
    current = {
      x: tile.x,
      width: tile.width,
      top: tile.y,
      bottom: tile.y + tile.height,
      tiles: [tile],
    };
    chains.push(current);
  }
  return chains;
}

/**
 * Chains that sit side by side and overlap vertically belong to the same
 * mosaic block (the whole single-stream wall, or one album area). Blocks
 * come back top-to-bottom, then left-to-right; chains inside a block are
 * left-to-right.
 */
function groupAdjoiningChains(chains: ColumnChain[]): ColumnChain[][] {
  const parent = chains.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]!]!;
      index = parent[index]!;
    }
    return index;
  };

  for (let i = 0; i < chains.length; i += 1) {
    for (let j = i + 1; j < chains.length; j += 1) {
      const a = chains[i]!;
      const b = chains[j]!;
      const sideBySide =
        near(a.x + a.width, b.x) || near(b.x + b.width, a.x);
      const overlap = a.top < b.bottom && b.top < a.bottom;
      if (sideBySide && overlap) parent[find(i)] = find(j);
    }
  }

  const blocks = new Map<number, ColumnChain[]>();
  chains.forEach((chain, index) => {
    const root = find(index);
    const block = blocks.get(root);
    if (block) block.push(chain);
    else blocks.set(root, [chain]);
  });

  return [...blocks.values()]
    .map((block) => block.sort((a, b) => a.x - b.x || a.top - b.top))
    .sort((a, b) => blockTop(a) - blockTop(b) || a[0]!.x - b[0]!.x);
}

function blockTop(block: ColumnChain[]): number {
  return Math.min(...block.map((chain) => chain.top));
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= EDGE_EPSILON_PX;
}
