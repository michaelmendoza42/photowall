import { describe, expect, it } from 'vitest';
import type { CameraState } from '../../../state/camera.js';
import {
  detectEdgeIntent,
  findDominantVisibleAlbumKey,
  selectVisibleSignposts,
} from '../signposts.js';
import type { GroupedWallFoundation } from '../groupedWall.js';

const CAMERA: CameraState = {
  x: 0,
  y: 0,
  viewport: { width: 1200, height: 800 },
  world: { width: 2400, height: 1600 },
};

const FOUNDATION: GroupedWallFoundation = {
  mode: 'grouped',
  viewKey: 'view',
  estimatedWorldHeight: 1600,
  albums: [
    {
      area: {
        albumKey: 'left',
        kind: 'folder',
        label: 'Left',
        sourcePath: '2024/left',
        year: 2024,
        photoCountEstimate: 3,
        anchorX: 120,
        anchorY: 400,
        footprintWidth: 320,
        footprintHeight: 260,
        shuffleSeed: 'a',
        placementSeed: 'a',
      },
      photos: [],
    },
    {
      area: {
        albumKey: 'right',
        kind: 'folder',
        label: 'Right',
        sourcePath: '2024/right',
        year: 2024,
        photoCountEstimate: 3,
        anchorX: 1800,
        anchorY: 400,
        footprintWidth: 320,
        footprintHeight: 260,
        shuffleSeed: 'b',
        placementSeed: 'b',
      },
      photos: [],
    },
    {
      area: {
        albumKey: 'bottom',
        kind: 'folder',
        label: 'Bottom',
        sourcePath: '2024/bottom',
        year: 2024,
        photoCountEstimate: 3,
        anchorX: 600,
        anchorY: 1300,
        footprintWidth: 320,
        footprintHeight: 260,
        shuffleSeed: 'c',
        placementSeed: 'c',
      },
      photos: [],
    },
  ],
};

describe('detectEdgeIntent', () => {
  it('returns null in the center dead zone', () => {
    expect(detectEdgeIntent({ x: 600, y: 400, viewportWidth: 1200, viewportHeight: 800 })).toBeNull();
  });

  it('detects the nearest edge band', () => {
    expect(detectEdgeIntent({ x: 30, y: 400, viewportWidth: 1200, viewportHeight: 800 })).toBe('left');
    expect(detectEdgeIntent({ x: 1180, y: 400, viewportWidth: 1200, viewportHeight: 800 })).toBe('right');
  });
});

describe('selectVisibleSignposts', () => {
  it('returns a bounded signpost set for grouped views', () => {
    const signposts = selectVisibleSignposts({
      foundation: FOUNDATION,
      camera: CAMERA,
      contentHeight: 1600,
    });

    expect(signposts.length).toBeLessThanOrEqual(4);
    expect(signposts.map((item) => item.albumKey)).toContain('right');
    expect(signposts.map((item) => item.albumKey)).toContain('bottom');
  });

  it('falls back to nearby grouped areas when strict offscreen filtering would hide everything', () => {
    const nearCenter = {
      ...FOUNDATION,
      albums: [
        {
          ...FOUNDATION.albums[0]!,
          area: { ...FOUNDATION.albums[0]!.area, anchorX: 700, anchorY: 430 },
        },
        {
          ...FOUNDATION.albums[1]!,
          area: { ...FOUNDATION.albums[1]!.area, anchorX: 980, anchorY: 420 },
        },
      ],
    };

    const signposts = selectVisibleSignposts({
      foundation: nearCenter,
      camera: CAMERA,
      contentHeight: 1600,
    });

    expect(signposts.length).toBeGreaterThan(0);
  });

  it('suppresses the signpost for the album that already dominates the current view', () => {
    const signposts = selectVisibleSignposts({
      foundation: FOUNDATION,
      camera: CAMERA,
      contentHeight: 1600,
      suppressedAlbumKeys: ['right'],
    });

    expect(signposts.map((item) => item.albumKey)).not.toContain('right');
  });

  it('returns no signposts for single mode', () => {
    expect(
      selectVisibleSignposts({
        foundation: { ...FOUNDATION, mode: 'single', albums: [] },
        camera: CAMERA,
        contentHeight: 1600,
      }),
    ).toEqual([]);
  });
});

describe('findDominantVisibleAlbumKey', () => {
  it('returns the album covering a majority of the viewport', () => {
    expect(
      findDominantVisibleAlbumKey({
        tiles: [
          { albumKey: 'right', left: 0, top: 0, width: 800, height: 800 },
          { albumKey: 'left', left: 800, top: 0, width: 400, height: 800 },
        ],
        viewportWidth: 1200,
        viewportHeight: 800,
      }),
    ).toBe('right');
  });

  it('returns null when no album covers a majority of the viewport', () => {
    expect(
      findDominantVisibleAlbumKey({
        tiles: [
          { albumKey: 'right', left: 0, top: 0, width: 500, height: 800 },
          { albumKey: 'left', left: 500, top: 0, width: 500, height: 800 },
        ],
        viewportWidth: 1200,
        viewportHeight: 800,
      }),
    ).toBeNull();
  });
});
