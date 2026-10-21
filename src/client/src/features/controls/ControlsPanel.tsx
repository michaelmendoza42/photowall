import { useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryFacetsResponse } from '../../../../shared/api/library.js';
import type { PlaylistRecord } from '../../../../shared/api/playlists.js';
import {
  applyPlaylistFilters,
  clearFilters,
  findStaleFolders,
  hasAnyFilter,
  setFolderSelection,
  type ActiveFilters,
} from '../../state/filters.js';
import {
  buildFolderTree,
  folderCheckStates,
  toggleFolderInTree,
  type FolderCheckState,
  type FolderTreeNode,
} from '../../state/folderTree.js';

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
  } = props;

  const [name, setName] = useState('');
  const [renameDraft, setRenameDraft] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const folderTree = useMemo(
    () => (facets ? buildFolderTree(facets.folders) : []),
    [facets],
  );
  const checkStates = useMemo(
    () => folderCheckStates(folderTree, filters),
    [folderTree, filters],
  );
  // Folders the user opened or closed; the rest open when partially
  // selected so the deselected albums inside are visible.
  const [expandedOverrides, setExpandedOverrides] = useState<
    ReadonlyMap<string, boolean>
  >(() => new Map());

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

  function handleToggleFolder(path: string): void {
    // Keep folders that are open only because they were partial from
    // snapping shut under the cursor once they become fully (de)selected.
    setExpandedOverrides((prev) => {
      const next = new Map(prev);
      for (const [folder, state] of checkStates) {
        if (state === 'partial' && !next.has(folder)) next.set(folder, true);
      }
      return next;
    });
    onFiltersChange(
      setFolderSelection(filters, toggleFolderInTree(folderTree, filters, path)),
    );
  }

  function handleToggleExpanded(path: string, isExpanded: boolean): void {
    setExpandedOverrides((prev) => new Map(prev).set(path, !isExpanded));
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
            <h3 className="controls__section-title">Albums</h3>
            {folderTree.length === 0 ? (
              <p className="controls__hint">No albums discovered yet.</p>
            ) : (
              <>
                {filters.folders.length === 0 && (
                  <p className="controls__hint">Nothing picked: the wall shows every album.</p>
                )}
                <ul className="album-tree" data-testid="controls-folders">
                  {folderTree.map((node) => (
                    <AlbumTreeItem
                      key={node.path}
                      node={node}
                      depth={0}
                      checkStates={checkStates}
                      expandedOverrides={expandedOverrides}
                      onToggle={handleToggleFolder}
                      onToggleExpanded={handleToggleExpanded}
                    />
                  ))}
                </ul>
              </>
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

interface AlbumTreeItemProps {
  node: FolderTreeNode;
  depth: number;
  checkStates: ReadonlyMap<string, FolderCheckState>;
  expandedOverrides: ReadonlyMap<string, boolean>;
  onToggle: (path: string) => void;
  onToggleExpanded: (path: string, isExpanded: boolean) => void;
}

function AlbumTreeItem(props: AlbumTreeItemProps): JSX.Element {
  const { node, depth, checkStates, expandedOverrides, onToggle, onToggleExpanded } = props;
  const state = checkStates.get(node.path) ?? 'none';
  const hasChildren = node.children.length > 0;
  const isExpanded =
    hasChildren && (expandedOverrides.get(node.path) ?? state === 'partial');
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = state === 'partial';
  }, [state]);

  return (
    <li className="album-tree__item">
      <div className="album-tree__row" style={{ paddingLeft: `${depth * 18}px` }}>
        {hasChildren ? (
          <button
            type="button"
            className="album-tree__disclosure"
            data-testid={`controls-folder-expand-${node.path}`}
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.name}`}
            onClick={() => onToggleExpanded(node.path, isExpanded)}
          >
            <span aria-hidden="true">{isExpanded ? '▾' : '▸'}</span>
          </button>
        ) : (
          <span className="album-tree__disclosure" aria-hidden="true" />
        )}
        <label className="album-tree__label" title={node.path}>
          <input
            ref={checkboxRef}
            type="checkbox"
            className="album-tree__checkbox"
            data-testid={`controls-folder-${node.path}`}
            data-selected={state === 'all' ? 'true' : state === 'partial' ? 'partial' : 'false'}
            checked={state === 'all'}
            onChange={() => onToggle(node.path)}
          />
          <span className="album-tree__name">{node.name}</span>
          <span className="album-tree__count">{node.photoCount}</span>
        </label>
      </div>
      {isExpanded && (
        <ul className="album-tree" role="group">
          {node.children.map((child) => (
            <AlbumTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              checkStates={checkStates}
              expandedOverrides={expandedOverrides}
              onToggle={onToggle}
              onToggleExpanded={onToggleExpanded}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
