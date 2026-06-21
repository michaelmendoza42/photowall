import {
  createMosaicLabRecipe,
  duplicateMosaicLabRecipe,
  MOSAIC_LAB_SOURCE_ARCHETYPE_DEFINITIONS,
  MOSAIC_LAB_STARTER_RECIPE_DEFINITIONS,
} from './recipes.js';
import type {
  MosaicLabRecipeDefinition,
  MosaicLabRecipeKey,
  MosaicLabSourceArchetypeKey,
} from './types.js';

const DEFAULT_MOSAIC_LAB_BENCH_STARTER_KEY = 'mixed';
const INITIAL_MOSAIC_LAB_DRAFT_KEY = 'user-recipe-1';
const INITIAL_MOSAIC_LAB_DRAFT_NAME = 'Mixed Draft';

export interface MosaicLabRecipeBenchState {
  selectedRecipeKey: MosaicLabRecipeKey;
  userRecipes: readonly MosaicLabRecipeDefinition[];
  nextUserRecipeNumber: number;
}

function createUserRecipeKey(recipeNumber: number): MosaicLabRecipeKey {
  return `user-recipe-${recipeNumber}`;
}

function createUserRecipeName(recipeNumber: number): string {
  return `Recipe ${recipeNumber}`;
}

function readSourceCount(
  recipe: MosaicLabRecipeDefinition,
  archetypeKey: MosaicLabSourceArchetypeKey,
): number {
  return recipe.sourceCounts.find((sourceCount) => sourceCount.archetypeKey === archetypeKey)?.count ?? 0;
}

function createOrderedSourceCounts(recipe: MosaicLabRecipeDefinition) {
  return MOSAIC_LAB_SOURCE_ARCHETYPE_DEFINITIONS.map((definition) => ({
    archetypeKey: definition.key,
    count: readSourceCount(recipe, definition.key),
  }));
}

function createEditableRecipeFromBase(input: {
  recipeNumber: number;
  baseRecipe: MosaicLabRecipeDefinition;
  name?: string;
  clonedFromRecipeKey?: MosaicLabRecipeKey;
}): MosaicLabRecipeDefinition {
  const { recipeNumber, baseRecipe, name, clonedFromRecipeKey } = input;

  return createMosaicLabRecipe({
    key: createUserRecipeKey(recipeNumber),
    name: name ?? createUserRecipeName(recipeNumber),
    sourceCounts: createOrderedSourceCounts(baseRecipe),
    clonedFromRecipeKey,
  });
}

function replaceUserRecipe(
  state: MosaicLabRecipeBenchState,
  nextRecipe: MosaicLabRecipeDefinition,
): MosaicLabRecipeBenchState {
  return {
    ...state,
    userRecipes: state.userRecipes.map((recipe) => (recipe.key === nextRecipe.key ? nextRecipe : recipe)),
  };
}

function pickFallbackSelection(userRecipes: readonly MosaicLabRecipeDefinition[]): MosaicLabRecipeKey {
  return userRecipes.at(-1)?.key ?? DEFAULT_MOSAIC_LAB_BENCH_STARTER_KEY;
}

export function createInitialMosaicLabRecipeBenchState(): MosaicLabRecipeBenchState {
  const mixedStarter = MOSAIC_LAB_STARTER_RECIPE_DEFINITIONS.find(
    (recipe) => recipe.key === DEFAULT_MOSAIC_LAB_BENCH_STARTER_KEY,
  );

  if (!mixedStarter) {
    throw new Error('Expected Mixed starter recipe');
  }

  const initialDraft = createMosaicLabRecipe({
    key: INITIAL_MOSAIC_LAB_DRAFT_KEY,
    name: INITIAL_MOSAIC_LAB_DRAFT_NAME,
    sourceCounts: createOrderedSourceCounts(mixedStarter),
    clonedFromRecipeKey: mixedStarter.key,
  });

  return {
    selectedRecipeKey: initialDraft.key,
    userRecipes: [initialDraft],
    nextUserRecipeNumber: 2,
  };
}

export function listMosaicLabBenchRecipes(
  state: MosaicLabRecipeBenchState,
): readonly MosaicLabRecipeDefinition[] {
  return [...MOSAIC_LAB_STARTER_RECIPE_DEFINITIONS, ...state.userRecipes];
}

export function getMosaicLabBenchRecipe(
  state: MosaicLabRecipeBenchState,
  recipeKey: MosaicLabRecipeKey,
): MosaicLabRecipeDefinition | undefined {
  return listMosaicLabBenchRecipes(state).find((recipe) => recipe.key === recipeKey);
}

