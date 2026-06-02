import type { LibraryStatusResponse } from '../../../../shared/api/library.js';
import type { PhotosQuerySuccessResponse } from '../../../../shared/api/photos.js';
import { summarizeFilters, type ActiveFilters } from '../../state/filters.js';

function StateFrame({
  testId,
  eyebrow,
  title,
  children,
}: {
  testId: string;
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <section className="wall__state" data-testid={testId} aria-live="polite">
      <p className="wall__state-eyebrow">{eyebrow}</p>
      <h1 className="wall__state-title">{title}</h1>
      {children}
    </section>
  );
}

export function LoadingState(): JSX.Element {
  return (
    <StateFrame
      testId="wall-state-loading"
      eyebrow="loading"
      title="Reading your library."
    >
      <p className="wall__state-body">
        Connecting to the photo-wall backend and resolving the active
        snapshot.
      </p>
    </StateFrame>
  );
}

export function ConfigErrorState({
  message,
  status,
}: {
  message: string;
  status: LibraryStatusResponse | null;
}): JSX.Element {
  return (
    <StateFrame
      testId="wall-state-config-error"
      eyebrow="library unavailable"
      title="The library could not be opened."
    >
      <p className="wall__state-body">{message}</p>
      {status && (
        <dl className="wall__state-meta">
          <dt>library root</dt>
          <dd>{status.libraryRoot}</dd>
          <dt>data root</dt>
          <dd>{status.dataRoot}</dd>
          <dt>scan state</dt>
          <dd>{status.scanState}</dd>
        </dl>
      )}
    </StateFrame>
  );
}

export function ScanningState({
  status,
}: {
  status: LibraryStatusResponse;
}): JSX.Element {
  return (
    <StateFrame
      testId="wall-state-scanning"
      eyebrow={`scanning · ${status.scanState}`}
      title="Indexing your photos."
    >
      <p className="wall__state-body">
        The scanner is walking the configured library root. The wall will
        appear once at least one photo has been indexed.
      </p>
      <dl className="wall__state-meta">
        <dt>library root</dt>
        <dd>{status.libraryRoot}</dd>
        <dt>discovered so far</dt>
        <dd>{status.photoCount}</dd>
      </dl>
    </StateFrame>
  );
}

export function EmptyLibraryState({
  status,
}: {
  status: LibraryStatusResponse;
}): JSX.Element {
  return (
    <StateFrame
      testId="wall-state-empty"
      eyebrow="library empty"
      title="No photos discovered."
    >
      <p className="wall__state-body">
        The scan finished without finding any supported images under the
        configured library root.
      </p>
      <dl className="wall__state-meta">
        <dt>library root</dt>
        <dd>{status.libraryRoot}</dd>
        <dt>warnings</dt>
        <dd>{status.warningCount}</dd>
      </dl>
    </StateFrame>
  );
}

export function NoResultsState({
  status,
  filters,
}: {
  status: LibraryStatusResponse;
  filters: ActiveFilters;
}): JSX.Element {
  return (
    <StateFrame
      testId="wall-state-no-results"
      eyebrow="no matches"
      title="No photos match the current filters."
    >
      <p className="wall__state-body">
        Clear the active filters or pick a different playlist to widen the
        result set.
      </p>
      <dl className="wall__state-meta">
        <dt>library photo count</dt>
        <dd>{status.photoCount}</dd>
        <dt>active filters</dt>
        <dd>{summarizeFilters(filters)}</dd>
      </dl>
    </StateFrame>
  );
}

export function SnapshotChangedState({
  status,
}: {
  status: LibraryStatusResponse;
}): JSX.Element {
  return (
    <StateFrame
      testId="wall-state-snapshot-changed"
      eyebrow="snapshot replaced"
      title="The library snapshot has changed."
    >
      <p className="wall__state-body">
        The wall reloaded after a rescan. The next photo page will use the
        active snapshot.
      </p>
      <dl className="wall__state-meta">
        <dt>active snapshot</dt>
        <dd>{status.snapshotId ?? '—'}</dd>
      </dl>
    </StateFrame>
  );
}

export function ReadyState({
  status,
  page,
}: {
  status: LibraryStatusResponse;
  page: PhotosQuerySuccessResponse;
}): JSX.Element {
  return (
    <section
      className="wall__ready"
      data-testid="wall-state-ready"
      aria-live="polite"
    >
      <header className="wall__ready-header">
        <span className="wall__ready-brand">photo · wall</span>
        <span className="wall__ready-counts">
          {page.totalMatching.toLocaleString()} photos · snapshot{' '}
          <code>{shortSnapshot(page.snapshotId)}</code>
        </span>
      </header>
      <div className="wall__ready-stage" aria-hidden>
        <p className="wall__ready-stage-note">
          backend data is loaded. The justified-row layout engine arrives in
          the next task; this shell only proves the query pipeline.
        </p>
        <ul className="wall__ready-strip" data-testid="wall-ready-strip">
          {page.photos.slice(0, 18).map((photo) => (
            <li
              key={photo.id}
              className="wall__ready-cell"
              style={{
                aspectRatio: `${photo.width} / ${photo.height}`,
              }}
              title={photo.relativePath}
            />
          ))}
        </ul>
      </div>
      <footer className="wall__ready-footer">
        <span>library root: {status.libraryRoot}</span>
        <span>page size: {page.photos.length}</span>
      </footer>
    </section>
  );
}

function shortSnapshot(id: string): string {
  return id.length > 10 ? `${id.slice(0, 10)}…` : id;
}
