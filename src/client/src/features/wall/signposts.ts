import type { CameraState } from '../../state/camera.js';
import { wrapTravelOffset } from '../../state/camera.js';
import type { GroupedWallFoundation } from './groupedWall.js';

export type SignpostEdge = 'left' | 'right' | 'top' | 'bottom';

export interface VisibleSignpost {
  albumKey: string;
  label: string;
  edge: SignpostEdge;
  arrow: string;
  top?: number;
  left?: number;
  targetX: number;
  targetY: number;
  distance: number;
}

export interface VisibleAlbumTile {
  albumKey: string | null;
  left: number;
  top: number;
  width: number;
  height: number;
}

const EDGE_BAND_PX = 120;
const EDGE_MARGIN_PX = 18;
const OFFSCREEN_CENTER_RATIO = 0.26;

export function detectEdgeIntent(input: {
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
}): SignpostEdge | null {
  const { x, y, viewportWidth, viewportHeight } = input;
  if (viewportWidth <= 0 || viewportHeight <= 0) return null;

  const left = x;
  const right = viewportWidth - x;
  const top = y;
  const bottom = viewportHeight - y;
  const min = Math.min(left, right, top, bottom);
  if (min > EDGE_BAND_PX) return null;

  if (min === left) return 'left';
  if (min === right) return 'right';
  if (min === top) return 'top';
  return 'bottom';
}

export function selectVisibleSignposts(input: {
  foundation: GroupedWallFoundation | null;
  camera: CameraState;
  contentHeight: number;
  suppressedAlbumKeys?: readonly string[];
}): VisibleSignpost[] {
  const { foundation, camera, contentHeight, suppressedAlbumKeys = [] } = input;
  if (!foundation || foundation.mode !== 'grouped') return [];
  if (camera.viewport.width <= 0 || camera.viewport.height <= 0) return [];

  const viewportCenterX = wrapTravelOffset(
    camera.x + camera.viewport.width / 2,
    camera.world.width,
  );
  const verticalPeriod = camera.world.height ?? contentHeight;
  const viewportCenterY = wrapTravelOffset(
    camera.y + camera.viewport.height / 2,
    verticalPeriod,
  );

  const strictBuckets = collectSignposts({
    albums: foundation.albums,
    viewportCenterX,
    viewportCenterY,
    viewportWidth: camera.viewport.width,
    viewportHeight: camera.viewport.height,
    worldWidth: camera.world.width,
    worldHeight: verticalPeriod,
    requireOffscreenBias: true,
    suppressedAlbumKeys,
  });

  const buckets =
    strictBuckets.size > 0
      ? strictBuckets
      : collectSignposts({
          albums: foundation.albums,
          viewportCenterX,
          viewportCenterY,
          viewportWidth: camera.viewport.width,
          viewportHeight: camera.viewport.height,
          worldWidth: camera.world.width,
          worldHeight: verticalPeriod,
          requireOffscreenBias: false,
          suppressedAlbumKeys,
        });

  return ['left', 'right', 'top', 'bottom']
    .map((edge) => buckets.get(edge as SignpostEdge) ?? null)
    .filter((item): item is VisibleSignpost => item !== null);
}

function collectSignposts(input: {
  albums: GroupedWallFoundation['albums'];
  viewportCenterX: number;
  viewportCenterY: number;
  viewportWidth: number;
  viewportHeight: number;
  worldWidth: number;
  worldHeight: number;
  requireOffscreenBias: boolean;
  suppressedAlbumKeys: readonly string[];
}): Map<SignpostEdge, VisibleSignpost> {
  const {
    albums,
    viewportCenterX,
    viewportCenterY,
    viewportWidth,
    viewportHeight,
    worldWidth,
    worldHeight,
    requireOffscreenBias,
    suppressedAlbumKeys,
  } = input;

  const suppressedAlbumKeySet = new Set(suppressedAlbumKeys);

  const buckets = new Map<SignpostEdge, VisibleSignpost>();

  for (const album of albums) {
    if (suppressedAlbumKeySet.has(album.area.albumKey)) continue;

    const dx = wrappedDelta(album.area.anchorX - viewportCenterX, worldWidth);
    const dy = wrappedDelta(album.area.anchorY - viewportCenterY, worldHeight);

    if (
      requireOffscreenBias &&
      Math.abs(dx) <= viewportWidth * OFFSCREEN_CENTER_RATIO &&
      Math.abs(dy) <= viewportHeight * OFFSCREEN_CENTER_RATIO
    ) {
      continue;
    }

    const edge = dominantEdge(dx, dy);
    const signpost = buildSignpost({
      edge,
      dx,
      dy,
      label: album.area.label,
      albumKey: album.area.albumKey,
      targetX: album.area.anchorX,
      targetY: album.area.anchorY,
      viewportWidth,
      viewportHeight,
    });

    const prior = buckets.get(edge);
    if (!prior || signpost.distance < prior.distance) {
      buckets.set(edge, signpost);
    }
  }

  return buckets;
}

