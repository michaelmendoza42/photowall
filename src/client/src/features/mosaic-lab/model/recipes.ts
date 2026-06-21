import { hashStringToUint32, stableUnitInterval } from '../../wall/seeded.js';
import {
  type MosaicLabCategoryFamily,
  type MosaicLabExpandedRecipeRecord,
  type MosaicLabRecipeDefinition,
  type MosaicLabRecipeKey,
  type MosaicLabRecipeSourceCount,
  type MosaicLabSourceArchetypeDefinition,
  type MosaicLabSourceArchetypeKey,
  type MosaicLabStarterRecipeKey,
  type MosaicLabSyntheticSourceTileRecord,
} from './types.js';
import { MOSAIC_LAB_FOOTPRINT_REGISTRY_BY_KEY } from './registry.js';

export const DEFAULT_MOSAIC_LAB_RECIPE_EXPANSION_SEED = 'mosaic-lab-recipe-v1';

export const MOSAIC_LAB_SOURCE_ARCHETYPE_DEFINITIONS = [
  {
    key: 'source-standard-landscape',
    name: 'Standard landscape',
    family: 'standard',
    sourceOrientation: 'landscape',
    nominalAspectRatio: 4 / 3,
    aspectRatioRange: { min: 1.25, max: 1.45 },
    preferredFootprintKey: 'standard-landscape',
    compatibleFootprintKeys: [
      'standard-landscape',
      'large-landscape',
      'square-rescue',
      'wide-landscape-seam-break',
    ],
  },
  {
    key: 'source-standard-portrait',
    name: 'Standard portrait',
    family: 'standard',
    sourceOrientation: 'portrait',
    nominalAspectRatio: 3 / 4,
    aspectRatioRange: { min: 0.68, max: 0.82 },
    preferredFootprintKey: 'standard-portrait',
    compatibleFootprintKeys: [
      'standard-portrait',
      'large-portrait',
      'square-rescue',
      'tall-portrait-seam-break',
    ],
  },
  {
    key: 'source-panorama',
    name: 'Panorama',
    family: 'nonstandard',
    sourceOrientation: 'landscape',
    nominalAspectRatio: 16 / 9,
    aspectRatioRange: { min: 1.9, max: 2.6 },
    preferredFootprintKey: 'wide-landscape-seam-break',
    compatibleFootprintKeys: [
      'wide-landscape-seam-break',
      'large-landscape',
      'standard-landscape',
      'square-rescue',
    ],
  },
  {
    key: 'source-square',
    name: 'Square',
    family: 'nonstandard',
    sourceOrientation: 'square',
    nominalAspectRatio: 1,
    preferredFootprintKey: 'square-rescue',
    compatibleFootprintKeys: [
      'square-rescue',
      'standard-landscape',
      'standard-portrait',
      'large-landscape',
      'large-portrait',
    ],
  },
  {
    key: 'source-wide-nonstandard',
    name: 'Wide nonstandard',
    family: 'nonstandard',
    sourceOrientation: 'landscape',
    nominalAspectRatio: 2,
    aspectRatioRange: { min: 1.6, max: 2.2 },
    preferredFootprintKey: 'wide-landscape-seam-break',
    compatibleFootprintKeys: [
      'wide-landscape-seam-break',
      'large-landscape',
      'standard-landscape',
      'square-rescue',
    ],
  },
  {
    key: 'source-tall-nonstandard',
    name: 'Tall nonstandard',
    family: 'nonstandard',
    sourceOrientation: 'portrait',
    nominalAspectRatio: 1 / 2,
    aspectRatioRange: { min: 0.42, max: 0.62 },
    preferredFootprintKey: 'tall-portrait-seam-break',
    compatibleFootprintKeys: [
      'tall-portrait-seam-break',
      'large-portrait',
      'standard-portrait',
      'square-rescue',
    ],
  },
] as const satisfies readonly MosaicLabSourceArchetypeDefinition[];

export const MOSAIC_LAB_SOURCE_ARCHETYPE_DEFINITIONS_BY_KEY = Object.freeze(
  Object.fromEntries(
    MOSAIC_LAB_SOURCE_ARCHETYPE_DEFINITIONS.map((definition) => [definition.key, definition]),
  ) as Record<MosaicLabSourceArchetypeKey, (typeof MOSAIC_LAB_SOURCE_ARCHETYPE_DEFINITIONS)[number]>,
);

