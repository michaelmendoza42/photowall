import { describe, expect, it } from 'vitest';
import type { LibraryStatusResponse } from '../../../../../shared/api/library.js';
import type {
  PhotosQueryResponse,
  PhotosQuerySuccessResponse,
} from '../../../../../shared/api/photos.js';
import { EMPTY_FILTERS } from '../../../state/filters.js';
import { deriveWallScreenState } from '../wallScreenState.js';

function makeStatus(
  partial: Partial<LibraryStatusResponse> = {},
): LibraryStatusResponse {
  return {
    schemaVersion: 1,
    snapshotId: 'snap-1',
    scanState: 'ready',
    libraryRoot: '/photos',
    dataRoot: '/data',
    photoCount: 12,
    warningCount: 0,
    scannedAt: '2026-06-02T00:00:00.000Z',
    scanDurationMs: 100,
    lastRescanStartedAt: null,
    lastRescanCompletedAt: '2026-06-02T00:00:00.000Z',
    lastError: null,
    warmLoaded: false,
    ...partial,
  };
}

function makePage(
  partial: Partial<PhotosQuerySuccessResponse> = {},
): PhotosQuerySuccessResponse {
  return {
    schemaVersion: 1,
    snapshotId: 'snap-1',
    photos: [],
    nextCursor: null,
    totalMatching: 0,
    appliedFilters: { years: [], folders: [], playlistId: null },
    ...partial,
  };
}

const baseInput = {
  filters: EMPTY_FILTERS,
};

describe('deriveWallScreenState', () => {
  it('returns loading while status is fetching', () => {
    const state = deriveWallScreenState({
      ...baseInput,
      statusQuery: { isLoading: true, error: null, data: undefined },
      photoPageQuery: { isLoading: false, error: null, data: undefined },
    });
    expect(state.kind).toBe('loading');
  });

  it('returns config-error when status query fails', () => {
    const state = deriveWallScreenState({
      ...baseInput,
      statusQuery: {
        isLoading: false,
        error: new Error('boom'),
        data: undefined,
      },
      photoPageQuery: { isLoading: false, error: null, data: undefined },
    });
    expect(state.kind).toBe('config-error');
    if (state.kind === 'config-error') {
      expect(state.message).toBe('boom');
    }
  });

  it('returns config-error when status reports scan error', () => {
    const status = makeStatus({
      scanState: 'error',
      lastError: { message: 'EACCES /photos', at: 'now' },
      photoCount: 0,
    });
    const state = deriveWallScreenState({
      ...baseInput,
      statusQuery: { isLoading: false, error: null, data: status },
      photoPageQuery: { isLoading: false, error: null, data: undefined },
    });
    expect(state.kind).toBe('config-error');
    if (state.kind === 'config-error') {
      expect(state.message).toBe('EACCES /photos');
      expect(state.status).toBe(status);
    }
  });

  it('returns scanning when scan is in progress and nothing indexed yet', () => {
    const status = makeStatus({ scanState: 'scanning', photoCount: 0 });
    const state = deriveWallScreenState({
      ...baseInput,
      statusQuery: { isLoading: false, error: null, data: status },
      photoPageQuery: { isLoading: false, error: null, data: undefined },
    });
    expect(state.kind).toBe('scanning');
  });

  it('returns empty-library when scan ready and photoCount is zero', () => {
    const status = makeStatus({ scanState: 'ready', photoCount: 0 });
    const state = deriveWallScreenState({
      ...baseInput,
      statusQuery: { isLoading: false, error: null, data: status },
      photoPageQuery: { isLoading: false, error: null, data: undefined },
    });
    expect(state.kind).toBe('empty-library');
  });

  it('returns no-results when filters are active and page is empty', () => {
    const status = makeStatus();
    const page = makePage({ totalMatching: 0 });
    const state = deriveWallScreenState({
      ...baseInput,
      filters: { years: [1999], folders: [], playlistId: null },
      statusQuery: { isLoading: false, error: null, data: status },
      photoPageQuery: { isLoading: false, error: null, data: page },
    });
    expect(state.kind).toBe('no-results');
  });

  it('returns snapshot-changed when page response carries error', () => {
    const status = makeStatus();
    const page: PhotosQueryResponse = {
      error: 'snapshot_changed',
      reason: 'snapshot_replaced',
      activeSnapshotId: 'snap-2',
    };
    const state = deriveWallScreenState({
      ...baseInput,
      statusQuery: { isLoading: false, error: null, data: status },
      photoPageQuery: { isLoading: false, error: null, data: page },
    });
    expect(state.kind).toBe('snapshot-changed');
  });

  it('returns ready when status and page resolve with data', () => {
    const status = makeStatus({ photoCount: 50 });
    const page = makePage({
      totalMatching: 50,
      photos: [
        {
          id: 'p1',
          relativePath: '2023/a/img.jpg',
          directoryPath: '2023/a',
          filename: 'img.jpg',
          width: 200,
          height: 100,
          aspectRatio: 2,
          fileSize: 1234,
          mtimeMs: 1,
          year: 2023,
          yearSource: 'top-level',
        },
      ],
    });
    const state = deriveWallScreenState({
      ...baseInput,
      statusQuery: { isLoading: false, error: null, data: status },
      photoPageQuery: { isLoading: false, error: null, data: page },
    });
    expect(state.kind).toBe('ready');
    if (state.kind === 'ready') {
      expect(state.page.photos).toHaveLength(1);
    }
  });
});
