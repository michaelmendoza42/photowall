import type { FastifyInstance } from 'fastify';
import {
  LIBRARY_FACETS_PATH,
  LIBRARY_STATUS_PATH,
  SNAPSHOT_SCHEMA_VERSION,
  type LibraryFacetsResponse,
  type LibraryStatusResponse,
} from '../../shared/api/library.js';
import type { LibraryService } from '../snapshots/library-service.js';

export async function registerLibraryRoutes(
  app: FastifyInstance,
  service: LibraryService,
): Promise<void> {
  app.get(LIBRARY_STATUS_PATH, async (): Promise<LibraryStatusResponse> => {
    const view = service.getStateView();
    const active = view.active;
    return {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      snapshotId: active?.snapshotId ?? null,
      scanState: view.state,
      libraryRoot: service.getLibraryRoot(),
      dataRoot: service.getDataRoot(),
      photoCount: active?.photoCount ?? 0,
      warningCount: active?.warnings.length ?? 0,
      scannedAt: active?.scannedAt ?? null,
      scanDurationMs: active?.scanDurationMs ?? null,
      lastRescanStartedAt: view.lastRescanStartedAt,
      lastRescanCompletedAt: view.lastRescanCompletedAt,
      lastError: view.lastError,
      warmLoaded: view.warmLoaded,
    };
  });

  app.get(LIBRARY_FACETS_PATH, async (): Promise<LibraryFacetsResponse> => {
    const active = service.getActiveSnapshot();
    return {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      snapshotId: active?.snapshotId ?? null,
      scannedAt: active?.scannedAt ?? null,
      years: active?.years ?? [],
      folders: active?.folders ?? [],
    };
  });
}
