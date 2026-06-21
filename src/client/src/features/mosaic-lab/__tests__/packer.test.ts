import { describe, expect, it } from 'vitest';
import {
  computeMosaicLabMetrics,
  definePackingContract,
  expandStarterMosaicLabRecipe,
  packMosaicLabRecipe,
} from '../model/index.js';

function expectPacked(result: ReturnType<typeof packMosaicLabRecipe>) {
  expect(result.status).toBe('packed');
  if (result.status !== 'packed') {
    throw new Error(result.failureReason);
  }
  return result;
}

function summarizeRepresentativeLayout(result: ReturnType<typeof expectPacked>) {
  const footprintCounts = Object.fromEntries(
    Object.entries(result.metrics.footprintUsage.footprintCounts)
      .filter((entry) => entry[1] > 0)
      .sort((left, right) => left[0].localeCompare(right[0])),
  );

  return {
    totalTileCount: result.packedTiles.length,
    footprintCounts,
    placementCategoryCounts: result.metrics.placementCategoryCounts,
    footprintVariety: result.metrics.footprintUsage.footprintVariety,
    dominantFootprintShare: result.metrics.footprintUsage.dominantFootprintShare,
    longestHorizontalSeam: result.metrics.seamDiagnostics.longestHorizontalSeam,
    longestVerticalSeam: result.metrics.seamDiagnostics.longestVerticalSeam,
    fullSpanHorizontalSeams: result.metrics.seamDiagnostics.fullSpanHorizontalSeamCount,
    fullSpanVerticalSeams: result.metrics.seamDiagnostics.fullSpanVerticalSeamCount,
  };
}

