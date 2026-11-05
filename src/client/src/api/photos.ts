import {
  PHOTOS_QUERY_PATH,
  type PhotosQueryFilters,
  type PhotosQueryResponse,
} from '../../../shared/api/photos.js';
import { VIEW_AS_GUEST, VIEW_AS_HEADER } from '../../../shared/api/curation.js';
import { fetchJson } from './http.js';

export interface PhotoPageQueryInput {
  filters: PhotosQueryFilters;
  cursor: string | null;
  limit?: number;
}

export function buildPhotosQueryParams(
  input: PhotoPageQueryInput,
): URLSearchParams {
  const params = new URLSearchParams();
  if (input.cursor !== null) {
    params.set('cursor', input.cursor);
  }
  if (input.limit !== undefined) {
    params.set('limit', String(input.limit));
  }
  for (const year of input.filters.years ?? []) {
    params.append('year', String(year));
  }
  for (const folder of input.filters.folders ?? []) {
    params.append('folder', folder);
  }
  for (const folder of input.filters.excludeFolders ?? []) {
    params.append('exclude', folder);
  }
  if (input.filters.starred) params.set('starred', '1');
  return params;
}

export async function fetchPhotosPage(
  input: PhotoPageQueryInput,
  signal?: AbortSignal,
  viewAsGuest = false,
): Promise<PhotosQueryResponse> {
  return fetchJson<PhotosQueryResponse>(PHOTOS_QUERY_PATH, {
    signal,
    searchParams: buildPhotosQueryParams(input),
    ...(viewAsGuest ? { headers: GUEST_VIEW_HEADERS } : {}),
  });
}

/** Sent by a curator previewing the wall as a guest. */
export const GUEST_VIEW_HEADERS: Record<string, string> = { [VIEW_AS_HEADER]: VIEW_AS_GUEST };
