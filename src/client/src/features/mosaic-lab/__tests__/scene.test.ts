import { describe, expect, it } from 'vitest';
import {
  buildMosaicLabScene,
  buildMosaicLabSceneFromRecipe,
  computeMosaicLabMetrics,
  createMosaicLabRecipe,
  getHorizontalSeamSegments,
  getVerticalSeamSegments,
  MOSAIC_LAB_LAYOUT_PRESETS,
  selectMosaicLabLayoutPresetKey,
} from '../model/index.js';

describe('Mosaic Lab scene builder', () => {
  it('builds real packed scenes for the required starter recipes', () => {
    const recipeKeys = ['all-landscape', 'all-portrait', 'mixed', 'weird'] as const;

    for (const recipeKey of recipeKeys) {
      const scene = buildMosaicLabScene({
        recipeKey,
        seed: `scene-${recipeKey}`,
        globalZoom: 1,
      });

      expect(scene.status).toBe('packed');
      if (scene.status !== 'packed') {
        throw new Error(scene.result.failureReason);
      }

      expect(scene.recipeKey).toBe(recipeKey);
      expect(scene.result.recipeKey).toBe(recipeKey);
      expect(scene.result.metrics.blackSpace).toMatchObject({ passes: true, uncoveredArea: 0 });
      expect(scene.result.metrics.overlap).toMatchObject({ passes: true, overlapArea: 0 });
      expect(scene.result.metrics.totalTileCount).toBeGreaterThan(0);
      expect(scene.result.contract.frame.width).toBe(MOSAIC_LAB_LAYOUT_PRESETS[recipeKey].width);
      expect(scene.result.contract.frame.height).toBe(MOSAIC_LAB_LAYOUT_PRESETS[recipeKey].height);
      expect(scene.result.settings.cellSize).toBe(MOSAIC_LAB_LAYOUT_PRESETS[recipeKey].cellSize);
      expect(scene.result.settings.maxTileCount).toBe(MOSAIC_LAB_LAYOUT_PRESETS[recipeKey].maxTileCount);
    }
  });

  it('applies global zoom as render scaling only while keeping metrics and overlays on canonical geometry', () => {
    const zoomedScene = buildMosaicLabScene({ recipeKey: 'mixed', seed: 'zoom-scene', globalZoom: 1.45 });
    const baselineScene = buildMosaicLabScene({ recipeKey: 'mixed', seed: 'zoom-scene', globalZoom: 1 });

    expect(zoomedScene.status).toBe('packed');
    expect(baselineScene.status).toBe('packed');
    if (zoomedScene.status !== 'packed' || baselineScene.status !== 'packed') {
      throw new Error('Expected packed mixed scenes');
    }

    expect(zoomedScene.result.metrics).toEqual(baselineScene.result.metrics);
    expect(zoomedScene.renderFrame.width).toBeCloseTo(
      baselineScene.result.contract.frame.width * 1.45,
      6,
    );
    expect(zoomedScene.renderFrame.height).toBeCloseTo(
      baselineScene.result.contract.frame.height * 1.45,
      6,
    );
    expect(computeMosaicLabMetrics(zoomedScene.result.contract, zoomedScene.result.packedTiles)).toEqual(
      zoomedScene.result.metrics,
    );
    expect(zoomedScene.horizontalSeams).toEqual(getHorizontalSeamSegments(zoomedScene.result.packedTiles));
    expect(zoomedScene.verticalSeams).toEqual(getVerticalSeamSegments(zoomedScene.result.packedTiles));
  });

  it('builds scenes from editable recipes and derives the layout preset from active source archetypes', () => {
    const portraitRecipe = createMosaicLabRecipe({
      key: 'portrait-draft',
      name: 'Portrait Draft',
      sourceCounts: [{ archetypeKey: 'source-standard-portrait', count: 18 }],
      clonedFromRecipeKey: 'all-portrait',
    });
    const weirdRecipe = createMosaicLabRecipe({
      key: 'weird-draft',
      name: 'Weird Draft',
      sourceCounts: [
        { archetypeKey: 'source-panorama', count: 4 },
        { archetypeKey: 'source-square', count: 4 },
      ],
    });

    const portraitScene = buildMosaicLabSceneFromRecipe({
      recipe: portraitRecipe,
      seed: 'portrait-recipe-scene',
      globalZoom: 1,
    });

    expect(selectMosaicLabLayoutPresetKey(portraitRecipe)).toBe('all-portrait');
    expect(selectMosaicLabLayoutPresetKey(weirdRecipe)).toBe('weird');
    expect(portraitScene.status).toBe('packed');
    expect(portraitScene.recipeKey).toBe('portrait-draft');
    expect(portraitScene.recipeName).toBe('Portrait Draft');
    expect(portraitScene.presetKey).toBe('all-portrait');
    expect(portraitScene.preset).toEqual(MOSAIC_LAB_LAYOUT_PRESETS['all-portrait']);

    if (portraitScene.status !== 'packed') {
      throw new Error(portraitScene.result.failureReason);
    }

    expect(portraitScene.result.recipeKey).toBe('portrait-draft');
    expect(portraitScene.result.metrics.blackSpace).toMatchObject({ passes: true, uncoveredArea: 0 });
    expect(portraitScene.result.metrics.overlap).toMatchObject({ passes: true, overlapArea: 0 });
  });
});
