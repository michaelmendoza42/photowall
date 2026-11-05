import { useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryFacetsResponse } from '../../../../shared/api/library.js';
import type {
  AlbumCurationResponse,
  CurationSessionResponse,
} from '../../../../shared/api/curation.js';
import {
  clearFilters,
  hasAnyFilter,
  setFolderSelection,
  type ActiveFilters,
} from '../../state/filters.js';
import {
  buildFolderTree,
  folderCheckStates,
  folderDisplayStates,
  toggleFolderInTree,
  type FolderCheckState,
  type FolderTreeNode,
} from '../../state/folderTree.js';

export interface CurationControls {
  session: CurationSessionResponse | null;
  /** Present once the curator is signed in. */
  albums: AlbumCurationResponse | null;
  onLogin: (pin: string) => void;
  /** First-time setup: choose the PIN, proving access with the setup code. */
  onChoosePin: (pin: string, code: string) => void;
  onLogout: () => void;
  onSetDisplay: (folder: string, onDisplay: boolean) => void;
  onToggleDefault: (folder: string) => void;
  /** Add the Starred album to the default view, or take it out. */
  onToggleDefaultStarred: () => void;
  onRescan: () => void;
  /** The wall shows what guests see; curator tools keep working. */
  previewAsGuest: boolean;
  onPreviewAsGuestChange: (on: boolean) => void;
  /** Show the PIN form. Only the unlisted curator route does. */
  pinEntry: boolean;
  loginPending?: boolean;
  rescanPending?: boolean;
}

export interface ShareControls {
  onShare: () => void;
  pending?: boolean;
  url: string | null;
}

export interface ControlsPanelProps {
  open: boolean;
  onToggleOpen: () => void;
  filters: ActiveFilters;
  onFiltersChange: (next: ActiveFilters) => void;
  facets: LibraryFacetsResponse | null;
  curation: CurationControls;
  share: ShareControls;
  errorMessage?: string | null;
}

