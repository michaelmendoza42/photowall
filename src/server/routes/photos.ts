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
import type { CurationService } from '../curation/service.js';
import {
  defaultViewFolders,
  type Catalog,
  type CatalogPhoto,
} from '../curation/catalog.js';
import { decodeCursor, encodeCursor } from '../query/cursor.js';
import { matchesFilters, slicePhotoPage } from '../query/photos.js';

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
  exclude: z.preprocess(toArray, z.array(z.string())).optional(),
  starred: z.enum(['1', 'true']).optional(),
});

function toArray(value: unknown): unknown {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export async function registerPhotoRoutes(
  app: FastifyInstance,
  deps: { library: LibraryService; curation: CurationService },
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
      const catalog = deps.curation.catalogFor(deps.curation.viewRoleOf(request));
      if (!snapshot || !catalog) {
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

      const resolved = resolveFilters({
        years: params.year ?? [],
        folders: params.folder ?? [],
        excludeFolders: params.exclude ?? [],
        defaultFolders: defaultViewFolders(deps.curation.getSettings(), catalog),
        starred: params.starred !== undefined,
        defaultStarred:
          (deps.curation.getSettings()?.defaultStarred ?? false) && catalog.starred.length > 0,
      });

      const slice = slicePhotoPage({
        ...(resolved.starred
          ? { photos: withStarred(catalog, resolved), filters: NO_FILTERS }
          : { photos: catalog.photos, filters: resolved }),
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
 * With nothing picked, the wall shows the curator's default view (when
 * there is one) rather than the whole library.
 */
function resolveFilters(input: {
  years: number[];
  folders: string[];
  excludeFolders: string[];
  defaultFolders: string[];
  starred: boolean;
  defaultStarred: boolean;
}): ResolvedPhotoFilters {
  const nothingPicked =
    input.years.length === 0 && input.folders.length === 0 && !input.starred;
  if (nothingPicked && (input.defaultFolders.length > 0 || input.defaultStarred)) {
    return {
      years: [],
      folders: dedupe(input.defaultFolders),
      excludeFolders: [],
      ...(input.defaultStarred ? { starred: true } : {}),
    };
  }
  return {
    years: dedupe(input.years),
    folders: dedupe(input.folders),
    excludeFolders: dedupe(input.excludeFolders),
    ...(input.starred ? { starred: true } : {}),
  };
}

const NO_FILTERS: ResolvedPhotoFilters = { years: [], folders: [], excludeFolders: [] };

/**
 * The Starred album plus whatever folders are picked, each photo once,
 * in library order. With only Starred picked, just the starred photos.
 */
function withStarred(catalog: Catalog, filters: ResolvedPhotoFilters): CatalogPhoto[] {
  const anyFolderRule = filters.years.length > 0 || filters.folders.length > 0;
  const picked = anyFolderRule
    ? catalog.photos.filter((photo) => matchesFilters(photo, filters))
    : [];
  const byPath = new Map<string, CatalogPhoto>();
  for (const photo of [...picked, ...catalog.starred]) byPath.set(photo.relativePath, photo);
  return [...byPath.values()].sort((a, b) =>
    a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0,
  );
}

function dedupe<T>(values: T[]): T[] {
  return [...new Set(values)];
}