describe('Mosaic Lab packer', () => {
  it('is deterministic for the same expanded recipe, seed, and settings', () => {
    const contract = definePackingContract({ width: 160, height: 120, gutterPx: 10, globalZoom: 1 });
    const settings = { cellSize: 10, maxTileCount: 16 };
    const recipe = expandStarterMosaicLabRecipe('all-landscape', 'source-seed-landscape');

    const first = expectPacked(
      packMosaicLabRecipe({ recipe, seed: 'deterministic-landscape', contract, settings }),
    );
    const second = expectPacked(
      packMosaicLabRecipe({ recipe, seed: 'deterministic-landscape', contract, settings }),
    );

    expect(second).toEqual(first);
  });

  it('uses scored search to break representative all-landscape and all-portrait grid collapse while preserving exact fill', () => {
    const landscape = expectPacked(
      packMosaicLabRecipe({
        recipe: expandStarterMosaicLabRecipe('all-landscape', 'source-seed-landscape'),
        seed: 'landscape-grid',
        contract: definePackingContract({ width: 160, height: 120, gutterPx: 12, globalZoom: 1 }),
        settings: { cellSize: 10, maxTileCount: 16 },
      }),
    );
    const portrait = expectPacked(
      packMosaicLabRecipe({
        recipe: expandStarterMosaicLabRecipe('all-portrait', 'source-seed-portrait'),
        seed: 'portrait-grid',
        contract: definePackingContract({ width: 120, height: 160, gutterPx: 12, globalZoom: 1 }),
        settings: { cellSize: 10, maxTileCount: 12 },
      }),
    );

    expect(landscape.metrics.blackSpace).toMatchObject({ passes: true, uncoveredArea: 0 });
    expect(landscape.metrics.overlap).toMatchObject({ passes: true, overlapArea: 0 });
    expect(summarizeRepresentativeLayout(landscape)).toEqual({
      totalTileCount: 10,
      footprintCounts: {
        'large-landscape': 2,
        'square-rescue': 4,
        'standard-landscape': 4,
      },
      placementCategoryCounts: {
        Standard: 4,
        'Scale rescue': 2,
        'Neutral connector': 4,
        'Seam-break rescue': 0,
      },
      footprintVariety: 3,
      dominantFootprintShare: 0.4,
      longestHorizontalSeam: 80,
      longestVerticalSeam: 120,
      fullSpanHorizontalSeams: 0,
      fullSpanVerticalSeams: 1,
    });
    expect(
      new Set(landscape.packedTiles.map((tile) => tile.sourceTile.sourceArchetypeKey)),
    ).toEqual(new Set(['source-standard-landscape']));

    expect(portrait.metrics.blackSpace).toMatchObject({ passes: true, uncoveredArea: 0 });
    expect(portrait.metrics.overlap).toMatchObject({ passes: true, overlapArea: 0 });
    expect(summarizeRepresentativeLayout(portrait)).toEqual({
      totalTileCount: 10,
      footprintCounts: {
        'large-portrait': 2,
        'square-rescue': 4,
        'standard-portrait': 4,
      },
      placementCategoryCounts: {
        Standard: 4,
        'Scale rescue': 2,
        'Neutral connector': 4,
        'Seam-break rescue': 0,
      },
      footprintVariety: 3,
      dominantFootprintShare: 0.4,
      longestHorizontalSeam: 120,
      longestVerticalSeam: 80,
      fullSpanHorizontalSeams: 1,
      fullSpanVerticalSeams: 0,
    });
    expect(
      new Set(portrait.packedTiles.map((tile) => tile.sourceTile.sourceArchetypeKey)),
    ).toEqual(new Set(['source-standard-portrait']));

    expect(computeMosaicLabMetrics(landscape.contract, landscape.packedTiles)).toEqual(landscape.metrics);
    expect(computeMosaicLabMetrics(portrait.contract, portrait.packedTiles)).toEqual(portrait.metrics);
  });

  it('keeps chosen footprint and source-archetype metadata attached to packed output for rescue footprints', () => {
    const scaleRescue = expectPacked(
      packMosaicLabRecipe({
        recipe: expandStarterMosaicLabRecipe('all-landscape', 'source-seed-scale-rescue'),
        seed: 'scale-rescue',
        contract: definePackingContract({ width: 80, height: 50, gutterPx: 0, globalZoom: 1 }),
        settings: { cellSize: 10, maxTileCount: 1 },
      }),
    );
    const neutralConnector = expectPacked(
      packMosaicLabRecipe({
        recipe: expandStarterMosaicLabRecipe('weird', 'source-seed-neutral-connector'),
        seed: 'neutral-connector',
        contract: definePackingContract({ width: 40, height: 40, gutterPx: 0, globalZoom: 1 }),
        settings: { cellSize: 10, maxTileCount: 1 },
      }),
    );
    const seamBreak = expectPacked(
      packMosaicLabRecipe({
        recipe: expandStarterMosaicLabRecipe('weird', 'source-seed-seam-break'),
        seed: 'seam-break',
        contract: definePackingContract({ width: 160, height: 90, gutterPx: 0, globalZoom: 1 }),
        settings: { cellSize: 10, maxTileCount: 1 },
      }),
    );

    expect(scaleRescue.packedTiles[0]).toMatchObject({
      footprintKey: 'large-landscape',
      categoryFamily: 'Scale rescue',
      footprint: {
        key: 'large-landscape',
        categoryFamily: 'Scale rescue',
      },
      sourceTile: {
        sourceArchetypeKey: 'source-standard-landscape',
      },
    });
    expect(neutralConnector.packedTiles[0]).toMatchObject({
      footprintKey: 'square-rescue',
      categoryFamily: 'Neutral connector',
      footprint: {
        key: 'square-rescue',
        categoryFamily: 'Neutral connector',
      },
    });
    expect(seamBreak.packedTiles[0]).toMatchObject({
      footprintKey: 'wide-landscape-seam-break',
      categoryFamily: 'Seam-break rescue',
      footprint: {
        key: 'wide-landscape-seam-break',
        categoryFamily: 'Seam-break rescue',
      },
    });

    for (const result of [scaleRescue, neutralConnector, seamBreak]) {
      expect(result.metrics.blackSpace).toMatchObject({ passes: true, uncoveredArea: 0 });
      expect(result.metrics.overlap).toMatchObject({ passes: true, overlapArea: 0 });
      expect(result.packedTiles[0]?.sourceTile).toBeDefined();
    }
  });
});