function buildSignpost(input: {
  edge: SignpostEdge;
  dx: number;
  dy: number;
  label: string;
  albumKey: string;
  targetX: number;
  targetY: number;
  viewportWidth: number;
  viewportHeight: number;
}): VisibleSignpost {
  const { edge, dx, dy, label, albumKey, targetX, targetY, viewportWidth, viewportHeight } = input;
  const distance = Math.hypot(dx, dy);
  const arrow = arrowForDelta(dx, dy);

  if (edge === 'left' || edge === 'right') {
    const top = clamp(
      viewportHeight / 2 + dy,
      EDGE_MARGIN_PX,
      viewportHeight - EDGE_MARGIN_PX,
    );
    return {
      albumKey,
      label,
      edge,
      arrow,
      top,
      targetX,
      targetY,
      distance,
    };
  }

  const left = clamp(
    viewportWidth / 2 + dx,
    EDGE_MARGIN_PX,
    viewportWidth - EDGE_MARGIN_PX,
  );
  return {
    albumKey,
    label,
    edge,
    arrow,
    left,
    targetX,
    targetY,
    distance,
  };
}

function dominantEdge(dx: number, dy: number): SignpostEdge {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx < 0 ? 'left' : 'right';
  }
  return dy < 0 ? 'top' : 'bottom';
}

function arrowForDelta(dx: number, dy: number): string {
  const horizontal = Math.abs(dx) > 24 ? (dx < 0 ? 'left' : 'right') : null;
  const vertical = Math.abs(dy) > 24 ? (dy < 0 ? 'up' : 'down') : null;
  if (horizontal === 'left' && vertical === 'up') return '↖';
  if (horizontal === 'right' && vertical === 'up') return '↗';
  if (horizontal === 'left' && vertical === 'down') return '↙';
  if (horizontal === 'right' && vertical === 'down') return '↘';
  if (horizontal === 'left') return '←';
  if (horizontal === 'right') return '→';
  if (vertical === 'up') return '↑';
  return '↓';
}

function wrappedDelta(delta: number, period: number | null): number {
  if (!period || period <= 0) return delta;
  const wrapped = ((delta + period / 2) % period + period) % period - period / 2;
  if (wrapped === -period / 2 && delta > 0) {
    return period / 2;
  }
  return wrapped;
}

export function findDominantVisibleAlbumKey(input: {
  tiles: readonly VisibleAlbumTile[];
  viewportWidth: number;
  viewportHeight: number;
  minimumViewportRatio?: number;
}): string | null {
  const {
    tiles,
    viewportWidth,
    viewportHeight,
    minimumViewportRatio = 0.5,
  } = input;
  if (viewportWidth <= 0 || viewportHeight <= 0 || tiles.length === 0) {
    return null;
  }

  const coverageByAlbum = new Map<string, number>();
  for (const tile of tiles) {
    if (!tile.albumKey) continue;
    const clippedWidth = Math.min(tile.left + tile.width, viewportWidth) - Math.max(tile.left, 0);
    const clippedHeight = Math.min(tile.top + tile.height, viewportHeight) - Math.max(tile.top, 0);
    if (clippedWidth <= 0 || clippedHeight <= 0) continue;
    const area = clippedWidth * clippedHeight;
    coverageByAlbum.set(tile.albumKey, (coverageByAlbum.get(tile.albumKey) ?? 0) + area);
  }

  let dominantAlbumKey: string | null = null;
  let dominantArea = 0;

  for (const [albumKey, area] of coverageByAlbum) {
    if (area > dominantArea) {
      dominantArea = area;
      dominantAlbumKey = albumKey;
    }
  }

  const viewportArea = viewportWidth * viewportHeight;
  return viewportArea > 0 && dominantArea / viewportArea > minimumViewportRatio
    ? dominantAlbumKey
    : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