export function selectMosaicLabBenchRecipe(
  state: MosaicLabRecipeBenchState,
  recipeKey: MosaicLabRecipeKey,
): MosaicLabRecipeBenchState {
  if (!getMosaicLabBenchRecipe(state, recipeKey)) {
    return state;
  }

  return {
    ...state,
    selectedRecipeKey: recipeKey,
  };
}

export function createEditableMosaicLabBenchRecipe(
  state: MosaicLabRecipeBenchState,
  input?: {
    baseRecipeKey?: MosaicLabRecipeKey;
    name?: string;
  },
): MosaicLabRecipeBenchState {
  const baseRecipe = getMosaicLabBenchRecipe(
    state,
    input?.baseRecipeKey ?? state.selectedRecipeKey,
  );

  if (!baseRecipe) {
    return state;
  }

  const nextRecipe = createEditableRecipeFromBase({
    recipeNumber: state.nextUserRecipeNumber,
    baseRecipe,
    name: input?.name,
  });

  return {
    selectedRecipeKey: nextRecipe.key,
    userRecipes: [...state.userRecipes, nextRecipe],
    nextUserRecipeNumber: state.nextUserRecipeNumber + 1,
  };
}

export function duplicateSelectedMosaicLabBenchRecipe(
  state: MosaicLabRecipeBenchState,
): MosaicLabRecipeBenchState {
  const selectedRecipe = getMosaicLabBenchRecipe(state, state.selectedRecipeKey);

  if (!selectedRecipe) {
    return state;
  }

  const key = createUserRecipeKey(state.nextUserRecipeNumber);
  const nextRecipe = duplicateMosaicLabRecipe(selectedRecipe, { key });

  return {
    selectedRecipeKey: nextRecipe.key,
    userRecipes: [...state.userRecipes, nextRecipe],
    nextUserRecipeNumber: state.nextUserRecipeNumber + 1,
  };
}

export function updateMosaicLabBenchRecipeName(
  state: MosaicLabRecipeBenchState,
  input: {
    recipeKey: MosaicLabRecipeKey;
    name: string;
  },
): MosaicLabRecipeBenchState {
  const recipe = state.userRecipes.find((candidate) => candidate.key === input.recipeKey);

  if (!recipe) {
    return state;
  }

  return replaceUserRecipe(
    state,
    createMosaicLabRecipe({
      key: recipe.key,
      name: input.name,
      sourceCounts: createOrderedSourceCounts(recipe),
      clonedFromRecipeKey: recipe.clonedFromRecipeKey,
    }),
  );
}

export function updateMosaicLabBenchRecipeSourceCount(
  state: MosaicLabRecipeBenchState,
  input: {
    recipeKey: MosaicLabRecipeKey;
    archetypeKey: MosaicLabSourceArchetypeKey;
    count: number;
  },
): MosaicLabRecipeBenchState {
  const recipe = state.userRecipes.find((candidate) => candidate.key === input.recipeKey);

  if (!recipe) {
    return state;
  }

  const nextRecipe = createMosaicLabRecipe({
    key: recipe.key,
    name: recipe.name,
    sourceCounts: MOSAIC_LAB_SOURCE_ARCHETYPE_DEFINITIONS.map((definition) => ({
      archetypeKey: definition.key,
      count: definition.key === input.archetypeKey ? input.count : readSourceCount(recipe, definition.key),
    })),
    clonedFromRecipeKey: recipe.clonedFromRecipeKey,
  });

  return replaceUserRecipe(state, nextRecipe);
}

export function deleteMosaicLabBenchRecipe(
  state: MosaicLabRecipeBenchState,
  recipeKey: MosaicLabRecipeKey,
): MosaicLabRecipeBenchState {
  const nextUserRecipes = state.userRecipes.filter((recipe) => recipe.key !== recipeKey);

  if (nextUserRecipes.length === state.userRecipes.length) {
    return state;
  }

  return {
    ...state,
    userRecipes: nextUserRecipes,
    selectedRecipeKey:
      state.selectedRecipeKey === recipeKey
        ? pickFallbackSelection(nextUserRecipes)
        : state.selectedRecipeKey,
  };
}

export function getMosaicLabBenchRecipeSourceCount(
  recipe: MosaicLabRecipeDefinition,
  archetypeKey: MosaicLabSourceArchetypeKey,
): number {
  return readSourceCount(recipe, archetypeKey);
}
