// Saved-filter playlist contract.
//
// Playlists are deliberately narrow: they are saved year+folder
// filter presets, persisted as one JSON file per playlist under
// `/data/playlists`. They are NOT a richer query language and they
// do NOT pin a snapshot — selecting a playlist re-runs the same
// year/folder filter against whatever snapshot is currently active.

export const PLAYLISTS_COLLECTION_PATH = '/api/playlists';

/** `/api/playlists/:id` — built on the client with the id appended. */
export function playlistResourcePath(id: string): string {
  return `${PLAYLISTS_COLLECTION_PATH}/${encodeURIComponent(id)}`;
}

/**
 * Saved filter preset. `years` and `folders` are combined with AND
 * semantics by the query endpoint when the playlist is referenced.
 * An empty array means "no constraint on that axis", which matches
 * how inline filters work.
 */
export interface PlaylistFilters {
  years: number[];
  folders: string[];
  /** Nested folders deselected under `folders`. Older playlists omit it. */
  excludeFolders?: string[];
}

export interface PlaylistRecord {
  id: string;
  name: string;
  filters: PlaylistFilters;
  createdAt: string;
  updatedAt: string;
}

export interface PlaylistListResponse {
  playlists: PlaylistRecord[];
}

export interface PlaylistCreateRequest {
  name: string;
  filters: PlaylistFilters;
}

export interface PlaylistUpdateRequest {
  name?: string;
  filters?: PlaylistFilters;
}

export interface PlaylistErrorResponse {
  error: 'playlist_not_found' | 'playlist_invalid' | 'playlist_name_required';
  detail?: string;
}
