import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  PHOTOS_PAGE_DEFAULT_LIMIT,
  PHOTOS_PAGE_MAX_LIMIT,
  PHOTOS_QUERY_PATH,
  type PhotosQueryResponse,
  type ResolvedPhotoFilters,
  type SnapshotChangedReason,
} from '../../shared/api/photos.js';
import { SNAPSHOT_SCHEMA_VERSION } from '../../shared/api/library.js';
import type { LibraryService } from '../snapshots/library-service.js';
import type { PlaylistService } from '../playlists/service.js';
import { decodeCursor, encodeCursor } from '../query/cursor.js';
import { slicePhotoPage } from '../query/photos.js';

/**
 * Query-string contract for the paginated photo endpoint.
 *
 * Lists arrive as repeated query keys (e.g. `?year=2023&year=2024`).
 * `z.coerce.number` collapses to a single value when only one is sent
 * — `.preprocess` normalises both shapes into arrays before schema
 * validation.
 */
const PhotosQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PHOTOS_PAGE_MAX_LIMIT)
    .default(PHOTOS_PAGE_DEFAULT_LIMIT),
  year: z.preprocess(toArray, z.array(z.coerce.number().int())).optional(),
  folder: z.preprocess(toArray, z.array(z.string())).optional(),
  playlist: z.string().min(1).optional(),
});

function toArray(value: unknown): unknown {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export async function registerPhotoRoutes(
  app: FastifyInstance,
  deps: { library: LibraryService; playlists: PlaylistService },
): Promise<void> {
  app.get(
    PHOTOS_QUERY_PATH,
    async (
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<PhotosQueryResponse> => {
      const startedAt = performance.now();
      const parsed = PhotosQuerySchema.safeParse(request.query ?? {});
      if (!parsed.success) {
        reply.code(400);
        return {
          error: 'snapshot_changed',
          reason: 'cursor_invalid',
          activeSnapshotId:
            deps.library.getActiveSnapshot()?.snapshotId ?? null,
        };
      }
      const params = parsed.data;

      const snapshot = deps.library.getActiveSnapshot();
      if (!snapshot) {
        // No snapshot means there's nothing for a cursor to resume
        // against either, so failing fast is correct.
        return snapshotChanged(reply, 'snapshot_missing', null);
      }

      let afterRelativePath: string | null = null;
      let afterId: string | null = null;
      if (params.cursor !== undefined) {
        const decoded = decodeCursor(params.cursor);
        if (!decoded.ok) {
          return snapshotChanged(reply, 'cursor_invalid', snapshot.snapshotId);
        }
        if (decoded.cursor.s !== snapshot.snapshotId) {
          return snapshotChanged(
            reply,
            'snapshot_replaced',
            snapshot.snapshotId,
          );
        }
        afterRelativePath = decoded.cursor.p;
        afterId = decoded.cursor.i;
      }

      const resolved = await resolveFilters(deps.playlists, {
        years: params.year ?? [],
        folders: params.folder ?? [],
        playlistId: params.playlist ?? null,
      });

      const slice = slicePhotoPage({
        photos: snapshot.photos,
        filters: resolved,
        afterRelativePath,
        afterId,
        limit: params.limit,
      });
      reply.header(
        'Server-Timing',
        `photos;dur=${(performance.now() - startedAt).toFixed(1)}`,
      );

      const nextCursor =
        slice.exhausted || slice.lastTuple === null
          ? null
          : encodeCursor({
              s: snapshot.snapshotId,
              p: slice.lastTuple.relativePath,
              i: slice.lastTuple.id,
            });

      return {
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        snapshotId: snapshot.snapshotId,
        photos: slice.photos,
        nextCursor,
        totalMatching: slice.totalMatching,
        appliedFilters: resolved,
      };
    },
  );
}

function snapshotChanged(
  reply: FastifyReply,
  reason: SnapshotChangedReason,
  activeSnapshotId: string | null,
): PhotosQueryResponse {
  reply.code(409);
  return {
    error: 'snapshot_changed',
    reason,
    activeSnapshotId,
  };
}

/**
 * Resolve playlist + inline filters into the final filter set.
 *
 * Missing or invalid playlists do NOT crash the request; they resolve
 * to an empty saved filter, which preserves any inline filters the
 * client also sent. The applied filter set is echoed back so the
 * client can detect this case.
 */
async function resolveFilters(
  playlists: PlaylistService,
  input: { years: number[]; folders: string[]; playlistId: string | null },
): Promise<ResolvedPhotoFilters> {
  let savedYears: number[] = [];
  let savedFolders: string[] = [];
  let resolvedPlaylistId: string | null = null;

  if (input.playlistId !== null) {
    const playlist = await playlists.get(input.playlistId);
    if (playlist) {
      resolvedPlaylistId = playlist.id;
      savedYears = playlist.filters.years;
      savedFolders = playlist.filters.folders;
    }
  }

  return {
    playlistId: resolvedPlaylistId,
    years: mergeFilterAxis(savedYears, input.years),
    folders: mergeFilterAxis(savedFolders, input.folders),
  };
}

/**
 * Merge a saved-preset axis with an inline-request axis.
 *
 * Semantics: if both sides are non-empty the result is their
 * intersection (so the inline filter can only narrow, never widen,
 * the saved preset). If only one side is non-empty, that side wins.
 */
function mergeFilterAxis<T extends string | number>(
  saved: T[],
  inline: T[],
): T[] {
  if (saved.length === 0) return dedupe(inline);
  if (inline.length === 0) return dedupe(saved);
  const inlineSet = new Set(inline);
  return dedupe(saved.filter((v) => inlineSet.has(v)));
}

function dedupe<T>(values: T[]): T[] {
  return [...new Set(values)];
}