export function ControlsPanel(props: ControlsPanelProps): JSX.Element {
  const {
    open,
    onToggleOpen,
    filters,
    onFiltersChange,
    facets,
    curation,
    share,
    errorMessage,
  } = props;

  const [pin, setPin] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const choosingPin = curation.session !== null && !curation.session.enabled;
  const isCurator = curation.session?.curator === true;
  const albums = isCurator ? curation.albums : null;

  const folderTree = useMemo(
    () => (facets ? buildFolderTree(facets.folders) : []),
    [facets],
  );
  const checkStates = useMemo(
    () => folderCheckStates(folderTree, filters),
    [folderTree, filters],
  );
  const displayStates = useMemo(
    () => (albums ? folderDisplayStates(folderTree, new Set(albums.onDisplay)) : null),
    [albums, folderTree],
  );
  const defaultView = useMemo(
    () => new Set(albums?.defaultView ?? []),
    [albums],
  );
  // Folders the user opened or closed; the rest open when partially
  // selected so the deselected albums inside are visible.
  const [expandedOverrides, setExpandedOverrides] = useState<
    ReadonlyMap<string, boolean>
  >(() => new Map());

  const filtersActive = hasAnyFilter(filters);
  const starredCount = facets?.starredCount ?? 0;
  // Viewers see Starred once it has photos; the curator always does.
  const showStarred = starredCount > 0 || (isCurator && curation.session?.enabled === true);

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

  function handleResetAll(): void {
    onFiltersChange(clearFilters(filters));
  }

  function handleLogin(): void {
    const trimmed = pin.trim();
    if (!trimmed) return;
    if (choosingPin) {
      if (trimmed.length < 4 || !setupCode.trim()) return;
      curation.onChoosePin(trimmed, setupCode.trim());
    } else {
      curation.onLogin(trimmed);
    }
    setPin('');
  }

  const curatorTools: CuratorTreeTools | null = displayStates
    ? {
        displayStates,
        defaultView,
        onSetDisplay: curation.onSetDisplay,
        onToggleDefault: curation.onToggleDefault,
      }
    : null;

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
          data-curator={isCurator ? 'true' : 'false'}
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
            {showStarred && (
              <ul className="album-tree" data-testid="controls-starred">
                <li className="album-tree__item">
                  <div className="album-tree__row">
                    <span className="album-tree__disclosure" aria-hidden="true" />
                    <label className="album-tree__label" title="The curator’s favourite photos">
                      <input
                        type="checkbox"
                        className="album-tree__checkbox"
                        data-testid="controls-folder-starred"
                        data-selected={filters.starred ? 'true' : 'false'}
                        checked={filters.starred === true}
                        onChange={() =>
                          onFiltersChange({ ...filters, starred: !filters.starred })
                        }
                      />
                      <span className="album-tree__name">★ Best of</span>
                      <span className="album-tree__count">{starredCount}</span>
                    </label>
                    {albums && (
                      <button
                        type="button"
                        className="album-tree__curate"
                        data-testid="controls-folder-default-starred"
                        data-default={albums.defaultStarred ? 'true' : 'false'}
                        aria-pressed={albums.defaultStarred}
                        aria-label={`${albums.defaultStarred ? 'Stop opening the wall on' : 'Open the wall on'} Best of`}
                        title={
                          albums.defaultStarred
                            ? 'The wall opens on this album. Click to stop.'
                            : 'Open the wall on this album when nothing is picked.'
                        }
                        onClick={curation.onToggleDefaultStarred}
                      >
                        <span aria-hidden="true">⌂</span>
                      </button>
                    )}
                  </div>
                </li>
              </ul>
            )}
            {folderTree.length === 0 ? (
              <p className="controls__hint">
                {curation.session?.enabled && !isCurator
                  ? 'No albums on display yet.'
                  : 'No albums discovered yet.'}
              </p>
            ) : (
              <>
                {filters.folders.length === 0 && !filters.starred && (
                  <p className="controls__hint">
                    {curation.session?.enabled
                      ? 'Nothing picked: the wall shows its default albums.'
                      : 'Nothing picked: the wall shows every album.'}
                  </p>
                )}
                {curatorTools && (
                  <p className="controls__hint">
                    👁 lets guests pick an album; ⌂ makes the wall open on it. In the photo
                    view: ★ puts a photo in Best of, Make private keeps it from guests, Reject
                    moves a bad shot to _hidden.
                  </p>
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
                      curator={curatorTools}
                    />
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="controls__section">
            <header className="controls__section-header">
              <h3 className="controls__section-title">Share</h3>
              <button
                type="button"
                className="controls__link"
                data-testid="controls-share"
                onClick={share.onShare}
                disabled={share.pending}
              >
                Copy link to this view
              </button>
            </header>
            {share.url && (
              <input
                className="controls__create-input controls__share-url"
                data-testid="controls-share-url"
                aria-label="Share link"
                readOnly
                value={share.url}
                onFocus={(e) => e.currentTarget.select()}
              />
            )}
          </section>

          {curation.session && (isCurator || curation.pinEntry) && (
            <section className="controls__section" data-testid="controls-curation">
              <header className="controls__section-header">
                <h3 className="controls__section-title">Curator</h3>
                {isCurator && (
                  <button
                    type="button"
                    className="controls__link"
                    data-testid="controls-curator-logout"
                    onClick={curation.onLogout}
                  >
                    Lock
                  </button>
                )}
              </header>
              {isCurator && curation.session.enabled ? (
                <>
                  <p className="controls__hint">
                    {curation.session.libraryWrites
                      ? 'Rejected photos move into a _hidden folder inside their album; nothing is deleted.'
                      : 'Rejecting photos is off here: the library folder isn’t writable.'}
                  </p>
                  <label className="controls__toggle">
                    <input
                      type="checkbox"
                      data-testid="controls-preview-guest"
                      checked={curation.previewAsGuest}
                      onChange={(e) => curation.onPreviewAsGuestChange(e.target.checked)}
                    />
                    <span>Preview as guest</span>
                  </label>
                  <button
                    type="button"
                    className="controls__link"
                    data-testid="controls-rescan"
                    onClick={curation.onRescan}
                    disabled={curation.rescanPending}
                  >
                    Rescan library
                  </button>
                </>
              ) : (
                <>
                {choosingPin && (
                  <>
                    <p className="controls__hint">
                      Choose a curator PIN (4 or more characters). To prove this is your server,
                      enter the setup code from the server log, also saved as{' '}
                      <code>setup-code</code> in the curation folder.
                    </p>
                    <input
                      className="controls__create-input controls__share-url"
                      data-testid="controls-curator-setup-code"
                      name="controls-curator-setup-code"
                      aria-label="Setup code"
                      placeholder="Setup code"
                      autoComplete="off"
                      value={setupCode}
                      onChange={(e) => setSetupCode(e.target.value)}
                    />
                  </>
                )}
                <div className="controls__create">
                  <input
                    type="password"
                    className="controls__create-input"
                    data-testid="controls-curator-pin"
                    name="controls-curator-pin"
                    aria-label={choosingPin ? 'New curator PIN' : 'Curator PIN'}
                    placeholder={choosingPin ? 'New curator PIN' : 'Curator PIN'}
                    autoComplete={choosingPin ? 'new-password' : 'current-password'}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleLogin();
                    }}
                  />
                  <button
                    type="button"
                    className="controls__create-button"
                    data-testid="controls-curator-login"
                    onClick={handleLogin}
                    disabled={!pin.trim() || curation.loginPending}
                  >
                    {choosingPin ? 'Set PIN' : 'Unlock'}
                  </button>
                </div>
                </>
              )}
            </section>
          )}
        </section>
      )}
    </div>
  );
}

