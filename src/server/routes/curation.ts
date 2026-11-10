import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  CURATION_ALBUM_DISPLAY_PATH,
  CURATION_ALBUMS_PATH,
  CURATION_DEFAULT_VIEW_PATH,
  CURATION_VIP_PIN_PATH,
  CURATION_PIN_PATH,
  CURATION_RESCAN_PATH,
  CURATION_SESSION_PATH,
  FOLDER_PATH_PATTERN,
  SHARES_PATH,
  type AlbumCurationResponse,
  type CurationErrorResponse,
  type CurationSessionResponse,
  FEATURED_FRAME_CHOICES,
  type FeaturedFrameChoice,
  type PhotoFeaturedConflictResponse,
  type PhotoMoveResponse,
} from '../../shared/api/curation.js';
import type { LibraryService } from '../snapshots/library-service.js';
import { toQueryRecord } from '../query/photos.js';
import {
  CurationActionError,
  PhotoMoveError,
  type CurationService,
} from '../curation/service.js';
import { ShareCreateSchema, type ShareService } from '../curation/shares.js';
import type { AlbumSettings } from '../curation/storage.js';
import { PhotoEditSchema } from '../curation/edits.js';
import type { PhotoEditResponse } from '../../shared/api/curation.js';

const FolderSchema = z.string().max(1024).regex(FOLDER_PATH_PATTERN);
const LoginSchema = z.object({ pin: z.string().min(1).max(256) });
const VipPinSchema = z.object({ pin: z.string().trim().min(4).max(256) });
const ChoosePinSchema = z.object({
  pin: z.string().trim().min(4).max(256),
  code: z.string().min(1).max(64),
});
const DisplaySchema = z.object({ folder: FolderSchema, onDisplay: z.boolean() });
const DefaultViewSchema = z.object({
  folders: z.array(FolderSchema).max(256),
  starred: z.boolean().optional(),
});
const StarSchema = z.object({ starred: z.boolean() });
const PrivateSchema = z.object({ private: z.boolean() });
const FeaturedSchema = z.object({
  featured: z.boolean(),
  replace: z.boolean().optional(),
  frame: z.enum(FEATURED_FRAME_CHOICES as [FeaturedFrameChoice, ...FeaturedFrameChoice[]]).optional(),
});
const PhotoParamsSchema = z.object({ photoId: z.string().regex(/^[0-9a-f]{1,64}$/) });
const EditBodySchema = z.object({ edit: PhotoEditSchema });
const ShareParamsSchema = z.object({ id: z.string().min(1).max(64) });

/** Pause before answering a wrong PIN, to slow down guessing. */
const WRONG_PIN_DELAY_MS = 500;

