import type { FastifyInstance } from 'fastify';
import {
  MEDIA_DIAGNOSTICS_PATH,
  type MediaDiagnostics,
  type MediaDiagnosticsSnapshot,
} from '../media/media-diagnostics.js';
import type { DerivativeService } from '../media/derivative-service.js';
import type { LibraryService } from '../snapshots/library-service.js';

export async function registerMediaDiagnosticsRoute(
  app: FastifyInstance,
  deps: {
    diagnostics: MediaDiagnostics;
    library: LibraryService;
    derivatives: DerivativeService;
  },
): Promise<void> {
  app.get(
    MEDIA_DIAGNOSTICS_PATH,
    (_request, reply): MediaDiagnosticsSnapshot => {
      reply.header('Cache-Control', 'no-store');
      return deps.diagnostics.snapshot({
        library: deps.library,
        derivatives: deps.derivatives,
      });
    },
  );
}
