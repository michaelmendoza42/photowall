import { scaleRectForRender, definePackingContract } from './geometry.js';
import { getHorizontalSeamSegments, getVerticalSeamSegments } from './metrics.js';
import {
  expandMosaicLabRecipe,
  MOSAIC_LAB_SOURCE_ARCHETYPE_DEFINITIONS_BY_KEY,
  MOSAIC_LAB_STARTER_RECIPE_DEFINITIONS_BY_KEY,
} from './recipes.js';
import {
  packMosaicLabRecipe,
  type MosaicLabPackerFailedResult,
  type MosaicLabPackerPackedResult,
} from './packer.js';
import type {
  MosaicLabRecipeDefinition,
  MosaicLabRecipeKey,
  MosaicLabStarterRecipeKey,
} from './types.js';

export interface MosaicLabLayoutPreset {
  width: number;
  height: number;
  cellSize: number;
  maxTileCount: number;
}

export const MOSAIC_LAB_LAYOUT_PRESETS = Object.freeze<
  Record<MosaicLabStarterRecipeKey, MosaicLabLayoutPreset>
>({
  'all-landscape': {
    width: 160,
    height: 120,
    cellSize: 10,
    maxTileCount: 16,
  },
  'all-portrait': {
    width: 120,
    height: 160,
    cellSize: 10,
    maxTileCount: 12,
  },
  mixed: {
    width: 160,
    height: 120,
    cellSize: 10,
    maxTileCount: 16,
  },
  weird: {
    width: 160,
    height: 120,
    cellSize: 10,
    maxTileCount: 12,
  },
});

interface MosaicLabSceneBase {
  recipeKey: MosaicLabRecipeKey;
  recipeName: string;
  presetKey: MosaicLabStarterRecipeKey;
  seed: string;
  preset: MosaicLabLayoutPreset;
  renderFrame: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface MosaicLabPackedScene extends MosaicLabSceneBase {
  status: 'packed';
  result: MosaicLabPackerPackedResult;
  horizontalSeams: ReturnType<typeof getHorizontalSeamSegments>;
  verticalSeams: ReturnType<typeof getVerticalSeamSegments>;
}

export interface MosaicLabFailedScene extends MosaicLabSceneBase {
  status: 'failed';
  result: MosaicLabPackerFailedResult;
}

export type MosaicLabScene = MosaicLabPackedScene | MosaicLabFailedScene;

export function selectMosaicLabLayoutPresetKey(
  recipe: MosaicLabRecipeDefinition,
): MosaicLabStarterRecipeKey {
  const activeDefinitions = recipe.sourceCounts
    .filter((sourceCount) => sourceCount.count > 0)
    .map((sourceCount) => MOSAIC_LAB_SOURCE_ARCHETYPE_DEFINITIONS_BY_KEY[sourceCount.archetypeKey]);

  if (activeDefinitions.length === 0) {
    return 'mixed';
  }

  if (activeDefinitions.some((definition) => definition.family === 'nonstandard')) {
    return 'weird';
  }

  if (activeDefinitions.every((definition) => definition.sourceOrientation === 'portrait')) {
    return 'all-portrait';
  }

  if (activeDefinitions.every((definition) => definition.sourceOrientation === 'landscape')) {
    return 'all-landscape';
  }

  return 'mixed';
}

export function buildMosaicLabSceneFromRecipe(input: {
  recipe: MosaicLabRecipeDefinition;
  seed: string;
  globalZoom: number;
}): MosaicLabScene {
  const { recipe, seed, globalZoom } = input;
  const presetKey = selectMosaicLabLayoutPresetKey(recipe);
  const preset = MOSAIC_LAB_LAYOUT_PRESETS[presetKey];
  const contract = definePackingContract({
    width: preset.width,
    height: preset.height,
    gutterPx: 1,
    globalZoom,
  });
  const renderFrame = scaleRectForRender(contract.frame, contract);
  const result = packMosaicLabRecipe({
    recipe: expandMosaicLabRecipe({ recipe, seed }),
    seed,
    contract,
    settings: {
      cellSize: preset.cellSize,
      maxTileCount: preset.maxTileCount,
    },
  });

  const baseScene: MosaicLabSceneBase = {
    recipeKey: recipe.key,
    recipeName: recipe.name,
    presetKey,
    seed,
    preset,
    renderFrame,
  };

  if (result.status === 'failed') {
    return {
      ...baseScene,
      status: 'failed',
      result,
    };
  }

  return {
    ...baseScene,
    status: 'packed',
    result,
    horizontalSeams: getHorizontalSeamSegments(result.packedTiles),
    verticalSeams: getVerticalSeamSegments(result.packedTiles),
  };
}

export function buildMosaicLabScene(input: {
  recipeKey: MosaicLabStarterRecipeKey;
  seed: string;
  globalZoom: number;
}): MosaicLabScene {
  const { recipeKey, seed, globalZoom } = input;
  return buildMosaicLabSceneFromRecipe({
    recipe: MOSAIC_LAB_STARTER_RECIPE_DEFINITIONS_BY_KEY[recipeKey],
    seed,
    globalZoom,
  });
}
