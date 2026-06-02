import {
  LIBRARY_FACETS_PATH,
  LIBRARY_STATUS_PATH,
  type LibraryFacetsResponse,
  type LibraryStatusResponse,
} from '../../../shared/api/library.js';
import { fetchJson } from './http.js';

export async function fetchLibraryStatus(
  signal?: AbortSignal,
): Promise<LibraryStatusResponse> {
  return fetchJson<LibraryStatusResponse>(LIBRARY_STATUS_PATH, { signal });
}

export async function fetchLibraryFacets(
  signal?: AbortSignal,
): Promise<LibraryFacetsResponse> {
  return fetchJson<LibraryFacetsResponse>(LIBRARY_FACETS_PATH, { signal });
}
