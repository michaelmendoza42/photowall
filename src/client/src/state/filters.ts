// Active filter state for the wall query.
//
// Mirrors `PhotosQueryFilters` from the shared API, but defaults every
// axis to an empty array so React state can be diffed cheaply without
// optional-property gymnastics. Conversion happens at the query boundary.

import type { PhotosQueryFilters } from '../../../shared/api/photos.js';

export interface ActiveFilters {
  years: number[];
  folders: string[];
  /** Nested folders deselected under `folders` (deepest rule wins). */
  excludeFolders: string[];
  /** The Starred album is picked. */
  starred?: boolean;
}

export const ACTIVE_FILTERS_STORAGE_KEY = 'photo-wall.active-filters.v1';

export const EMPTY_FILTERS: ActiveFilters = {
  years: [],
  folders: [],
  excludeFolders: [],
};

export function toQueryFilters(active: ActiveFilters): PhotosQueryFilters {
  const out: PhotosQueryFilters = {};
  if (active.years.length > 0) out.years = active.years;
  if (active.folders.length > 0) out.folders = active.folders;
  if (active.excludeFolders.length > 0) out.excludeFolders = active.excludeFolders;
  if (active.starred) out.starred = true;
  return out;
}

export function hasAnyFilter(active: ActiveFilters): boolean {
  return (
    active.years.length > 0 ||
    active.folders.length > 0 ||
    active.excludeFolders.length > 0 ||
    active.starred === true
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
  if (active.excludeFolders.length > 0) {
    parts.push(`excluded=${active.excludeFolders.length}`);
  }
  if (active.starred) parts.push('starred');
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

/** Replace the folder selection rules, e.g. after a folder-tree toggle. */
export function setFolderSelection(
  active: ActiveFilters,
  selection: { folders: string[]; excludeFolders: string[] },
): ActiveFilters {
  return {
    ...active,
    folders: [...selection.folders].sort(),
    excludeFolders: [...selection.excludeFolders].sort(),
  };
}

/**
 * Drop saved folder rules for folders the library no longer has. A
 * stale rule can't be shown or cleared in the album picker, yet it
 * would still narrow the query and add album areas. Returns the same
 * object when nothing was dropped.
 */
export function pruneMissingFolders(
  active: ActiveFilters,
  availableFolders: readonly string[],
): ActiveFilters {
  const available = new Set(availableFolders);
  const folders = active.folders.filter((f) => available.has(f));
  const excludeFolders = active.excludeFolders.filter((f) => available.has(f));
  if (
    folders.length === active.folders.length &&
    excludeFolders.length === active.excludeFolders.length
  ) {
    return active;
  }
  // Exclusions only mean something under a remaining selection.
  return { ...active, folders, excludeFolders: folders.length > 0 ? excludeFolders : [] };
}

/**
 * Single-album mode: pick one folder (with everything inside it), or
 * Favorites, in place of whatever was picked before.
 */
export function pickSingleAlbum(
  active: ActiveFilters,
  album: { folder: string } | 'starred',
): ActiveFilters {
  return album === 'starred'
    ? { ...active, folders: [], excludeFolders: [], starred: true }
    : { ...active, folders: [album.folder], excludeFolders: [], starred: false };
}

/** More than one album picked, or a folder with some of it deselected. */
export function isMultiAlbumSelection(active: ActiveFilters): boolean {
  return active.folders.length + (active.starred ? 1 : 0) > 1 || active.excludeFolders.length > 0;
}

export function clearFilters(active: ActiveFilters): ActiveFilters {
  if (!hasAnyFilter(active)) return active;
  return EMPTY_FILTERS;
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
      excludeFolders: Array.isArray(parsed.excludeFolders)
        ? parsed.excludeFolders.filter((folder): folder is string => typeof folder === 'string').sort()
        : [],
      ...(parsed.starred === true ? { starred: true } : {}),
    };
  } catch {
    return EMPTY_FILTERS;
  }
}
