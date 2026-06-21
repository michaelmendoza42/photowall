export const MOSAIC_LAB_STARTER_RECIPE_KEYS = [
  'all-landscape',
  'all-portrait',
  'mixed',
  'weird',
] as const;

export type MosaicLabStarterRecipeKey = (typeof MOSAIC_LAB_STARTER_RECIPE_KEYS)[number];

export type MosaicLabRecipeKey = string;

export const MOSAIC_LAB_SOURCE_ARCHETYPE_KEYS = [
  'source-standard-landscape',
  'source-standard-portrait',
  'source-panorama',
  'source-square',
  'source-wide-nonstandard',
  'source-tall-nonstandard',
] as const;

export type MosaicLabSourceArchetypeKey = (typeof MOSAIC_LAB_SOURCE_ARCHETYPE_KEYS)[number];

export const MOSAIC_LAB_SOURCE_FAMILIES = ['standard', 'nonstandard'] as const;

export type MosaicLabSourceFamily = (typeof MOSAIC_LAB_SOURCE_FAMILIES)[number];

export const MOSAIC_LAB_SOURCE_ORIENTATIONS = ['landscape', 'portrait', 'square'] as const;

export type MosaicLabSourceOrientation = (typeof MOSAIC_LAB_SOURCE_ORIENTATIONS)[number];

export type MosaicLabFootprintShape = 'landscape' | 'portrait' | 'square';

export const MOSAIC_LAB_FOOTPRINT_KEYS = [
  'standard-landscape',
  'standard-portrait',
  'large-landscape',
  'large-portrait',
  'square-rescue',
  'wide-landscape-seam-break',
  'tall-portrait-seam-break',
] as const;

export type MosaicLabFootprintKey = (typeof MOSAIC_LAB_FOOTPRINT_KEYS)[number];

export const MOSAIC_LAB_CATEGORY_FAMILIES = [
  'Standard',
  'Scale rescue',
  'Neutral connector',
  'Seam-break rescue',
] as const;

export type MosaicLabCategoryFamily = (typeof MOSAIC_LAB_CATEGORY_FAMILIES)[number];

export const MOSAIC_LAB_RECIPE_ORIGINS = ['starter', 'user'] as const;

export type MosaicLabRecipeOrigin = (typeof MOSAIC_LAB_RECIPE_ORIGINS)[number];

export interface MosaicLabRecipeSourceCount {
  archetypeKey: MosaicLabSourceArchetypeKey;
  count: number;
}

export interface MosaicLabRecipeDefinition {
  key: MosaicLabRecipeKey;
  name: string;
  origin: MosaicLabRecipeOrigin;
  sourceCounts: readonly MosaicLabRecipeSourceCount[];
  clonedFromRecipeKey?: MosaicLabRecipeKey;
}

export interface MosaicLabSourceArchetypeDefinition {
  key: MosaicLabSourceArchetypeKey;
  name: string;
  family: MosaicLabSourceFamily;
  sourceOrientation: MosaicLabSourceOrientation;
  nominalAspectRatio: number;
  aspectRatioRange?: {
    min: number;
    max: number;
  };
  preferredFootprintKey: MosaicLabFootprintKey;
  compatibleFootprintKeys: readonly MosaicLabFootprintKey[];
}

export interface MosaicLabCategoryDefinition {
  family: MosaicLabCategoryFamily;
  description: string;
  enabledByDefault: boolean;
  defaultMaxTiles: number | null;
}

export interface MosaicLabFootprintDefinition {
  key: MosaicLabFootprintKey;
  name: string;
  categoryFamily: MosaicLabCategoryFamily;
  shape: MosaicLabFootprintShape;
  logicalAspectRatio: number;
  compatibleSourceOrientations: readonly MosaicLabSourceOrientation[];
}

export interface MosaicLabSyntheticSourceTileRecord {
  id: string;
  label: string;
  recipeKey: MosaicLabRecipeKey;
  sourceArchetypeKey: MosaicLabSourceArchetypeKey;
  sourceFamily: MosaicLabSourceFamily;
  sourceOrientation: MosaicLabSourceOrientation;
  logicalAspectRatio: number;
  color: string;
  preferredFootprintKey: MosaicLabFootprintKey;
  eligibleFootprintKeys: readonly MosaicLabFootprintKey[];
  eligibleCategoryFamilies: readonly MosaicLabCategoryFamily[];
  sourceOccurrence: number;
}

export interface MosaicLabExpandedRecipeRecord extends MosaicLabRecipeDefinition {
  totalCount: number;
  expansionSeed: string;
  sourceTiles: readonly MosaicLabSyntheticSourceTileRecord[];
}
