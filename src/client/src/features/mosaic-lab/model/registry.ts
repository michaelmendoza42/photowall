import {
  MOSAIC_LAB_CATEGORY_FAMILIES,
  type MosaicLabCategoryDefinition,
  type MosaicLabCategoryFamily,
  type MosaicLabFootprintDefinition,
  type MosaicLabFootprintKey,
  type MosaicLabSourceOrientation,
} from './types.js';

export const MOSAIC_LAB_CATEGORY_REGISTRY = [
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
] as const satisfies readonly MosaicLabCategoryDefinition[];

export const MOSAIC_LAB_FOOTPRINT_REGISTRY = [
  {
    key: 'standard-landscape',
    name: 'Standard landscape',
    categoryFamily: 'Standard',
    shape: 'landscape',
    logicalAspectRatio: 4 / 3,
    compatibleSourceOrientations: ['landscape'],
  },
  {
    key: 'standard-portrait',
    name: 'Standard portrait',
    categoryFamily: 'Standard',
    shape: 'portrait',
    logicalAspectRatio: 3 / 4,
    compatibleSourceOrientations: ['portrait'],
  },
  {
    key: 'large-landscape',
    name: 'Large landscape',
    categoryFamily: 'Scale rescue',
    shape: 'landscape',
    logicalAspectRatio: 8 / 5,
    compatibleSourceOrientations: ['landscape'],
  },
  {
    key: 'large-portrait',
    name: 'Large portrait',
    categoryFamily: 'Scale rescue',
    shape: 'portrait',
    logicalAspectRatio: 5 / 8,
    compatibleSourceOrientations: ['portrait'],
  },
  {
    key: 'square-rescue',
    name: 'Square rescue',
    categoryFamily: 'Neutral connector',
    shape: 'square',
    logicalAspectRatio: 1,
    compatibleSourceOrientations: ['landscape', 'portrait', 'square'],
  },
  {
    key: 'wide-landscape-seam-break',
    name: 'Wide landscape seam-break',
    categoryFamily: 'Seam-break rescue',
    shape: 'landscape',
    logicalAspectRatio: 16 / 9,
    compatibleSourceOrientations: ['landscape'],
  },
  {
    key: 'tall-portrait-seam-break',
    name: 'Tall portrait seam-break',
    categoryFamily: 'Seam-break rescue',
    shape: 'portrait',
    logicalAspectRatio: 9 / 16,
    compatibleSourceOrientations: ['portrait'],
  },
] as const satisfies readonly MosaicLabFootprintDefinition[];

export const MOSAIC_LAB_CATEGORY_REGISTRY_BY_FAMILY = Object.freeze(
  Object.fromEntries(
    MOSAIC_LAB_CATEGORY_REGISTRY.map((category) => [category.family, category]),
  ) as Record<MosaicLabCategoryFamily, (typeof MOSAIC_LAB_CATEGORY_REGISTRY)[number]>,
);

export const MOSAIC_LAB_FOOTPRINT_REGISTRY_BY_KEY = Object.freeze(
  Object.fromEntries(
    MOSAIC_LAB_FOOTPRINT_REGISTRY.map((footprint) => [footprint.key, footprint]),
  ) as Record<MosaicLabFootprintKey, (typeof MOSAIC_LAB_FOOTPRINT_REGISTRY)[number]>,
);

export const MOSAIC_LAB_FOOTPRINT_KEYS_BY_CATEGORY_FAMILY = Object.freeze(
  MOSAIC_LAB_CATEGORY_FAMILIES.reduce<Record<MosaicLabCategoryFamily, readonly MosaicLabFootprintKey[]>>(
    (registry, family) => {
      registry[family] = MOSAIC_LAB_FOOTPRINT_REGISTRY.filter(
        (footprint) => footprint.categoryFamily === family,
      ).map((footprint) => footprint.key);
      return registry;
    },
    {
      Standard: [],
      'Scale rescue': [],
      'Neutral connector': [],
      'Seam-break rescue': [],
    },
  ),
);

export function getFootprintsForSourceOrientation(
  sourceOrientation: MosaicLabSourceOrientation,
): readonly MosaicLabFootprintDefinition[] {
  return MOSAIC_LAB_FOOTPRINT_REGISTRY.filter((footprint) =>
    footprint.compatibleSourceOrientations.some((candidate) => candidate === sourceOrientation),
  );
}

export function getEligibleFootprintKeys(
  sourceOrientation: MosaicLabSourceOrientation,
): readonly MosaicLabFootprintKey[] {
  return getFootprintsForSourceOrientation(sourceOrientation).map((footprint) => footprint.key);
}
