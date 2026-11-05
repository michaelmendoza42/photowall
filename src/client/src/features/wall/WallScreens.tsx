import type { LibraryStatusResponse } from '../../../../shared/api/library.js';
import { LibraryRootEditor } from '../library/LibraryRootEditor.js';
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
  rootChangePending,
  rootChangeError,
  onRootChange,
}: {
  message: string;
  status: LibraryStatusResponse | null;
  rootChangePending?: boolean;
  rootChangeError?: string | null;
  onRootChange: (nextRoot: string) => void;
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
      <LibraryRootEditor
        currentRoot={status?.libraryRoot ?? ''}
        onSubmit={onRootChange}
        pending={rootChangePending}
        errorMessage={rootChangeError}
        title="Choose a readable library root"
        hint="Set the server-visible root path. The local picker can prefill it only when the browser exposes a compatible path."
        submitLabel="Open this root"
      />
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

export function NothingOnDisplayState(): JSX.Element {
  return (
    <StateFrame
      testId="wall-state-nothing-on-display"
      eyebrow="in storage"
      title="Nothing on display yet."
    >
      <p className="wall__state-body">
        Check back soon.
      </p>
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
        Pick other albums to widen the result set.
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
