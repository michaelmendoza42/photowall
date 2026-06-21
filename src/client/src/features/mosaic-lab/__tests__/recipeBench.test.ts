import { describe, expect, it } from 'vitest';
import {
  computeMosaicLabRecipeTotalCount,
  createEditableMosaicLabBenchRecipe,
  createInitialMosaicLabRecipeBenchState,
  deleteMosaicLabBenchRecipe,
  duplicateSelectedMosaicLabBenchRecipe,
  getMosaicLabBenchRecipe,
  getMosaicLabBenchRecipeSourceCount,
  listMosaicLabBenchRecipes,
  MOSAIC_LAB_SOURCE_ARCHETYPE_DEFINITIONS,
  selectMosaicLabBenchRecipe,
  updateMosaicLabBenchRecipeName,
  updateMosaicLabBenchRecipeSourceCount,
} from '../model/index.js';

describe('Mosaic Lab recipe bench state', () => {
  it('starts with starter recipes plus a selected editable mixed draft', () => {
    const state = createInitialMosaicLabRecipeBenchState();
    const selectedRecipe = getMosaicLabBenchRecipe(state, state.selectedRecipeKey);

    expect(listMosaicLabBenchRecipes(state).map((recipe) => recipe.key)).toEqual([
      'all-landscape',
      'all-portrait',
      'mixed',
      'weird',
      'user-recipe-1',
    ]);
    expect(selectedRecipe).toMatchObject({
      key: 'user-recipe-1',
      name: 'Mixed Draft',
      origin: 'user',
      clonedFromRecipeKey: 'mixed',
    });
  });

  it('creates editable recipes from the selected starter, duplicates them, and keeps starter recipes immutable', () => {
    const initialState = createInitialMosaicLabRecipeBenchState();
    const portraitSelectedState = selectMosaicLabBenchRecipe(initialState, 'all-portrait');
    const createdState = createEditableMosaicLabBenchRecipe(portraitSelectedState);
    const createdRecipe = getMosaicLabBenchRecipe(createdState, createdState.selectedRecipeKey);
    const duplicatedState = duplicateSelectedMosaicLabBenchRecipe(createdState);
    const duplicatedRecipe = getMosaicLabBenchRecipe(duplicatedState, duplicatedState.selectedRecipeKey);
    const starterPortraitRecipe = getMosaicLabBenchRecipe(duplicatedState, 'all-portrait');

    expect(createdRecipe).toMatchObject({
      key: 'user-recipe-2',
      name: 'Recipe 2',
      origin: 'user',
    });
    expect(createdRecipe?.clonedFromRecipeKey).toBeUndefined();
    expect(
      MOSAIC_LAB_SOURCE_ARCHETYPE_DEFINITIONS.map((definition) => ({
        archetypeKey: definition.key,
        createdCount: createdRecipe
          ? getMosaicLabBenchRecipeSourceCount(createdRecipe, definition.key)
          : undefined,
        starterCount: starterPortraitRecipe
          ? getMosaicLabBenchRecipeSourceCount(starterPortraitRecipe, definition.key)
          : undefined,
      })),
    ).toEqual([
      {
        archetypeKey: 'source-standard-landscape',
        createdCount: 0,
        starterCount: 0,
      },
      {
        archetypeKey: 'source-standard-portrait',
        createdCount: 50,
        starterCount: 50,
      },
      {
        archetypeKey: 'source-panorama',
        createdCount: 0,
        starterCount: 0,
      },
      {
        archetypeKey: 'source-square',
        createdCount: 0,
        starterCount: 0,
      },
      {
        archetypeKey: 'source-wide-nonstandard',
        createdCount: 0,
        starterCount: 0,
      },
      {
        archetypeKey: 'source-tall-nonstandard',
        createdCount: 0,
        starterCount: 0,
      },
    ]);

    expect(duplicatedRecipe).toMatchObject({
      key: 'user-recipe-3',
      name: 'Recipe 2 Copy',
      origin: 'user',
      clonedFromRecipeKey: 'user-recipe-2',
    });

    expect(starterPortraitRecipe).toMatchObject({
      key: 'all-portrait',
      name: 'All Portrait',
      origin: 'starter',
    });
  });

  it('updates editable recipe names and source archetype counts, then falls back to a starter when deleted', () => {
    const initialState = createInitialMosaicLabRecipeBenchState();
    const renamedState = updateMosaicLabBenchRecipeName(initialState, {
      recipeKey: 'user-recipe-1',
      name: 'Comparison A',
    });
    const updatedState = updateMosaicLabBenchRecipeSourceCount(renamedState, {
      recipeKey: 'user-recipe-1',
      archetypeKey: 'source-standard-landscape',
      count: 12,
    });
    const updatedRecipe = getMosaicLabBenchRecipe(updatedState, 'user-recipe-1');
    const deletedState = deleteMosaicLabBenchRecipe(updatedState, 'user-recipe-1');

    expect(updatedRecipe).toMatchObject({
      key: 'user-recipe-1',
      name: 'Comparison A',
      origin: 'user',
    });
    expect(getMosaicLabBenchRecipeSourceCount(updatedRecipe!, 'source-standard-landscape')).toBe(12);
    expect(getMosaicLabBenchRecipeSourceCount(updatedRecipe!, 'source-standard-portrait')).toBe(25);
    expect(computeMosaicLabRecipeTotalCount(updatedRecipe!)).toBe(37);

    expect(deletedState.selectedRecipeKey).toBe('mixed');
    expect(getMosaicLabBenchRecipe(deletedState, 'user-recipe-1')).toBeUndefined();
  });
});