export const MOSAIC_LAB_STARTER_RECIPE_DEFINITIONS = [
  {
    key: 'all-landscape',
    name: 'All Landscape',
    origin: 'starter',
    sourceCounts: [{ archetypeKey: 'source-standard-landscape', count: 50 }],
  },
  {
    key: 'all-portrait',
    name: 'All Portrait',
    origin: 'starter',
    sourceCounts: [{ archetypeKey: 'source-standard-portrait', count: 50 }],
  },
  {
    key: 'mixed',
    name: 'Mixed',
    origin: 'starter',
    sourceCounts: [
      { archetypeKey: 'source-standard-landscape', count: 25 },
      { archetypeKey: 'source-standard-portrait', count: 25 },
    ],
  },
  {
    key: 'weird',
    name: 'Weird',
    origin: 'starter',
    sourceCounts: [
      { archetypeKey: 'source-panorama', count: 8 },
      { archetypeKey: 'source-square', count: 8 },
      { archetypeKey: 'source-wide-nonstandard', count: 8 },
      { archetypeKey: 'source-tall-nonstandard', count: 8 },
      { archetypeKey: 'source-standard-landscape', count: 9 },
      { archetypeKey: 'source-standard-portrait', count: 9 },
    ],
  },
] as const satisfies readonly (MosaicLabRecipeDefinition & { key: MosaicLabStarterRecipeKey; origin: 'starter' })[];

export const MOSAIC_LAB_STARTER_RECIPE_DEFINITIONS_BY_KEY = Object.freeze(
  Object.fromEntries(
    MOSAIC_LAB_STARTER_RECIPE_DEFINITIONS.map((definition) => [definition.key, definition]),
  ) as Record<MosaicLabStarterRecipeKey, (typeof MOSAIC_LAB_STARTER_RECIPE_DEFINITIONS)[number]>,
);

function padIndex(index: number, digits: number): string {
  return String(index + 1).padStart(digits, '0');
}

