import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  DEFAULT_MEDIA_FORMAT,
  MEDIA_BASE_PATH,
  MEDIA_FORMAT_VALUES,
  MEDIA_VARIANT_VALUES,
  mediaContentType,
  type MediaErrorResponse,
  type MediaFormat,
  type MediaVariant,
} from '../../shared/api/media.js';
import type { LibraryService } from '../snapshots/library-service.js';
import type { DerivativeService } from '../media/derivative-service.js';

const QuerySchema = z.object({
  variant: z.enum(['thumb', 'wall', 'modal']).default('wall'),
  format: z.enum(['webp', 'jpeg']).default(DEFAULT_MEDIA_FORMAT),
});

const ParamsSchema = z.object({
  photoId: z.string().min(1),
});

export async function registerMediaRoutes(
  app: FastifyInstance,
  deps: {
    library: LibraryService;
    derivatives: DerivativeService;
  },
): Promise<void> {
  app.get(
    `${MEDIA_BASE_PATH}/:photoId`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = ParamsSchema.safeParse(request.params);
      if (!params.success) {
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
        const code =
          offendingPath === 'variant'
            ? 'variant_invalid'
            : offendingPath === 'format'
              ? 'format_invalid'
              : 'variant_invalid';
        return sendError(reply, 400, { error: code, detail });
      }

      const variant = query.data.variant as MediaVariant;
      const format = query.data.format as MediaFormat;

      const snapshot = deps.library.getActiveSnapshot();
      if (!snapshot) {
        return sendError(reply, 503, {
          error: 'snapshot_unavailable',
          detail: 'library snapshot not yet available',
        });
      }

      const outcome = await deps.derivatives.generate(snapshot, {
        photoId: params.data.photoId,
        variant,
        format,
      });

      if (!outcome.ok) {
        switch (outcome.failure.kind) {
          case 'photo_not_found':
            return sendError(reply, 404, { error: 'photo_not_found' });
          case 'source_outside_root':
            return sendError(reply, 404, {
              error: 'source_outside_root',
              detail: 'resolved source escaped library root',
            });
          case 'source_unreadable':
            return sendError(reply, 404, {
              error: 'source_unreadable',
              detail: outcome.failure.detail,
            });
          case 'render_failed':
            return sendError(reply, 500, {
              error: 'render_failed',
              detail: outcome.failure.detail,
            });
        }
      }

      const stat = await fs.stat(outcome.filePath);
      reply.header('Content-Type', mediaContentType(format));
      reply.header('Content-Length', stat.size.toString());
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
      reply.code(200);
      return reply.send(createReadStream(outcome.filePath));
    },
  );
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
