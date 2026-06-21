import { describe, expect, it } from 'vitest';
import {
  computeMosaicLabRecipeTotalCount,
  DEFAULT_MOSAIC_LAB_RECIPE_EXPANSION_SEED,
  duplicateMosaicLabRecipe,
  expandMosaicLabRecipe,
  expandStarterMosaicLabRecipe,
  getEligibleFootprintKeys,
  MOSAIC_LAB_CATEGORY_FAMILIES,
  MOSAIC_LAB_CATEGORY_REGISTRY,
  MOSAIC_LAB_EXPANDED_STARTER_RECIPES,
  MOSAIC_LAB_FOOTPRINT_KEYS_BY_CATEGORY_FAMILY,
  MOSAIC_LAB_FOOTPRINT_REGISTRY,
  MOSAIC_LAB_FOOTPRINT_REGISTRY_BY_KEY,
  MOSAIC_LAB_SOURCE_ARCHETYPE_DEFINITIONS,
  MOSAIC_LAB_SOURCE_ARCHETYPE_DEFINITIONS_BY_KEY,
  MOSAIC_LAB_STARTER_RECIPE_DEFINITIONS,
} from '../model/index.js';

const EXPECTED_STARTER_RECIPE_KEYS = [
  'all-landscape',
  'all-portrait',
  'mixed',
  'weird',
] as const;

describe('Mosaic Lab recipe/source model', () => {
  it('defines the required source archetypes separately from placement footprints', () => {
    expect(MOSAIC_LAB_SOURCE_ARCHETYPE_DEFINITIONS.map((definition) => definition.key)).toEqual([
      'source-standard-landscape',
      'source-standard-portrait',
      'source-panorama',
      'source-square',
      'source-wide-nonstandard',
      'source-tall-nonstandard',
    ]);

    expect(MOSAIC_LAB_SOURCE_ARCHETYPE_DEFINITIONS_BY_KEY['source-square']).toMatchObject({
      family: 'nonstandard',
      sourceOrientation: 'square',
      preferredFootprintKey: 'square-rescue',
      compatibleFootprintKeys: [
        'square-rescue',
        'standard-landscape',
        'standard-portrait',
        'large-landscape',
        'large-portrait',
      ],
    });
    expect(MOSAIC_LAB_SOURCE_ARCHETYPE_DEFINITIONS_BY_KEY['source-square'].key).not.toBe(
      MOSAIC_LAB_SOURCE_ARCHETYPE_DEFINITIONS_BY_KEY['source-square'].preferredFootprintKey,
    );
  });

  it('provides stable starter recipes with count-based source maps', () => {
    expect(MOSAIC_LAB_STARTER_RECIPE_DEFINITIONS.map((recipe) => recipe.key)).toEqual(
      EXPECTED_STARTER_RECIPE_KEYS,
    );
    expect(MOSAIC_LAB_STARTER_RECIPE_DEFINITIONS.map((recipe) => recipe.sourceCounts)).toEqual([
      [{ archetypeKey: 'source-standard-landscape', count: 50 }],
      [{ archetypeKey: 'source-standard-portrait', count: 50 }],
      [
        { archetypeKey: 'source-standard-landscape', count: 25 },
        { archetypeKey: 'source-standard-portrait', count: 25 },
      ],
      [
        { archetypeKey: 'source-panorama', count: 8 },
        { archetypeKey: 'source-square', count: 8 },
        { archetypeKey: 'source-wide-nonstandard', count: 8 },
        { archetypeKey: 'source-tall-nonstandard', count: 8 },
        { archetypeKey: 'source-standard-landscape', count: 9 },
        { archetypeKey: 'source-standard-portrait', count: 9 },
      ],
    ]);
    expect(MOSAIC_LAB_STARTER_RECIPE_DEFINITIONS.map(computeMosaicLabRecipeTotalCount)).toEqual([
      50,
      50,
      50,
      50,
    ]);
  });

  it('expands recipes deterministically for the same recipe and seed', () => {
    const first = expandStarterMosaicLabRecipe('mixed', 'mixed-seed-01');
    const second = expandStarterMosaicLabRecipe('mixed', 'mixed-seed-01');
    const changedSeed = expandStarterMosaicLabRecipe('mixed', 'mixed-seed-02');

    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(first.totalCount).toBe(50);
    expect(first.sourceTiles).toHaveLength(50);
    expect(changedSeed.sourceTiles.map((tile) => tile.id)).toEqual(first.sourceTiles.map((tile) => tile.id));
    expect(changedSeed.sourceTiles.map((tile) => tile.sourceArchetypeKey)).not.toEqual(
      first.sourceTiles.map((tile) => tile.sourceArchetypeKey),
    );
  });

  it('keeps the landscape and portrait starter recipes source-pure', () => {
    expect(
      new Set(
        expandStarterMosaicLabRecipe('all-landscape').sourceTiles.map((tile) => tile.sourceArchetypeKey),
      ),
    ).toEqual(new Set(['source-standard-landscape']));
    expect(
      new Set(
        expandStarterMosaicLabRecipe('all-portrait').sourceTiles.map((tile) => tile.sourceArchetypeKey),
      ),
    ).toEqual(new Set(['source-standard-portrait']));
  });

  it('ensures the Weird starter recipe includes nonstandard archetypes', () => {
    const weird = expandStarterMosaicLabRecipe('weird', 'weird-seed-01');

    expect(new Set(weird.sourceTiles.map((tile) => tile.sourceFamily))).toEqual(
      new Set(['standard', 'nonstandard']),
    );
    expect(new Set(weird.sourceTiles.map((tile) => tile.sourceArchetypeKey))).toEqual(
      new Set([
        'source-panorama',
        'source-square',
        'source-wide-nonstandard',
        'source-tall-nonstandard',
        'source-standard-landscape',
        'source-standard-portrait',
      ]),
    );
  });

  it('pre-expands the stable starter recipes with the canonical seed', () => {
    expect(MOSAIC_LAB_EXPANDED_STARTER_RECIPES.map((recipe) => recipe.key)).toEqual(
      EXPECTED_STARTER_RECIPE_KEYS,
    );
    expect(
      MOSAIC_LAB_EXPANDED_STARTER_RECIPES.every(
        (recipe) => recipe.expansionSeed === DEFAULT_MOSAIC_LAB_RECIPE_EXPANSION_SEED,
      ),
    ).toBe(true);
  });

  it('supports user-created recipe duplication without mutating starter definitions', () => {
    const duplicated = duplicateMosaicLabRecipe(MOSAIC_LAB_STARTER_RECIPE_DEFINITIONS[2]!, {
      key: 'mixed-copy-1',
    });
    const expandedDuplicate = expandMosaicLabRecipe({ recipe: duplicated, seed: 'dup-seed' });

    expect(duplicated).toMatchObject({
      key: 'mixed-copy-1',
      name: 'Mixed Copy',
      origin: 'user',
      clonedFromRecipeKey: 'mixed',
    });
    expect(expandedDuplicate).toMatchObject({
      key: 'mixed-copy-1',
      totalCount: 50,
      expansionSeed: 'dup-seed',
    });
  });
});

