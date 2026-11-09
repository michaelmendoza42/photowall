import { describe, expect, it } from 'vitest';
import type { PhotoQueryRecord } from '../../../../../shared/api/photos.js';
import { INITIAL_CAMERA, panTo, withViewport, withWorldBounds } from '../../../state/camera.js';
import {
  buildFocusNavigation,
  cameraCenteredOnTile,
  tileNearestViewportCenter,
} from '../focusNavigation.js';
import { buildRadialWallLayout, type RadialWallLayout } from '../radialWall.js';
import { cameraHeldOnCenterPhoto, cameraOnWallCenter } from '../useRadialWallLayout.js';
import { DEFAULT_MOSAIC_COLUMN_FACTORS } from '../worldWidth.js';

function photo(group: number, index: number): PhotoQueryRecord {
  const portrait = (index * 7919 + group * 31) % 3 === 0;
  const [width, height] = portrait ? [4000, 6000] : [6000, 4000];
  return {
    id: `g${group}-${index}`,
    relativePath: `2024/album-${group}/${index}.jpg`,
    directoryPath: `2024/album-${group}`,
    filename: `${index}.jpg`,
    width,
    height,
    aspectRatio: width / height,
    fileSize: 1,
    mtimeMs: 0,
    year: 2024,
    yearSource: 'top-level',
  };
}

function layout(sizes: readonly number[], referenceWidth = 3600, skip?: string): RadialWallLayout {
  return buildRadialWallLayout({
    groups: sizes.map((size, group) => ({
      key: `g${group}`,
      photos: Array.from({ length: size }, (_, index) => photo(group, index)).filter(
        (p) => p.id !== skip,
      ),
    })),
    referenceWidth,
    maxRowHeight: 460,
    columnWidthFactors: DEFAULT_MOSAIC_COLUMN_FACTORS,
  });
}

const ZOOM = 2;

function cameraOn(wall: RadialWallLayout, photoId: string, nudge: { x: number; y: number }) {
  const camera = withWorldBounds(withViewport(INITIAL_CAMERA, { width: 1200, height: 800 }), {
    width: wall.worldWidth,
    height: wall.contentHeight,
  });
  const tile = buildFocusNavigation(wall.rows).tilesById.get(photoId)!;
  const centered = cameraCenteredOnTile(camera, tile, ZOOM);
  return panTo(camera, { x: centered.x + nudge.x, y: centered.y + nudge.y });
}

function centerPhoto(camera: ReturnType<typeof cameraOn>, wall: RadialWallLayout) {
  return tileNearestViewportCenter(camera, buildFocusNavigation(wall.rows).tilesById.values(), ZOOM)
    ?.photoId;
}

describe('cameraHeldOnCenterPhoto', () => {
  it('keeps the middle photo in the middle when the wall lays out again', () => {
    const before = layout([40, 30]);
    // Another photo leaves the wall, so the rest move.
    const after = layout([40, 30], 3600, 'g0-3');
    const camera = cameraOn(before, 'g1-12', { x: 10, y: -6 });
    expect(centerPhoto(camera, before)).toBe('g1-12');

    const held = cameraHeldOnCenterPhoto(camera, before, after, ZOOM);
    expect(centerPhoto(held, after)).toBe('g1-12');
    const target = cameraCenteredOnTile(
      held,
      buildFocusNavigation(after.rows).tilesById.get('g1-12')!,
      ZOOM,
    );
    expect(held.x - target.x).toBeCloseTo(10);
    expect(held.y - target.y).toBeCloseTo(-6);
    expect(held.world).toEqual({ width: after.worldWidth, height: after.contentHeight });
  });

  it('keeps the middle photo across a resize that re-sizes the tiles', () => {
    const before = layout([40, 30], 3600);
    const after = layout([40, 30], 4200);
    const camera = cameraOn(before, 'g0-20', { x: 0, y: 0 });
    expect(centerPhoto(cameraHeldOnCenterPhoto(camera, before, after, ZOOM), after)).toBe('g0-20');
  });

  it('holds on a neighbouring photo, rather than the wall center, when the middle photo left', () => {
    const before = layout([40, 30]);
    const after = layout([40, 30], 3600, 'g1-12');
    const camera = cameraOn(before, 'g1-12', { x: 0, y: 0 });
    const neighbour = tileNearestViewportCenter(
      camera,
      [...buildFocusNavigation(before.rows).tilesById.values()].filter(
        (tile) => tile.photoId !== 'g1-12',
      ),
      ZOOM,
    )!;
    const held = cameraHeldOnCenterPhoto(camera, before, after, ZOOM);
    // The neighbour sits where it did on screen.
    const was = cameraCenteredOnTile(camera, neighbour, ZOOM);
    const now = cameraCenteredOnTile(
      held,
      buildFocusNavigation(after.rows).tilesById.get(neighbour.photoId)!,
      ZOOM,
    );
    expect(held.x - now.x).toBeCloseTo(camera.x - was.x);
    expect(held.y - now.y).toBeCloseTo(camera.y - was.y);
    expect(held).not.toEqual(cameraOnWallCenter(camera, after, ZOOM));
  });
});
