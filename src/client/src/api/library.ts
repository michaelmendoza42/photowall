import {
  LIBRARY_FACETS_PATH,
  LIBRARY_ROOT_PATH,
  LIBRARY_STATUS_PATH,
  type LibraryFacetsResponse,
  type LibraryRootUpdateRequest,
  type LibraryStatusResponse,
} from '../../../shared/api/library.js';
import { ApiError, fetchJson } from './http.js';
import { GUEST_VIEW_HEADERS } from './photos.js';

export async function fetchLibraryStatus(
  signal?: AbortSignal,
): Promise<LibraryStatusResponse> {
  return fetchJson<LibraryStatusResponse>(LIBRARY_STATUS_PATH, { signal });
}

export async function fetchLibraryFacets(
  signal?: AbortSignal,
  viewAsGuest = false,
): Promise<LibraryFacetsResponse> {
  return fetchJson<LibraryFacetsResponse>(LIBRARY_FACETS_PATH, {
    signal,
    ...(viewAsGuest ? { headers: GUEST_VIEW_HEADERS } : {}),
  });
}

export async function updateLibraryRoot(
  input: LibraryRootUpdateRequest,
  signal?: AbortSignal,
): Promise<LibraryStatusResponse> {
  let res: Response;
  try {
    res = await fetch(LIBRARY_ROOT_PATH, {
      method: 'PUT',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(input),
      signal,
    });
  } catch (err) {
    throw new ApiError(
      err instanceof Error ? err.message : 'network request failed',
      0,
      null,
    );
  }

  const text = await res.text();
  let body: unknown = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const detail =
      typeof body === 'object' && body !== null && 'detail' in body
        ? String((body as { detail: unknown }).detail)
        : typeof body === 'object' && body !== null && 'error' in body
          ? String((body as { error: unknown }).error)
          : `HTTP ${res.status}`;
    throw new ApiError(detail, res.status, body);
  }

  return body as LibraryStatusResponse;
}