interface CuratorTreeTools {
  displayStates: ReadonlyMap<string, FolderCheckState>;
  defaultView: ReadonlySet<string>;
  onSetDisplay: (folder: string, onDisplay: boolean) => void;
  onToggleDefault: (folder: string) => void;
}

interface AlbumTreeItemProps {
  node: FolderTreeNode;
  depth: number;
  checkStates: ReadonlyMap<string, FolderCheckState>;
  expandedOverrides: ReadonlyMap<string, boolean>;
  onToggle: (path: string) => void;
  onToggleExpanded: (path: string, isExpanded: boolean) => void;
  curator: CuratorTreeTools | null;
}

function AlbumTreeItem(props: AlbumTreeItemProps): JSX.Element {
  const { node, depth, checkStates, expandedOverrides, onToggle, onToggleExpanded, curator } =
    props;
  const displayState = curator?.displayStates.get(node.path);
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
          <span className="album-tree__name" data-hidden-folder={node.hidden ? 'true' : undefined}>
            {node.hidden ? 'Hidden' : node.name}
          </span>
          <span className="album-tree__count">{node.photoCount}</span>
        </label>
        {curator && displayState && (
          <>
            <button
              type="button"
              className="album-tree__curate"
              data-testid={`controls-folder-display-${node.path}`}
              data-display={displayState}
              aria-pressed={displayState === 'all'}
              aria-label={
                displayState === 'all'
                  ? `Put ${node.name} in storage`
                  : `Put ${node.name} on display`
              }
              title={
                displayState === 'all'
                  ? 'On display. Click to put in storage.'
                  : displayState === 'partial'
                    ? 'Partly in storage. Click to put all on display.'
                    : 'In storage. Click to put on display.'
              }
              onClick={() => curator.onSetDisplay(node.path, displayState !== 'all')}
            >
              <EyeIcon state={displayState} />
            </button>
            <button
              type="button"
              className="album-tree__curate"
              data-testid={`controls-folder-default-${node.path}`}
              data-default={curator.defaultView.has(node.path) ? 'true' : 'false'}
              aria-pressed={curator.defaultView.has(node.path)}
              aria-label={`${curator.defaultView.has(node.path) ? 'Stop opening the wall on' : 'Open the wall on'} ${node.name}`}
              title={
                curator.defaultView.has(node.path)
                  ? 'The wall opens on this album. Click to stop.'
                  : 'Open the wall on this album when nothing is picked.'
              }
              onClick={() => curator.onToggleDefault(node.path)}
            >
              <span aria-hidden="true">⌂</span>
            </button>
          </>
        )}
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
              curator={curator}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Open eye: guests can pick it. Faded: partly. Slashed: only the curator sees it. */
function EyeIcon({ state }: { state: FolderCheckState }): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      opacity={state === 'partial' ? 0.6 : 1}
    >
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.8" />
      {state === 'none' && <path d="M4 20 20 4" />}
    </svg>
  );
}
