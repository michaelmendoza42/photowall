// Active filter state for the wall query.
//
// Mirrors `PhotosQueryFilters` from the shared API, but defaults every
// axis to an empty array so React state can be diffed cheaply without
// optional-property gymnastics. Conversion happens at the query boundary.

import type { PhotosQueryFilters } from '../../../shared/api/photos.js';

export interface ActiveFilters {
  years: number[];
  folders: string[];
  playlistId: string | null;
}

export const ACTIVE_FILTERS_STORAGE_KEY = 'photo-wall.active-filters.v1';

export const EMPTY_FILTERS: ActiveFilters = {
  years: [],
  folders: [],
  playlistId: null,
};

export function toQueryFilters(active: ActiveFilters): PhotosQueryFilters {
  const out: PhotosQueryFilters = {};
  if (active.years.length > 0) out.years = active.years;
  if (active.folders.length > 0) out.folders = active.folders;
  if (active.playlistId !== null) out.playlistId = active.playlistId;
  return out;
}

export function hasAnyFilter(active: ActiveFilters): boolean {
  return (
    active.years.length > 0 ||
    active.folders.length > 0 ||
    active.playlistId !== null
  );
}

export function summarizeFilters(active: ActiveFilters): string {
  const parts: string[] = [];
  if (active.years.length > 0) {
    parts.push(`years=${active.years.join(',')}`);
  }
  if (active.folders.length > 0) {
    parts.push(`folders=${active.folders.length}`);
  }
  if (active.playlistId !== null) {
    parts.push(`playlist=${active.playlistId}`);
  }
  return parts.length === 0 ? 'none' : parts.join(' · ');
}

/**
 * Add or remove a year from the active filter set. Returns the same
 * object identity when the set is unchanged so downstream `useMemo`
 * deps stay stable.
 */
export function toggleYear(
  active: ActiveFilters,
  year: number,
): ActiveFilters {
  const has = active.years.includes(year);
  const nextYears = has
    ? active.years.filter((y) => y !== year)
    : [...active.years, year].sort((a, b) => a - b);
  return { ...active, years: nextYears };
}

/**
 * Add or remove a folder path from the active filter set. Folder paths
 * are forward-slash, root-relative, and match the persisted facet shape.
 */
export function toggleFolder(
  active: ActiveFilters,
  folder: string,
): ActiveFilters {
  const has = active.folders.includes(folder);
  const nextFolders = has
    ? active.folders.filter((f) => f !== folder)
    : [...active.folders, folder].sort();
  return { ...active, folders: nextFolders };
}

export function clearFilters(active: ActiveFilters): ActiveFilters {
  if (!hasAnyFilter(active)) return active;
  return EMPTY_FILTERS;
}

/**
 * Apply a saved playlist's filter set as the active filters and remember
 * which playlist they came from. The saved filters fully replace the
 * current inline filters so the wall reads exactly like the saved
 * preset.
 */
export function applyPlaylistFilters(
  playlistId: string,
  filters: { years: number[]; folders: string[] },
): ActiveFilters {
  return {
    years: [...filters.years].sort((a, b) => a - b),
    folders: [...filters.folders].sort(),
    playlistId,
  };
}

/**
 * Compare a saved playlist's folder list against the current backend
 * folder facets. Any saved folder not present in `availableFolders` is
 * "stale" — the source library has changed since the playlist was saved
 * and that folder will no longer match any photos.
 */
export function findStaleFolders(
  saved: readonly string[],
  availableFolders: readonly string[],
): string[] {
  if (saved.length === 0) return [];
  const set = new Set(availableFolders);
  return saved.filter((f) => !set.has(f));
}

export function parseActiveFilters(raw: string | null): ActiveFilters {
  if (!raw) return EMPTY_FILTERS;

  try {
    const parsed = JSON.parse(raw) as Partial<ActiveFilters>;
    return {
      years: Array.isArray(parsed.years)
        ? parsed.years.filter((year): year is number => Number.isInteger(year)).sort((a, b) => a - b)
        : [],
      folders: Array.isArray(parsed.folders)
        ? parsed.folders.filter((folder): folder is string => typeof folder === 'string').sort()
        : [],
      playlistId: typeof parsed.playlistId === 'string' ? parsed.playlistId : null,
    };
  } catch {
    return EMPTY_FILTERS;
  }
}
