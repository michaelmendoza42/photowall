import { createReadStream } from 'node:fs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  DEFAULT_MEDIA_FORMAT,
  MEDIA_BASE_PATH,
  mediaContentType,
  type MediaErrorResponse,
  type MediaFormat,
  type MediaVariant,
} from '../../shared/api/media.js';
import type { LibraryService } from '../snapshots/library-service.js';
import type { DerivativeService } from '../media/derivative-service.js';
import type { CurationService } from '../curation/service.js';
import {
  MediaDiagnostics,
  type DiagnosticMediaFormat,
  type DiagnosticMediaVariant,
  type MediaDiagnosticReason,
} from '../media/media-diagnostics.js';
import { registerMediaDiagnosticsRoute } from './media-diagnostics.js';

const QuerySchema = z.object({
  variant: z.enum(['thumb', 'wall', 'modal', 'detail']).default('wall'),
  format: z.enum(['webp', 'jpeg']).default(DEFAULT_MEDIA_FORMAT),
  /** `original` skips the edit; only the curator's editor asks for it. */
  edit: z.enum(['original']).optional(),
});

const ParamsSchema = z.object({
  photoId: z.string().min(1),
});

export async function registerMediaRoutes(
  app: FastifyInstance,
  deps: {
    library: LibraryService;
    derivatives: DerivativeService;
    curation: CurationService;
    diagnostics?: MediaDiagnostics;
  },
): Promise<void> {
  const diagnostics = deps.diagnostics ?? new MediaDiagnostics();

  app.get(
    `${MEDIA_BASE_PATH}/:photoId`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const startedAt = performance.now();
      let variant: DiagnosticMediaVariant = 'unknown';
      let format: DiagnosticMediaFormat = 'unknown';
      let recorded = false;
      const record = (status: 200 | 400 | 404 | 500 | 503, reason: MediaDiagnosticReason): void => {
        if (recorded) return;
        recorded = true;
        diagnostics.record({
          variant,
          format,
          status,
          reason,
          durationMs: performance.now() - startedAt,
        });
      };

      const params = ParamsSchema.safeParse(request.params);
      if (!params.success) {
        record(400, 'invalid_photo_id');
        return sendError(reply, 400, {
          error: 'photo_not_found',
          detail: 'photoId is required',
        });
      }

      const query = QuerySchema.safeParse(request.query ?? {});
      if (!query.success) {
        const detail = query.error.issues
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('; ');
        const offendingPath = query.error.issues[0]?.path[0];
        let code: 'variant_invalid' | 'format_invalid' = 'variant_invalid';
        if (offendingPath === 'format') code = 'format_invalid';
        record(400, code === 'format_invalid' ? 'invalid_format' : 'invalid_variant');
        return sendError(reply, 400, { error: code, detail });
      }

      variant = query.data.variant as MediaVariant;
      format = query.data.format as MediaFormat;

      const snapshot = deps.library.getActiveSnapshot();
      if (!snapshot) {
        record(503, 'snapshot_unavailable');
        return sendError(reply, 503, {
          error: 'snapshot_unavailable',
          detail: 'library snapshot not yet available',
        });
      }

      // Photos this visitor can't see (in storage or hidden) don't exist for them.
      const role = deps.curation.roleOf(request);
      const catalog = deps.curation.catalogFor(role);
      const photo = catalog?.byId.get(params.data.photoId);
      if (!photo) {
        record(404, 'photo_not_found');
        return sendError(reply, 404, { error: 'photo_not_found' });
      }

      const outcome = await deps.derivatives.generate(snapshot, {
        photoId: params.data.photoId,
        variant,
        format,
        ...(photo.edit && !(query.data.edit === 'original' && role === 'curator')
          ? { edit: photo.edit }
          : {}),
      });

      if (!outcome.ok) {
        switch (outcome.failure.kind) {
          case 'photo_not_found':
            record(404, 'photo_not_found');
            return sendError(reply, 404, { error: 'photo_not_found' });
          case 'source_outside_root':
            record(404, 'source_outside_root');
            return sendError(reply, 404, {
              error: 'source_outside_root',
              detail: 'resolved source escaped library root',
            });
          case 'source_unreadable':
            record(404, 'source_unreadable');
            return sendError(reply, 404, {
              error: 'source_unreadable',
              detail: outcome.failure.detail,
            });
          case 'render_failed':
            record(500, 'render_failed');
            return sendError(reply, 500, {
              error: 'render_failed',
              detail: outcome.failure.detail,
            });
          default:
            throw new Error('Unhandled derivative failure');
        }
      }

      reply.header('Content-Type', mediaContentType(format));
      // The cache key folds in source fingerprint, variant and format,
      // so any cached file at this URL is byte-stable for its lifetime.
      // immutable + long max-age is the correct browser caching policy.
      reply.header(
        'Cache-Control',
        'public, max-age=31536000, immutable',
      );
      reply.header('ETag', `"${outcome.cacheKey}"`);
      reply.header(
        'X-Photo-Wall-Cache',
        outcome.fromCache ? 'hit' : 'miss',
      );
      reply.header('X-Photo-Wall-Variant', variant);
      reply.header(
        'Server-Timing',
        `media;dur=${(performance.now() - startedAt).toFixed(1)};desc="${outcome.fromCache ? 'hit' : 'miss'}"`,
      );
      reply.code(200);

      const stream = createReadStream(outcome.filePath);
      stream.once('error', () => record(500, 'delivery_failed'));
      reply.raw.once('finish', () => {
        record(200, outcome.fromCache ? 'success_cache_hit' : 'success_rendered');
      });
      return reply.send(stream);
    },
  );

  await registerMediaDiagnosticsRoute(app, {
    diagnostics,
    library: deps.library,
    derivatives: deps.derivatives,
  });
}

function sendError(
  reply: FastifyReply,
  status: number,
  body: MediaErrorResponse,
): MediaErrorResponse {
  reply.code(status);
  reply.header('Cache-Control', 'no-store');
  return body;
}
