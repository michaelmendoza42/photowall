import {
  PLAYLISTS_COLLECTION_PATH,
  type PlaylistListResponse,
} from '../../../shared/api/playlists.js';
import { fetchJson } from './http.js';

export async function fetchPlaylists(
  signal?: AbortSignal,
): Promise<PlaylistListResponse> {
  return fetchJson<PlaylistListResponse>(PLAYLISTS_COLLECTION_PATH, { signal });
}
