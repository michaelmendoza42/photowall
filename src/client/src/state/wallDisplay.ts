// A viewer's own choice of wall spacing and photo-view frames, remembered
// in this browser. Unset, each follows the curator's default.

import {
  WALL_SPACINGS,
  type WallDisplaySettings,
  type WallSpacing,
} from '../../../shared/api/curation.js';

export const WALL_DISPLAY_STORAGE_KEY = 'photo-wall.wall-display.v1';

/** What this viewer overrides; anything left out follows the curator. */
export type WallDisplayPreference = Partial<WallDisplaySettings>;

export function parseWallDisplayPreference(raw: string | null): WallDisplayPreference {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const preference: WallDisplayPreference = {};
    if (WALL_SPACINGS.includes(value['spacing'] as WallSpacing)) {
      preference.spacing = value['spacing'] as WallSpacing;
    }
    if (typeof value['lightboxFrames'] === 'boolean') {
      preference.lightboxFrames = value['lightboxFrames'];
    }
    return preference;
  } catch {
    return {};
  }
}

export function readWallDisplayPreference(): WallDisplayPreference {
  try {
    return parseWallDisplayPreference(window.localStorage.getItem(WALL_DISPLAY_STORAGE_KEY));
  } catch {
    return {};
  }
}

export function writeWallDisplayPreference(preference: WallDisplayPreference): void {
  try {
    window.localStorage.setItem(WALL_DISPLAY_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // Private windows may refuse storage; the choice then lasts this visit.
  }
}

/** The settings in effect: the viewer's own choices over the curator's defaults. */
export function effectiveWallDisplay(
  defaults: WallDisplaySettings,
  preference: WallDisplayPreference,
): WallDisplaySettings {
  return { ...defaults, ...preference };
}
