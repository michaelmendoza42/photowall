// Next/previous order for the focused-photo view.
//
// Next moves right across the wall. The wall is cut into bands about two
// photos tall, and the order runs a small serpentine along each band:
// down the band's slice of the first column, up the next column's slice,
// down the next, and so on to the right edge. It then drops to the next
// band and carries on rightward from the left edge, which on the looping
// wall sits just right of the edge it left. The order is one cycle through
// every packed photo, so holding next never repeats a photo until the
// whole wall is covered. Grouped walls run through each album's mosaic in
// turn.

import type { CameraState } from '../../state/camera.js';
import type { PackedRow, PackedTile } from './packer.js';
import { computeWrapAwareCameraTarget } from './signpostNavigation.js';

export type FocusStepDirection = 'next' | 'previous';

export interface FocusNavigation {
  /** Every packed photo id, in band-serpentine order. */
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
  /**
   * Glide the wall until the photo is centered, first setting the zoom
   * when one is given. Returns false when the photo is not on the wall.
   */
  centerOn(photoId: string, zoom?: number | null): boolean;
  /** The photo nearest the middle of the screen, and the current zoom. */
  currentView(): { photoId: string | null; zoom: number };
}

/** A band is about this many photos tall. */
const BAND_PHOTOS = 2;

function medianHeight(tiles: readonly PackedTile[]): number {
  const heights = tiles.map((tile) => tile.height).sort((a, b) => a - b);
  return Math.max(heights[Math.floor(heights.length / 2)] ?? 1, 1);
}

export function buildFocusNavigation(
  rows: readonly PackedRow[],
): FocusNavigation {
  const tilesById = new Map<string, PackedTile>();
  for (const row of rows) {
    for (const tile of row.tiles) {
      // Edge repeats show a photo that also sits elsewhere; step via the original.
      if (tile.duplicate) continue;
      if (!tilesById.has(tile.photoId)) tilesById.set(tile.photoId, tile);
    }
  }

  const mosaics = new Map<number, PackedTile[]>();
  for (const tile of tilesById.values()) {
    const tiles = mosaics.get(tile.mosaic) ?? [];
    mosaics.set(tile.mosaic, tiles);
    tiles.push(tile);
  }

  const order: string[] = [];
  for (const mosaic of [...mosaics.keys()].sort((a, b) => a - b)) {
    const tiles = mosaics.get(mosaic)!;
    const top = Math.min(...tiles.map((tile) => tile.y));
    const bandHeight = BAND_PHOTOS * medianHeight(tiles);
    const bandOf = (tile: PackedTile) =>
      Math.max(0, Math.floor((tile.y + tile.height / 2 - top) / bandHeight));

    const bands = new Map<number, Map<number, PackedTile[]>>();
    for (const tile of tiles) {
      const band = bandOf(tile);
      const bandLanes = bands.get(band) ?? new Map<number, PackedTile[]>();
      bands.set(band, bandLanes);
      const slice = bandLanes.get(tile.lane) ?? [];
      bandLanes.set(tile.lane, slice);
      slice.push(tile);
    }

    for (const band of [...bands.keys()].sort((a, b) => a - b)) {
      const bandLanes = bands.get(band)!;
      [...bandLanes.keys()]
        .sort((a, b) => a - b)
        .forEach((lane, index) => {
          const slice = bandLanes.get(lane)!.sort((a, b) => a.y - b.y);
          if (index % 2 === 1) slice.reverse();
          for (const tile of slice) order.push(tile.photoId);
        });
    }
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

/**
 * The tile whose center is nearest the middle of the viewport, measuring
 * across the wall's wrap seams.
 */
export function tileNearestViewportCenter(
  camera: CameraState,
  tiles: Iterable<PackedTile>,
  zoom: number,
): PackedTile | null {
  const scale = zoom > 0 ? zoom : 1;
  const periodX = camera.world.width;
  const periodY = camera.world.height ?? 0;
  const centerX = camera.x + camera.viewport.width / (2 * scale);
  const centerY = camera.y + camera.viewport.height / (2 * scale);
  const wrappedDistance = (delta: number, period: number): number => {
    if (!Number.isFinite(period) || period <= 0) return Math.abs(delta);
    const wrapped = ((delta % period) + period) % period;
    return Math.min(wrapped, period - wrapped);
  };
  let best: PackedTile | null = null;
  let bestDistance = Infinity;
  for (const tile of tiles) {
    const dx = wrappedDistance(tile.x + tile.width / 2 - centerX, periodX);
    const dy = wrappedDistance(tile.y + tile.height / 2 - centerY, periodY);
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = tile;
    }
  }
  return best;
}