export async function registerCurationRoutes(
  app: FastifyInstance,
  deps: { curation: CurationService; library: LibraryService; shares: ShareService },
): Promise<void> {
  const { curation, library, shares } = deps;

  const sessionView = (request: FastifyRequest): CurationSessionResponse => {
    const role = curation.roleOf(request);
    return {
      enabled: curation.enabled,
      curator: role === 'curator',
      vip: role === 'vip',
      vipPinSet: role === 'curator' && curation.vipPinSet,
      libraryWrites: curation.libraryWrites,
    };
  };

  /** Replies 403/404 and returns false unless the request is the curator's. */
  const requireCurator = (request: FastifyRequest, reply: FastifyReply): boolean => {
    if (!curation.enabled) {
      sendError(reply, 404, { error: 'curation_disabled' });
      return false;
    }
    if (curation.roleOf(request) !== 'curator') {
      sendError(reply, 403, { error: 'curator_required' });
      return false;
    }
    return true;
  };

  app.get(CURATION_SESSION_PATH, async (request) => sessionView(request));

  app.post(CURATION_SESSION_PATH, async (request, reply) => {
    if (!curation.enabled) return sendError(reply, 404, { error: 'curation_disabled' });
    const body = LoginSchema.safeParse(request.body);
    const session = body.success ? await curation.login(body.data.pin) : null;
    if (!session) {
      await new Promise((resolve) => setTimeout(resolve, WRONG_PIN_DELAY_MS));
      return sendError(reply, 401, { error: 'pin_invalid' });
    }
    reply.header('Set-Cookie', session.cookie);
    return {
      enabled: true,
      curator: session.role === 'curator',
      vip: session.role === 'vip',
      vipPinSet: session.role === 'curator' && curation.vipPinSet,
      libraryWrites: curation.libraryWrites,
    } satisfies CurationSessionResponse;
  });

  // First visit to /curate on a server without a PIN: choose one.
  app.post(CURATION_PIN_PATH, async (request, reply) => {
    const body = ChoosePinSchema.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, { error: 'pin_invalid' });
    const cookie = await curation.choosePin(body.data.pin, body.data.code);
    if (cookie === 'already_set') return sendError(reply, 409, { error: 'pin_already_set' });
    if (cookie === 'code_invalid') {
      await new Promise((resolve) => setTimeout(resolve, WRONG_PIN_DELAY_MS));
      return sendError(reply, 401, { error: 'setup_code_invalid' });
    }
    request.log.info('curator PIN chosen');
    reply.header('Set-Cookie', cookie);
    return {
      enabled: true,
      curator: true,
      vip: false,
      vipPinSet: false,
      libraryWrites: curation.libraryWrites,
    } satisfies CurationSessionResponse;
  });

  app.delete(CURATION_SESSION_PATH, async (request, reply) => {
    reply.header('Set-Cookie', curation.logoutCookies());
    return { ...sessionView(request), curator: false, vip: false, vipPinSet: false };
  });

  // The VIP PIN: authorized guests enter it on /vip to see private photos.
  app.put(CURATION_VIP_PIN_PATH, async (request, reply) => {
    if (!requireCurator(request, reply)) return reply;
    const body = VipPinSchema.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, { error: 'vip_pin_invalid' });
    const result = await curation.setVipPin(body.data.pin);
    if (result === 'same_as_curator') {
      return sendError(reply, 409, {
        error: 'vip_pin_invalid',
        detail: 'the VIP PIN must differ from the curator PIN',
      });
    }
    request.log.info('VIP PIN set');
    return sessionView(request);
  });

  app.delete(CURATION_VIP_PIN_PATH, async (request, reply) => {
    if (!requireCurator(request, reply)) return reply;
    await curation.clearVipPin();
    request.log.info('VIP PIN turned off');
    return sessionView(request);
  });

  app.get(CURATION_ALBUMS_PATH, async (request, reply) => {
    if (!requireCurator(request, reply)) return reply;
    return toAlbumResponse(curation.getSettings()!);
  });

  app.put(CURATION_ALBUM_DISPLAY_PATH, async (request, reply) => {
    if (!requireCurator(request, reply)) return reply;
    const body = DisplaySchema.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, { error: 'folder_invalid' });
    return toAlbumResponse(await curation.setDisplay(body.data.folder, body.data.onDisplay));
  });

  app.put(CURATION_DEFAULT_VIEW_PATH, async (request, reply) => {
    if (!requireCurator(request, reply)) return reply;
    const body = DefaultViewSchema.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, { error: 'folder_invalid' });
    return toAlbumResponse(await curation.setDefaultView(body.data.folders, body.data.starred));
  });

  // Photo flags: star (Favorites) and private (never for guests).
  for (const [route, flag, schema] of [
    ['star', 'starred', StarSchema],
    ['private', 'private', PrivateSchema],
  ] as const) {
    app.post(`/api/curation/photos/:photoId/${route}`, async (request, reply) => {
      if (!requireCurator(request, reply)) return reply;
      const params = PhotoParamsSchema.safeParse(request.params);
      const body = schema.safeParse(request.body);
      if (!params.success) return sendError(reply, 404, { error: 'photo_not_found' });
      if (!body.success) return sendError(reply, 400, { error: 'photo_not_found' });
      const on = 'starred' in body.data ? body.data.starred : body.data.private;
      try {
        await curation.setPhotoFlag(params.data.photoId, flag, on);
      } catch (err) {
        return sendMoveError(reply, err);
      }
      const photo = curation.catalogFor('curator')?.byId.get(params.data.photoId);
      if (!photo) return sendError(reply, 404, { error: 'photo_not_found' });
      return { photo: toQueryRecord(photo) };
    });
  }

  // Featured: an album's centerpiece, at most one per folder. Featuring a
  // second photo answers 409 with the current one unless `replace` is set.
  app.post('/api/curation/photos/:photoId/featured', async (request, reply) => {
    if (!requireCurator(request, reply)) return reply;
    const params = PhotoParamsSchema.safeParse(request.params);
    const body = FeaturedSchema.safeParse(request.body);
    if (!params.success) return sendError(reply, 404, { error: 'photo_not_found' });
    if (!body.success) return sendError(reply, 400, { error: 'photo_not_found' });
    let result: Awaited<ReturnType<typeof curation.setFeatured>>;
    try {
      result = await curation.setFeatured(
        params.data.photoId,
        body.data.featured,
        body.data.replace ?? false,
        body.data.frame,
      );
    } catch (err) {
      return sendMoveError(reply, err);
    }
    const catalog = curation.catalogFor('curator');
    if ('current' in result) {
      const current = catalog?.byId.get(result.current.id);
      if (current) {
        const conflict: PhotoFeaturedConflictResponse = {
          error: 'featured_exists',
          current: toQueryRecord(current),
        };
        return reply.code(409).header('Cache-Control', 'no-store').send(conflict);
      }
    }
    const photo = catalog?.byId.get(params.data.photoId);
    if (!photo) return sendError(reply, 404, { error: 'photo_not_found' });
    return { photo: toQueryRecord(photo) };
  });

  for (const action of ['hide', 'restore'] as const) {
    app.post(`/api/curation/photos/:photoId/${action}`, async (request, reply) => {
      if (!requireCurator(request, reply)) return reply;
      const params = PhotoParamsSchema.safeParse(request.params);
      if (!params.success) return sendError(reply, 404, { error: 'photo_not_found' });
      try {
        const result =
          action === 'hide'
            ? await curation.hidePhoto(params.data.photoId)
            : await curation.restorePhoto(params.data.photoId);
        request.log.info(
          { action, photo: result.photo.relativePath },
          'curation moved a photo',
        );
        return {
          photo: toQueryRecord(result.photo),
          snapshotId: result.snapshot.snapshotId,
        } satisfies PhotoMoveResponse;
      } catch (err) {
        return sendMoveError(reply, err);
      }
    });
  }

  // Light edits: the recipe is stored; the original file is never changed,
  // so this works even where the server may not move photos.
  app.put('/api/curation/photos/:photoId/edit', async (request, reply) => {
    if (!requireCurator(request, reply)) return reply;
    const params = PhotoParamsSchema.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, { error: 'photo_not_found' });
    const body = EditBodySchema.safeParse(request.body);
    if (!body.success) {
      return sendError(reply, 400, { error: 'edit_invalid', detail: body.error.message });
    }
    try {
      const photo = await curation.saveEdit(params.data.photoId, body.data.edit);
      request.log.info({ photo: photo.relativePath }, 'curation saved an edit');
      return { photo: toQueryRecord(photo) } satisfies PhotoEditResponse;
    } catch (err) {
      return sendMoveError(reply, err);
    }
  });

  app.delete('/api/curation/photos/:photoId/edit', async (request, reply) => {
    if (!requireCurator(request, reply)) return reply;
    const params = PhotoParamsSchema.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, { error: 'photo_not_found' });
    try {
      const photo = await curation.revertEdit(params.data.photoId);
      request.log.info({ photo: photo.relativePath }, 'curation reverted an edit');
      return { photo: toQueryRecord(photo) } satisfies PhotoEditResponse;
    } catch (err) {
      return sendMoveError(reply, err);
    }
  });

  app.post(CURATION_RESCAN_PATH, async (request, reply) => {
    if (!requireCurator(request, reply)) return reply;
    library.rescan().catch((err) => request.log.error({ err }, 'curator rescan failed'));
    reply.code(202);
    return { started: true };
  });

  app.post(SHARES_PATH, async (request, reply) => {
    const body = ShareCreateSchema.safeParse(request.body);
    if (!body.success) return sendError(reply, 400, { error: 'share_invalid' });
    return shares.create(body.data);
  });

  app.get(`${SHARES_PATH}/:id`, async (request, reply) => {
    const params = ShareParamsSchema.safeParse(request.params);
    const record = params.success ? await shares.get(params.data.id) : null;
    if (!record) return sendError(reply, 404, { error: 'share_not_found' });
    return record;
  });
}

function toAlbumResponse(settings: AlbumSettings): AlbumCurationResponse {
  return {
    onDisplay: settings.onDisplay,
    defaultView: settings.defaultView,
    defaultStarred: settings.defaultStarred,
  };
}

function sendMoveError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof CurationActionError) {
    const status =
      err.code === 'photo_not_found' ? 404 : err.code === 'library_writes_disabled' ? 403 : 409;
    return sendError(reply, status, { error: err.code, detail: err.message });
  }
  if (err instanceof PhotoMoveError) {
    const code =
      err.kind === 'destination_exists'
        ? 'destination_exists'
        : err.kind === 'cross_device'
          ? 'cross_device'
          : 'move_failed';
    return sendError(reply, code === 'move_failed' ? 500 : 409, {
      error: code,
      detail: err.message,
    });
  }
  throw err;
}

function sendError(
  reply: FastifyReply,
  status: number,
  body: CurationErrorResponse,
): FastifyReply {
  return reply.code(status).header('Cache-Control', 'no-store').send(body);
}