function roundAspectRatio(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function assertRecipeSourceCounts(sourceCounts: readonly MosaicLabRecipeSourceCount[]): void {
  if (sourceCounts.length === 0) {
    throw new Error('recipe must include at least one source count');
  }

  for (const sourceCount of sourceCounts) {
    if (!Number.isInteger(sourceCount.count) || sourceCount.count < 0) {
      throw new Error(`recipe source count for ${sourceCount.archetypeKey} must be a non-negative integer`);
    }
  }
}

function createDeterministicColor(recipeKey: MosaicLabRecipeKey, seed: string, id: string): string {
  const hue = Math.round(stableUnitInterval(`mosaic-lab:${recipeKey}:${seed}:color`, id) * 359);
  const saturation = 50 + Math.round(stableUnitInterval(`mosaic-lab:${recipeKey}:${seed}:saturation`, id) * 14);
  const lightness = 42 + Math.round(stableUnitInterval(`mosaic-lab:${recipeKey}:${seed}:lightness`, id) * 16);
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function computeSourceAspectRatio(
  definition: MosaicLabSourceArchetypeDefinition,
  recipeKey: MosaicLabRecipeKey,
  seed: string,
  sourceOccurrence: number,
): number {
  if (!definition.aspectRatioRange) {
    return definition.nominalAspectRatio;
  }

  const unit = stableUnitInterval(
    `mosaic-lab:${recipeKey}:${seed}:aspect-ratio`,
    `${definition.key}:${sourceOccurrence}`,
  );

  return roundAspectRatio(
    definition.aspectRatioRange.min + (definition.aspectRatioRange.max - definition.aspectRatioRange.min) * unit,
  );
}

function uniqueCategoryFamilies(
  footprintKeys: readonly MosaicLabSourceArchetypeDefinition['compatibleFootprintKeys'][number][],
): readonly MosaicLabCategoryFamily[] {
  return [
    ...new Set(footprintKeys.map((key) => MOSAIC_LAB_FOOTPRINT_REGISTRY_BY_KEY[key].categoryFamily)),
  ];
}

export function computeMosaicLabRecipeTotalCount(recipe: MosaicLabRecipeDefinition): number {
  return recipe.sourceCounts.reduce((total, sourceCount) => total + sourceCount.count, 0);
}

export function createMosaicLabRecipe(input: {
  key: MosaicLabRecipeKey;
  name: string;
  sourceCounts: readonly MosaicLabRecipeSourceCount[];
  clonedFromRecipeKey?: MosaicLabRecipeKey;
}): MosaicLabRecipeDefinition {
  assertRecipeSourceCounts(input.sourceCounts);

  return Object.freeze({
    key: input.key,
    name: input.name,
    origin: 'user',
    sourceCounts: input.sourceCounts.map((sourceCount) => Object.freeze({ ...sourceCount })),
    clonedFromRecipeKey: input.clonedFromRecipeKey,
  });
}

export function duplicateMosaicLabRecipe(
  recipe: MosaicLabRecipeDefinition,
  input: {
    key: MosaicLabRecipeKey;
    name?: string;
  },
): MosaicLabRecipeDefinition {
  return createMosaicLabRecipe({
    key: input.key,
    name: input.name ?? `${recipe.name} Copy`,
    sourceCounts: recipe.sourceCounts,
    clonedFromRecipeKey: recipe.key,
  });
}

export function expandMosaicLabRecipe(input: {
  recipe: MosaicLabRecipeDefinition;
  seed?: string;
}): MosaicLabExpandedRecipeRecord {
  const recipe = input.recipe;
  const seed = input.seed ?? DEFAULT_MOSAIC_LAB_RECIPE_EXPANSION_SEED;
  assertRecipeSourceCounts(recipe.sourceCounts);

  const orderedDrafts = recipe.sourceCounts.flatMap((sourceCount, recipeSourceIndex) => {
    const definition = MOSAIC_LAB_SOURCE_ARCHETYPE_DEFINITIONS_BY_KEY[sourceCount.archetypeKey];
    return Array.from({ length: sourceCount.count }, (_, sourceOccurrence) => ({
      recipeSourceIndex,
      sourceOccurrence,
      definition,
      rank: hashStringToUint32(
        `mosaic-lab:${recipe.key}:${seed}:${sourceCount.archetypeKey}:${sourceOccurrence}`,
      ),
    }));
  });

  const sourceTiles = orderedDrafts
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }
      if (left.recipeSourceIndex !== right.recipeSourceIndex) {
        return left.recipeSourceIndex - right.recipeSourceIndex;
      }
      return left.sourceOccurrence - right.sourceOccurrence;
    })
    .map((draft, sourceIndex) => {
      const id = `${recipe.key}-source-${padIndex(sourceIndex, 3)}`;
      const label = `${recipe.name} ${padIndex(sourceIndex, 2)}`;
      const logicalAspectRatio = computeSourceAspectRatio(
        draft.definition,
        recipe.key,
        seed,
        draft.sourceOccurrence,
      );
      const eligibleFootprintKeys = Object.freeze([...draft.definition.compatibleFootprintKeys]);

      return Object.freeze({
        id,
        label,
        recipeKey: recipe.key,
        sourceArchetypeKey: draft.definition.key,
        sourceFamily: draft.definition.family,
        sourceOrientation: draft.definition.sourceOrientation,
        logicalAspectRatio,
        color: createDeterministicColor(recipe.key, seed, id),
        preferredFootprintKey: draft.definition.preferredFootprintKey,
        eligibleFootprintKeys,
        eligibleCategoryFamilies: uniqueCategoryFamilies(eligibleFootprintKeys),
        sourceOccurrence: draft.sourceOccurrence,
      }) as MosaicLabSyntheticSourceTileRecord;
    });

  return Object.freeze({
    ...recipe,
    sourceCounts: recipe.sourceCounts.map((sourceCount) => Object.freeze({ ...sourceCount })),
    totalCount: computeMosaicLabRecipeTotalCount(recipe),
    expansionSeed: seed,
    sourceTiles,
  });
}

export function expandStarterMosaicLabRecipe(
  recipeKey: MosaicLabStarterRecipeKey,
  seed?: string,
): MosaicLabExpandedRecipeRecord {
  return expandMosaicLabRecipe({
    recipe: MOSAIC_LAB_STARTER_RECIPE_DEFINITIONS_BY_KEY[recipeKey],
    seed,
  });
}

export const MOSAIC_LAB_EXPANDED_STARTER_RECIPES = MOSAIC_LAB_STARTER_RECIPE_DEFINITIONS.map(
  (recipe) => expandMosaicLabRecipe({ recipe }),
) as readonly MosaicLabExpandedRecipeRecord[];

export const MOSAIC_LAB_EXPANDED_STARTER_RECIPES_BY_KEY = Object.freeze(
  Object.fromEntries(
    MOSAIC_LAB_EXPANDED_STARTER_RECIPES.map((recipe) => [recipe.key, recipe]),
  ) as Record<MosaicLabStarterRecipeKey, MosaicLabExpandedRecipeRecord>,
);

export function getExpandedStarterMosaicLabRecipe(
  recipeKey: MosaicLabStarterRecipeKey,
): MosaicLabExpandedRecipeRecord {
  return MOSAIC_LAB_EXPANDED_STARTER_RECIPES_BY_KEY[recipeKey];
}
