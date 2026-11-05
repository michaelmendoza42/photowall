// Derive the wall's screen state from query results + active filters.
//
// Centralising this decision keeps `WallShell` declarative and makes
// the branch logic unit-testable without a DOM.

import type { LibraryStatusResponse } from '../../../../shared/api/library.js';
import type {
  PhotosQueryResponse,
  PhotosQuerySuccessResponse,
} from '../../../../shared/api/photos.js';
import { hasAnyFilter, type ActiveFilters } from '../../state/filters.js';

export type WallScreenState =
  | { kind: 'loading' }
  | {
      kind: 'config-error';
      message: string;
      status: LibraryStatusResponse | null;
    }
  | { kind: 'scanning'; status: LibraryStatusResponse }
  | { kind: 'empty-library'; status: LibraryStatusResponse }
  | { kind: 'nothing-on-display' }
  | {
      kind: 'no-results';
      status: LibraryStatusResponse;
      filters: ActiveFilters;
    }
  | {
      kind: 'snapshot-changed';
      status: LibraryStatusResponse;
    }
  | {
      kind: 'ready';
      status: LibraryStatusResponse;
      page: PhotosQuerySuccessResponse;
    };

export interface WallScreenStateInput {
  statusQuery: {
    isLoading: boolean;
    error: unknown;
    data: LibraryStatusResponse | undefined;
  };
  photoPageQuery: {
    isLoading: boolean;
    error: unknown;
    data: PhotosQueryResponse | undefined;
  };
  filters: ActiveFilters;
  /**
   * Curation is on and this visitor is a viewer, so an empty wall means
   * the curator has nothing on display yet.
   */
  viewerOfCuratedWall?: boolean;
}

export function deriveWallScreenState(
  input: WallScreenStateInput,
): WallScreenState {
  const { statusQuery, photoPageQuery, filters } = input;

  if (statusQuery.error) {
    return {
      kind: 'config-error',
      message: errorMessage(statusQuery.error),
      status: statusQuery.data ?? null,
    };
  }
  if (statusQuery.isLoading || statusQuery.data === undefined) {
    return { kind: 'loading' };
  }
  const status = statusQuery.data;

  if (status.scanState === 'error') {
    return {
      kind: 'config-error',
      message: status.lastError?.message ?? 'library scan failed',
      status,
    };
  }

  if (
    (status.scanState === 'idle' || status.scanState === 'scanning') &&
    status.photoCount === 0
  ) {
    return { kind: 'scanning', status };
  }

  if (status.scanState === 'ready' && status.photoCount === 0) {
    return { kind: 'empty-library', status };
  }

  if (photoPageQuery.error) {
    return {
      kind: 'config-error',
      message: errorMessage(photoPageQuery.error),
      status,
    };
  }

  if (photoPageQuery.isLoading || photoPageQuery.data === undefined) {
    return { kind: 'loading' };
  }

  const page = photoPageQuery.data;
  if ('error' in page) {
    return { kind: 'snapshot-changed', status };
  }

  if (page.totalMatching === 0) {
    if (hasAnyFilter(filters)) {
      return { kind: 'no-results', status, filters };
    }
    if (input.viewerOfCuratedWall && status.scanState === 'ready') {
      return { kind: 'nothing-on-display' };
    }
    // Filters are empty but the page is empty — this only happens
    // mid-scan when status hasn't refreshed yet. Treat as scanning.
    return { kind: 'scanning', status };
  }

  return { kind: 'ready', status, page };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'unknown error';
}
