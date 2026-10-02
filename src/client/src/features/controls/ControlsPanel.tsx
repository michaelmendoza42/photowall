import { useMemo, useState } from 'react';
import type {
  LibraryFacetsResponse,
  YearFacet,
  FolderFacet,
} from '../../../../shared/api/library.js';
import type { PlaylistRecord } from '../../../../shared/api/playlists.js';
import {
  applyPlaylistFilters,
  clearFilters,
  findStaleFolders,
  hasAnyFilter,
  toggleFolder,
  toggleYear,
  type ActiveFilters,
} from '../../state/filters.js';
import { LibraryRootEditor } from '../library/LibraryRootEditor.js';

export interface ControlsPanelProps {
  open: boolean;
  onToggleOpen: () => void;
  filters: ActiveFilters;
  onFiltersChange: (next: ActiveFilters) => void;
  facets: LibraryFacetsResponse | null;
  playlists: readonly PlaylistRecord[];
  onCreatePlaylist: (name: string) => void;
  onUpdatePlaylist: (id: string, patch: { name?: string }) => void;
  onDeletePlaylist: (id: string) => void;
  createPending?: boolean;
  updatePending?: boolean;
  deletePending?: boolean;
  errorMessage?: string | null;
  libraryRoot: string;
  onLibraryRootChange: (nextRoot: string) => void;
  libraryRootPending?: boolean;
  libraryRootError?: string | null;
}

/**
 * Sort folder facets by depth then path so the most useful top-level
 * buckets surface first while still letting the operator drill into
 * deeper folders if they want. Empty (root) folder is dropped — it
 * means "everything" and is not a useful filter on its own.
 */
function visibleFolders(folders: readonly FolderFacet[]): FolderFacet[] {
  return folders
    .filter((f) => f.path.length > 0 && f.photoCount > 0)
    .slice()
    .sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth;
      return a.path.localeCompare(b.path);
    });
}

function visibleYears(years: readonly YearFacet[]): YearFacet[] {
  return years
    .slice()
    .sort((a, b) => b.year - a.year);
}

