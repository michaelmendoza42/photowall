import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  LIBRARY_FACETS_PATH,
  LIBRARY_ROOT_PATH,
  LIBRARY_STATUS_PATH,
  SNAPSHOT_SCHEMA_VERSION,
  type LibraryFacetsResponse,
  type LibraryRootUpdateErrorResponse,
  type LibraryRootUpdateRequest,
  type LibraryStatusResponse,
} from '../../shared/api/library.js';
import type { LibraryService } from '../snapshots/library-service.js';
import { DataRootError } from '../snapshots/storage.js';
import { LibraryRootError } from '../snapshots/library-service.js';

export async function registerLibraryRoutes(
  app: FastifyInstance,
  service: LibraryService,
): Promise<void> {
  app.get(LIBRARY_STATUS_PATH, async (): Promise<LibraryStatusResponse> => {
    return buildLibraryStatusResponse(service);
  });

  app.put(
    LIBRARY_ROOT_PATH,
    async (
      req,
      reply,
    ): Promise<LibraryStatusResponse | FastifyReply> => {
      const body = (req.body ?? null) as Partial<LibraryRootUpdateRequest> | null;
      const nextLibraryRoot = body?.libraryRoot?.trim() ?? '';
      if (nextLibraryRoot.length === 0) {
        return reply.code(400).send({
          error: 'library_root_required',
        } satisfies LibraryRootUpdateErrorResponse);
      }

      try {
        await service.updateLibraryRoot(nextLibraryRoot);
        return buildLibraryStatusResponse(service);
      } catch (error) {
        if (error instanceof LibraryRootError) {
          return reply.code(422).send({
            error: 'library_root_invalid',
            detail: error.message,
          } satisfies LibraryRootUpdateErrorResponse);
        }
        if (error instanceof DataRootError) {
          return reply.code(422).send({
            error: 'data_root_invalid',
            detail: error.message,
          } satisfies LibraryRootUpdateErrorResponse);
        }
        throw error;
      }
    },
  );

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

function buildLibraryStatusResponse(
  service: LibraryService,
): LibraryStatusResponse {
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
}
