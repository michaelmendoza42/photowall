import type { MosaicLabCategoryFamily } from './model/index.js';

export interface MosaicLabCategoryAppearance {
  accent: string;
  glow: string;
  ink: string;
  accentSolid: string;
  badgeFill: string;
}

export const MOSAIC_LAB_CATEGORY_APPEARANCE: Record<
  MosaicLabCategoryFamily,
  MosaicLabCategoryAppearance
> = {
  Standard: {
    accent: 'rgba(236, 230, 220, 0.84)',
    glow: 'rgba(236, 230, 220, 0.12)',
    ink: 'rgba(20, 17, 15, 0.86)',
    accentSolid: '#ece6dc',
    badgeFill: 'rgba(236, 230, 220, 0.92)',
  },
  'Scale rescue': {
    accent: 'rgba(212, 180, 131, 0.95)',
    glow: 'rgba(212, 180, 131, 0.18)',
    ink: 'rgba(30, 22, 12, 0.9)',
    accentSolid: '#d4b483',
    badgeFill: 'rgba(212, 180, 131, 0.94)',
  },
  'Neutral connector': {
    accent: 'rgba(143, 184, 180, 0.95)',
    glow: 'rgba(143, 184, 180, 0.18)',
    ink: 'rgba(10, 26, 24, 0.9)',
    accentSolid: '#8fb8b4',
    badgeFill: 'rgba(143, 184, 180, 0.94)',
  },
  'Seam-break rescue': {
    accent: 'rgba(217, 123, 91, 0.95)',
    glow: 'rgba(217, 123, 91, 0.18)',
    ink: 'rgba(35, 14, 10, 0.92)',
    accentSolid: '#d97b5b',
    badgeFill: 'rgba(217, 123, 91, 0.94)',
  },
};