describe('Mosaic Lab footprint registry', () => {
  it('covers the approved category families with explicit defaults', () => {
    expect(MOSAIC_LAB_CATEGORY_FAMILIES).toEqual([
      'Standard',
      'Scale rescue',
      'Neutral connector',
      'Seam-break rescue',
    ]);
    expect(MOSAIC_LAB_CATEGORY_REGISTRY).toEqual([
      {
        family: 'Standard',
        description: 'Default landscape/portrait footprints that set the baseline mosaic rhythm.',
        enabledByDefault: true,
        defaultMaxTiles: null,
      },
      {
        family: 'Scale rescue',
        description: 'Larger footprints that absorb local mismatch without changing orientation.',
        enabledByDefault: true,
        defaultMaxTiles: null,
      },
      {
        family: 'Neutral connector',
        description: 'Low-attention bridging footprints that help neighboring tiles meet cleanly.',
        enabledByDefault: true,
        defaultMaxTiles: null,
      },
      {
        family: 'Seam-break rescue',
        description: 'Targeted rescue footprints that interrupt long repetitive seam lines.',
        enabledByDefault: true,
        defaultMaxTiles: null,
      },
    ]);
  });

  it('maps the initial footprint set to explicit categories and compatible source orientations', () => {
    expect(MOSAIC_LAB_FOOTPRINT_REGISTRY.map((footprint) => footprint.key)).toEqual([
      'standard-landscape',
      'standard-portrait',
      'large-landscape',
      'large-portrait',
      'square-rescue',
      'wide-landscape-seam-break',
      'tall-portrait-seam-break',
    ]);

    expect(MOSAIC_LAB_FOOTPRINT_KEYS_BY_CATEGORY_FAMILY).toEqual({
      Standard: ['standard-landscape', 'standard-portrait'],
      'Scale rescue': ['large-landscape', 'large-portrait'],
      'Neutral connector': ['square-rescue'],
      'Seam-break rescue': ['wide-landscape-seam-break', 'tall-portrait-seam-break'],
    });

    expect(MOSAIC_LAB_FOOTPRINT_REGISTRY_BY_KEY['square-rescue']).toMatchObject({
      categoryFamily: 'Neutral connector',
      shape: 'square',
      compatibleSourceOrientations: ['landscape', 'portrait', 'square'],
      logicalAspectRatio: 1,
    });
    expect(getEligibleFootprintKeys('landscape')).toEqual([
      'standard-landscape',
      'large-landscape',
      'square-rescue',
      'wide-landscape-seam-break',
    ]);
    expect(getEligibleFootprintKeys('portrait')).toEqual([
      'standard-portrait',
      'large-portrait',
      'square-rescue',
      'tall-portrait-seam-break',
    ]);
    expect(getEligibleFootprintKeys('square')).toEqual(['square-rescue']);
  });
});
