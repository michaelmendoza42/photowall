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
