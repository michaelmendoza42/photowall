import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  PLAYLISTS_COLLECTION_PATH,
  type PlaylistErrorResponse,
  type PlaylistListResponse,
  type PlaylistRecord,
} from '../../shared/api/playlists.js';
import {
  PlaylistNotFoundError,
  PlaylistValidationError,
  type PlaylistService,
} from '../playlists/service.js';
import type { PersistedPlaylist } from '../playlists/schema.js';

const RESOURCE_PATH = `${PLAYLISTS_COLLECTION_PATH}/:id`;

interface IdParams {
  id: string;
}

export async function registerPlaylistRoutes(
  app: FastifyInstance,
  service: PlaylistService,
): Promise<void> {
  app.get(
    PLAYLISTS_COLLECTION_PATH,
    async (): Promise<PlaylistListResponse> => {
      const records = await service.list();
      return { playlists: records.map(toResponseRecord) };
    },
  );

  app.get(
    RESOURCE_PATH,
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply,
    ): Promise<PlaylistRecord | PlaylistErrorResponse> => {
      const record = await service.get(request.params.id);
      if (!record) {
        reply.code(404);
        return { error: 'playlist_not_found' };
      }
      return toResponseRecord(record);
    },
  );

  app.post(
    PLAYLISTS_COLLECTION_PATH,
    async (
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<PlaylistRecord | PlaylistErrorResponse> => {
      try {
        const record = await service.create(
          (request.body ?? {}) as Parameters<PlaylistService['create']>[0],
        );
        reply.code(201);
        return toResponseRecord(record);
      } catch (err) {
        if (err instanceof PlaylistValidationError) {
          reply.code(400);
          return { error: 'playlist_invalid', detail: err.issues.join('; ') };
        }
        throw err;
      }
    },
  );

  app.patch(
    RESOURCE_PATH,
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply,
    ): Promise<PlaylistRecord | PlaylistErrorResponse> => {
      try {
        const updated = await service.update(
          request.params.id,
          (request.body ?? {}) as Parameters<PlaylistService['update']>[1],
        );
        return toResponseRecord(updated);
      } catch (err) {
        if (err instanceof PlaylistNotFoundError) {
          reply.code(404);
          return { error: 'playlist_not_found' };
        }
        if (err instanceof PlaylistValidationError) {
          reply.code(400);
          return { error: 'playlist_invalid', detail: err.issues.join('; ') };
        }
        throw err;
      }
    },
  );

  app.delete(
    RESOURCE_PATH,
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply,
    ): Promise<PlaylistErrorResponse | null> => {
      try {
        await service.delete(request.params.id);
        reply.code(204);
        return null;
      } catch (err) {
        if (err instanceof PlaylistNotFoundError) {
          reply.code(404);
          return { error: 'playlist_not_found' };
        }
        throw err;
      }
    },
  );
}

function toResponseRecord(record: PersistedPlaylist): PlaylistRecord {
  return {
    id: record.id,
    name: record.name,
    filters: record.filters,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
