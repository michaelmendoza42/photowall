import {
  PHOTOS_QUERY_PATH,
  type PhotosQueryFilters,
  type PhotosQueryResponse,
} from '../../../shared/api/photos.js';
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
  if (input.filters.playlistId !== undefined) {
    params.set('playlist', input.filters.playlistId);
  }
  return params;
}

export async function fetchPhotosPage(
  input: PhotoPageQueryInput,
  signal?: AbortSignal,
): Promise<PhotosQueryResponse> {
  return fetchJson<PhotosQueryResponse>(PHOTOS_QUERY_PATH, {
    signal,
    searchParams: buildPhotosQueryParams(input),
  });
}