export function ControlsPanel(props: ControlsPanelProps): JSX.Element {
  const {
    open,
    onToggleOpen,
    filters,
    onFiltersChange,
    facets,
    playlists,
    onCreatePlaylist,
    onUpdatePlaylist,
    onDeletePlaylist,
    createPending,
    updatePending,
    deletePending,
    errorMessage,
    libraryRoot,
    onLibraryRootChange,
    libraryRootPending,
    libraryRootError,
  } = props;

  const [name, setName] = useState('');
  const [renameDraft, setRenameDraft] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const years = useMemo(
    () => (facets ? visibleYears(facets.years) : []),
    [facets],
  );
  const folders = useMemo(
    () => (facets ? visibleFolders(facets.folders) : []),
    [facets],
  );

  const availableFolderPaths = useMemo(
    () => (facets ? facets.folders.map((f) => f.path) : []),
    [facets],
  );

  const selectedPlaylist = useMemo(
    () =>
      filters.playlistId
        ? playlists.find((p) => p.id === filters.playlistId) ?? null
        : null,
    [filters.playlistId, playlists],
  );

  const staleFolders = useMemo(() => {
    if (!selectedPlaylist) return [];
    return findStaleFolders(
      selectedPlaylist.filters.folders,
      availableFolderPaths,
    );
  }, [selectedPlaylist, availableFolderPaths]);

  const filtersActive = hasAnyFilter(filters);

  function handleCreate(): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreatePlaylist(trimmed);
    setName('');
  }

  function handleSelectPlaylist(p: PlaylistRecord): void {
    onFiltersChange(applyPlaylistFilters(p.id, p.filters));
  }

  function handleClearPlaylist(): void {
    onFiltersChange({ ...filters, playlistId: null });
  }

  function handleResetAll(): void {
    onFiltersChange(clearFilters(filters));
  }

  function handleUpdateCurrentFilters(): void {
    if (!selectedPlaylist) return;
    onUpdatePlaylist(selectedPlaylist.id, {});
    // Caller is expected to update the playlist with the current filter
    // state — see WallShell's wiring.
  }

  function handleStartRename(p: PlaylistRecord): void {
    setRenameDraft({ id: p.id, name: p.name });
  }

  function handleSaveRename(): void {
    if (!renameDraft) return;
    const trimmed = renameDraft.name.trim();
    if (!trimmed) {
      setRenameDraft(null);
      return;
    }
    onUpdatePlaylist(renameDraft.id, { name: trimmed });
    setRenameDraft(null);
  }

  return (
    <div className="controls" data-testid="controls" data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        className="controls__trigger"
        data-testid="controls-trigger"
        onClick={onToggleOpen}
        aria-expanded={open}
        aria-controls="controls-panel"
        aria-label={open ? 'Close controls' : 'Open controls'}
        title={open ? 'Close controls' : 'Open controls'}
      >
        <span aria-hidden="true" className="controls__trigger-glyph">
          {open ? '×' : '•'}
        </span>
      </button>

      {open && (
        <section
          id="controls-panel"
          className="controls__panel"
          data-testid="controls-panel"
          aria-label="Wall controls"
        >
          <header className="controls__header">
            <h2 className="controls__title">Controls</h2>
            {filtersActive && (
              <button
                type="button"
                className="controls__link"
                data-testid="controls-reset"
                onClick={handleResetAll}
              >
                Reset
              </button>
            )}
          </header>

          {errorMessage && (
            <p className="controls__error" role="alert">
              {errorMessage}
            </p>
          )}

          <section className="controls__section">
            <LibraryRootEditor
              currentRoot={libraryRoot}
              onSubmit={onLibraryRootChange}
              pending={libraryRootPending}
              errorMessage={libraryRootError}
              hint="Use the path the server can actually read. The local picker only prefills when the browser exposes a compatible path."
              submitLabel="Change root"
            />
          </section>

          <section className="controls__section">
            <h3 className="controls__section-title">Years</h3>
            {years.length === 0 ? (
              <p className="controls__hint">No year metadata in the library yet.</p>
            ) : (
              <ul className="controls__chips" data-testid="controls-years">
                {years.map((y) => {
                  const selected = filters.years.includes(y.year);
                  return (
                    <li key={y.year}>
                      <button
                        type="button"
                        className="controls__chip"
                        data-testid={`controls-year-${y.year}`}
                        data-selected={selected ? 'true' : 'false'}
                        aria-pressed={selected}
                        onClick={() => onFiltersChange(toggleYear(filters, y.year))}
                      >
                        <span className="controls__chip-label">{y.year}</span>
                        <span className="controls__chip-count">{y.photoCount}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="controls__section">
            <h3 className="controls__section-title">Folders</h3>
            {folders.length === 0 ? (
              <p className="controls__hint">No folder facets available yet.</p>
            ) : (
              <ul className="controls__chips controls__chips--folders" data-testid="controls-folders">
                {folders.map((f) => {
                  const selected = filters.folders.includes(f.path);
                  return (
                    <li key={f.path}>
                      <button
                        type="button"
                        className="controls__chip"
                        data-testid={`controls-folder-${f.path}`}
                        data-selected={selected ? 'true' : 'false'}
                        aria-pressed={selected}
                        title={f.path}
                        onClick={() => onFiltersChange(toggleFolder(filters, f.path))}
                      >
                        <span className="controls__chip-label">{f.path}</span>
                        <span className="controls__chip-count">{f.photoCount}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="controls__section">
            <header className="controls__section-header">
              <h3 className="controls__section-title">Playlists</h3>
              {selectedPlaylist && (
                <button
                  type="button"
                  className="controls__link"
                  data-testid="controls-playlist-clear"
                  onClick={handleClearPlaylist}
                >
                  Deselect
                </button>
              )}
            </header>

            {staleFolders.length > 0 && (
              <p
                className="controls__warning"
                data-testid="controls-stale-warning"
                role="status"
              >
                {staleFolders.length} folder
                {staleFolders.length === 1 ? '' : 's'} from this playlist no
                longer exist in the library.
              </p>
            )}

            {playlists.length === 0 ? (
              <p className="controls__hint">No saved playlists yet.</p>
            ) : (
              <ul className="controls__playlists" data-testid="controls-playlist-list">
                {playlists.map((p) => {
                  const selected = filters.playlistId === p.id;
                  const isRenaming = renameDraft?.id === p.id;
                  return (
                    <li
                      key={p.id}
                      className="controls__playlist"
                      data-testid={`controls-playlist-${p.id}`}
                      data-selected={selected ? 'true' : 'false'}
                    >
                      {isRenaming ? (
                        <>
                          <input
                            className="controls__playlist-rename"
                            data-testid={`controls-playlist-rename-input-${p.id}`}
                            name={`controls-playlist-rename-${p.id}`}
                            aria-label={`Rename ${p.name}`}
                            value={renameDraft.name}
                            onChange={(e) =>
                              setRenameDraft({
                                id: p.id,
                                name: e.target.value,
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename();
                              if (e.key === 'Escape') setRenameDraft(null);
                            }}
                            autoFocus
                          />
                          <button
                            type="button"
                            className="controls__link"
                            data-testid={`controls-playlist-rename-save-${p.id}`}
                            onClick={handleSaveRename}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="controls__link controls__link--quiet"
                            onClick={() => setRenameDraft(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="controls__playlist-name"
                            data-testid={`controls-playlist-select-${p.id}`}
                            onClick={() => handleSelectPlaylist(p)}
                          >
                            {p.name}
                          </button>
                          <button
                            type="button"
                            className="controls__link controls__link--quiet"
                            data-testid={`controls-playlist-rename-${p.id}`}
                            onClick={() => handleStartRename(p)}
                            aria-label={`Rename ${p.name}`}
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            className="controls__link controls__link--danger"
                            data-testid={`controls-playlist-delete-${p.id}`}
                            disabled={deletePending}
                            onClick={() => onDeletePlaylist(p.id)}
                            aria-label={`Delete ${p.name}`}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="controls__create">
              <input
                type="text"
                className="controls__create-input"
                data-testid="controls-playlist-name"
                name="controls-playlist-name"
                aria-label="New playlist name"
                placeholder="Save current filters as…"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                }}
              />
              <button
                type="button"
                className="controls__create-button"
                data-testid="controls-playlist-save"
                onClick={handleCreate}
                disabled={!name.trim() || createPending}
                aria-disabled={!name.trim() || createPending}
              >
                Save
              </button>
            </div>
            {selectedPlaylist && (
              <button
                type="button"
                className="controls__link"
                data-testid="controls-playlist-update"
                onClick={handleUpdateCurrentFilters}
                disabled={updatePending}
              >
                Update “{selectedPlaylist.name}” with current filters
              </button>
            )}
          </section>
        </section>
      )}
    </div>
  );
}
