import {
  PLAYLISTS_COLLECTION_PATH,
  playlistResourcePath,
  type PlaylistCreateRequest,
  type PlaylistListResponse,
  type PlaylistRecord,
  type PlaylistUpdateRequest,
} from '../../../shared/api/playlists.js';
import { ApiError, fetchJson } from './http.js';

export async function fetchPlaylists(
  signal?: AbortSignal,
): Promise<PlaylistListResponse> {
  return fetchJson<PlaylistListResponse>(PLAYLISTS_COLLECTION_PATH, { signal });
}

async function postJson<T>(
  url: string,
  body: unknown,
  init: { method: 'POST' | 'PATCH'; signal?: AbortSignal },
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: init.signal,
    });
  } catch (err) {
    throw new ApiError(
      err instanceof Error ? err.message : 'network request failed',
      0,
      null,
    );
  }
  const text = await res.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) {
    const detail =
      typeof parsed === 'object' && parsed !== null && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new ApiError(detail, res.status, parsed);
  }
  return parsed as T;
}

export async function createPlaylist(
  input: PlaylistCreateRequest,
  signal?: AbortSignal,
): Promise<PlaylistRecord> {
  return postJson<PlaylistRecord>(PLAYLISTS_COLLECTION_PATH, input, {
    method: 'POST',
    ...(signal !== undefined ? { signal } : {}),
  });
}

export async function updatePlaylist(
  id: string,
  input: PlaylistUpdateRequest,
  signal?: AbortSignal,
): Promise<PlaylistRecord> {
  return postJson<PlaylistRecord>(playlistResourcePath(id), input, {
    method: 'PATCH',
    ...(signal !== undefined ? { signal } : {}),
  });
}

export async function deletePlaylist(
  id: string,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(playlistResourcePath(id), {
      method: 'DELETE',
      headers: { accept: 'application/json' },
      signal,
    });
  } catch (err) {
    throw new ApiError(
      err instanceof Error ? err.message : 'network request failed',
      0,
      null,
    );
  }
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    let parsed: unknown = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    const detail =
      typeof parsed === 'object' && parsed !== null && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new ApiError(detail, res.status, parsed);
  }
}
