import { describe, expect, it } from 'vitest';
import {
  computeMosaicLabMetrics,
  createPackedTileRect,
  definePackingContract,
  getHorizontalSeamSegments,
  getVerticalSeamSegments,
  measureBlackSpace,
  measureOverlap,
  scaleRectForRender,
} from '../model/index.js';

const FULL_FRAME_CONTRACT = definePackingContract({
  width: 100,
  height: 100,
  gutterPx: 12,
  globalZoom: 1,
});

const FULL_COVER_TILES = [
  createPackedTileRect({
    tileId: 'tile-a',
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    footprintKey: 'standard-landscape',
    categoryFamily: 'Standard',
  }),
  createPackedTileRect({
    tileId: 'tile-b',
    x: 50,
    y: 0,
    width: 50,
    height: 50,
    footprintKey: 'large-landscape',
    categoryFamily: 'Scale rescue',
  }),
  createPackedTileRect({
    tileId: 'tile-c',
    x: 0,
    y: 50,
    width: 50,
    height: 50,
    footprintKey: 'square-rescue',
    categoryFamily: 'Neutral connector',
  }),
  createPackedTileRect({
    tileId: 'tile-d',
    x: 50,
    y: 50,
    width: 50,
    height: 50,
    footprintKey: 'tall-portrait-seam-break',
    categoryFamily: 'Seam-break rescue',
  }),
] as const;

describe('Mosaic Lab geometry contract', () => {
  it('keeps gutter as a render-only join hint and leaves occupancy metrics unchanged', () => {
    const withZeroGutter = definePackingContract({ width: 100, height: 100, gutterPx: 0, globalZoom: 1 });
    const withWideGutter = definePackingContract({ width: 100, height: 100, gutterPx: 18, globalZoom: 1 });

    expect(measureBlackSpace(withZeroGutter, FULL_COVER_TILES)).toEqual(
      measureBlackSpace(withWideGutter, FULL_COVER_TILES),
    );
    expect(measureOverlap(withZeroGutter, FULL_COVER_TILES)).toEqual(
      measureOverlap(withWideGutter, FULL_COVER_TILES),
    );
  });

  it('treats global zoom as render scaling only, not a geometry or metric change', () => {
    const zoomedContract = definePackingContract({ width: 100, height: 100, gutterPx: 12, globalZoom: 2 });

    expect(scaleRectForRender(FULL_COVER_TILES[0], zoomedContract)).toMatchObject({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    expect(computeMosaicLabMetrics(zoomedContract, FULL_COVER_TILES)).toMatchObject({
      blackSpace: {
        passes: true,
        uncoveredArea: 0,
      },
      overlap: {
        passes: true,
        overlapArea: 0,
      },
      seamDiagnostics: {
        fullSpanHorizontalSeamCount: 1,
        fullSpanVerticalSeamCount: 1,
        longestHorizontalSeam: 100,
        longestVerticalSeam: 100,
      },
    });
  });

  it('rejects invalid packing-frame and zoom inputs', () => {
    expect(() => definePackingContract({ width: 0, height: 100 })).toThrow(
      'frame.width must be greater than 0',
    );
    expect(() => definePackingContract({ width: 100, height: 100, gutterPx: -1 })).toThrow(
      'gutterPx must be greater than or equal to 0',
    );
    expect(() => definePackingContract({ width: 100, height: 100, globalZoom: 0 })).toThrow(
      'globalZoom must be greater than 0',
    );
  });
});

describe('Mosaic Lab pure occupancy metrics', () => {
  it('reports category counts and seam lengths for a known-good toy layout', () => {
    expect(computeMosaicLabMetrics(FULL_FRAME_CONTRACT, FULL_COVER_TILES)).toEqual({
      totalTileCount: 4,
      placementCategoryCounts: {
        Standard: 1,
        'Scale rescue': 1,
        'Neutral connector': 1,
        'Seam-break rescue': 1,
      },
      placementCategoryVariety: 4,
      footprintUsage: {
        footprintCounts: {
          'standard-landscape': 1,
          'standard-portrait': 0,
          'large-landscape': 1,
          'large-portrait': 0,
          'square-rescue': 1,
          'wide-landscape-seam-break': 0,
          'tall-portrait-seam-break': 1,
        },
        footprintVariety: 4,
        dominantFootprintKey: 'large-landscape',
        dominantFootprintCount: 1,
        dominantFootprintShare: 0.25,
      },
      blackSpace: {
        passes: true,
        frameArea: 10_000,
        coveredArea: 10_000,
        uncoveredArea: 0,
        uncoveredRects: [],
      },
      overlap: {
        passes: true,
        overlapArea: 0,
        overlapRects: [],
      },
      seamDiagnostics: {
        horizontalSeamCount: 1,
        verticalSeamCount: 1,
        fullSpanHorizontalSeamCount: 1,
        fullSpanVerticalSeamCount: 1,
        longestHorizontalSeam: 100,
        longestVerticalSeam: 100,
      },
    });
  });

  it('detects black space in a known-bad toy layout', () => {
    const layoutWithGap = FULL_COVER_TILES.slice(0, 3);

    expect(measureBlackSpace(FULL_FRAME_CONTRACT, layoutWithGap)).toEqual({
      passes: false,
      frameArea: 10_000,
      coveredArea: 7_500,
      uncoveredArea: 2_500,
      uncoveredRects: [{ x: 50, y: 50, width: 50, height: 50 }],
    });
  });

  it('detects overlap in a known-bad toy layout', () => {
    const overlappingTiles = [
      createPackedTileRect({
        tileId: 'top-left',
        x: 0,
        y: 0,
        width: 60,
        height: 50,
        footprintKey: 'standard-landscape',
        categoryFamily: 'Standard',
      }),
      createPackedTileRect({
        tileId: 'top-right',
        x: 40,
        y: 0,
        width: 60,
        height: 50,
        footprintKey: 'large-landscape',
        categoryFamily: 'Scale rescue',
      }),
      createPackedTileRect({
        tileId: 'bottom',
        x: 0,
        y: 50,
        width: 100,
        height: 50,
        footprintKey: 'square-rescue',
        categoryFamily: 'Neutral connector',
      }),
    ] as const;

    expect(measureOverlap(FULL_FRAME_CONTRACT, overlappingTiles)).toEqual({
      passes: false,
      overlapArea: 1_000,
      overlapRects: [
        {
          x: 40,
          y: 0,
          width: 20,
          height: 50,
          tileIds: ['top-left', 'top-right'],
        },
      ],
    });
    expect(measureBlackSpace(FULL_FRAME_CONTRACT, overlappingTiles)).toMatchObject({
      passes: true,
      uncoveredArea: 0,
    });
  });

  it('merges contiguous seam fragments into stable longest horizontal and vertical seams', () => {
    const seamProbeTiles = [
      createPackedTileRect({
        tileId: 'left-top',
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        footprintKey: 'standard-landscape',
        categoryFamily: 'Standard',
      }),
      createPackedTileRect({
        tileId: 'left-bottom',
        x: 0,
        y: 50,
        width: 50,
        height: 50,
        footprintKey: 'standard-portrait',
        categoryFamily: 'Standard',
      }),
      createPackedTileRect({
        tileId: 'right-full',
        x: 50,
        y: 0,
        width: 50,
        height: 100,
        footprintKey: 'wide-landscape-seam-break',
        categoryFamily: 'Seam-break rescue',
      }),
    ] as const;

    expect(getVerticalSeamSegments(seamProbeTiles)).toEqual([
      {
        position: 50,
        start: 0,
        end: 100,
        length: 100,
        tileIds: ['left-bottom', 'left-top', 'right-full'],
      },
    ]);
    expect(getHorizontalSeamSegments(seamProbeTiles)).toEqual([
      {
        position: 50,
        start: 0,
        end: 50,
        length: 50,
        tileIds: ['left-bottom', 'left-top'],
      },
    ]);
  });
});
