import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CURATION_ALBUM_DISPLAY_PATH,
  CURATION_DEFAULT_VIEW_PATH,
  CURATION_VIP_PIN_PATH,
  CURATION_PIN_PATH,
  CURATION_SESSION_PATH,
  SHARES_PATH,
  VIEW_AS_GUEST,
  VIEW_AS_HEADER,
  curationPhotoFeaturedPath,
  curationPhotoFramePath,
  CURATION_DISPLAY_PATH,
  curationPhotoHidePath,
  curationPhotoRestorePath,
  curationPhotoPrivatePath,
  curationPhotoStarPath,
  type CurationSessionResponse,
  type PhotoMoveResponse,
  type ShareRecord,
} from '../../../shared/api/curation.js';
import { LIBRARY_FACETS_PATH, type LibraryFacetsResponse } from '../../../shared/api/library.js';
import { MEDIA_BASE_PATH } from '../../../shared/api/media.js';
import {
  NEUTRAL_EDIT,
  curationPhotoEditPath,
  type PhotoEdit,
} from '../../../shared/api/edits.js';
import type { PhotoEditResponse } from '../../../shared/api/curation.js';
import sharp from 'sharp';
import {
  PHOTOS_QUERY_PATH,
  type PhotosQuerySuccessResponse,
} from '../../../shared/api/photos.js';
import { DerivativeService } from '../../media/derivative-service.js';
import { registerCurationRoutes } from '../../routes/curation.js';
import { registerLibraryRoutes } from '../../routes/library.js';
import { registerMediaRoutes } from '../../routes/media.js';
import { registerPhotoRoutes } from '../../routes/photos.js';
import { LibraryService } from '../../snapshots/library-service.js';
import { isCompanionFile, movePhoto, PhotoMoveError } from '../mover.js';
import { CurationService } from '../service.js';
import { ShareService } from '../shares.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const smokeRoot = path.resolve(here, '..', '..', '..', '..', 'fixtures', 'library-smoke');
const PIN = '2468';
const WEDDING = '2024/wedding-anna';

let libraryRoot: string;
let dataRoot: string;

beforeEach(async () => {
  libraryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-wall-curation-lib-'));
  dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-wall-curation-data-'));
  await fs.cp(smokeRoot, libraryRoot, { recursive: true });
});

afterEach(async () => {
  await fs.rm(libraryRoot, { recursive: true, force: true });
  await fs.rm(dataRoot, { recursive: true, force: true });
});

async function exists(file: string): Promise<boolean> {
  return fs.access(file).then(
    () => true,
    () => false,
  );
}

describe('movePhoto', () => {
  it('recognizes companion files by name stem', () => {
    expect(isCompanionFile('IMG_1.jpg', 'IMG_1.mov')).toBe(true);
    expect(isCompanionFile('IMG_1.jpg', 'IMG_1.xmp')).toBe(true);
    expect(isCompanionFile('IMG_1.jpg', 'IMG_1.jpg.xmp')).toBe(true);
    expect(isCompanionFile('IMG_1.jpg', 'IMG_1.CR2')).toBe(true);
    // Another photo the wall shows is not a companion.
    expect(isCompanionFile('IMG_1.jpg', 'IMG_1.png')).toBe(false);
    expect(isCompanionFile('IMG_1.jpg', 'IMG_10.mov')).toBe(false);
    expect(isCompanionFile('IMG_1.jpg', '.IMG_1.mov')).toBe(false);
  });

  it('moves a photo and its companions into _hidden and back', async () => {
    const album = path.join(libraryRoot, WEDDING);
    await fs.writeFile(path.join(album, 'img_001.mov'), 'live');
    await fs.writeFile(path.join(album, 'img_001.jpg.xmp'), 'edits');

    const hidden = await movePhoto({
      libraryRoot,
      relativePath: `${WEDDING}/img_001.jpg`,
      toDirectory: `${WEDDING}/_hidden`,
    });
    expect(hidden.photoPath).toBe(`${WEDDING}/_hidden/img_001.jpg`);
    expect(hidden.files.map(([, to]) => to)).toEqual([
      `${WEDDING}/_hidden/img_001.jpg`,
      `${WEDDING}/_hidden/img_001.jpg.xmp`,
      `${WEDDING}/_hidden/img_001.mov`,
    ]);
    expect(await exists(path.join(album, 'img_001.jpg'))).toBe(false);
    expect(await exists(path.join(album, '_hidden', 'img_001.mov'))).toBe(true);
    // Other photos stay put.
    expect(await exists(path.join(album, 'img_002.jpg'))).toBe(true);

    await movePhoto({
      libraryRoot,
      relativePath: `${WEDDING}/_hidden/img_001.jpg`,
      toDirectory: WEDDING,
    });
    expect(await exists(path.join(album, 'img_001.jpg'))).toBe(true);
    expect(await exists(path.join(album, 'img_001.mov'))).toBe(true);
    expect(await exists(path.join(album, 'img_001.jpg.xmp'))).toBe(true);
  });

  it('refuses to overwrite and moves nothing when a destination exists', async () => {
    const album = path.join(libraryRoot, WEDDING);
    await fs.writeFile(path.join(album, 'img_001.mov'), 'live');
    await fs.mkdir(path.join(album, '_hidden'));
    await fs.writeFile(path.join(album, '_hidden', 'img_001.mov'), 'other');

    await expect(
      movePhoto({
        libraryRoot,
        relativePath: `${WEDDING}/img_001.jpg`,
        toDirectory: `${WEDDING}/_hidden`,
      }),
    ).rejects.toMatchObject({ kind: 'destination_exists' } satisfies Partial<PhotoMoveError>);
    expect(await exists(path.join(album, 'img_001.jpg'))).toBe(true);
    expect(await fs.readFile(path.join(album, '_hidden', 'img_001.mov'), 'utf8')).toBe('other');
  });

  it('refuses paths outside the library', async () => {
    await expect(
      movePhoto({ libraryRoot, relativePath: '../escape.jpg', toDirectory: 'x' }),
    ).rejects.toMatchObject({ kind: 'source_invalid' });
  });
});

describe('two servers sharing one curation folder', () => {
  it('see each other\'s album changes and never undo them', async () => {
    const library = new LibraryService({ libraryRoot, dataRoot });
    await library.initialize();
    await library.rescan();
    const open = async () => {
      const curation = new CurationService({
        library,
        curationRoot: path.join(dataRoot, 'shared-curation'),
        curatorPin: PIN,
        libraryWrites: false,
      });
      await curation.initialize();
      return curation;
    };
    const dev = await open();
    const prod = await open();

    await dev.setDisplay(WEDDING, true);
    await prod.refreshIfChanged();
    expect(prod.getSettings()!.onDisplay).toEqual([WEDDING]);

    // prod's change starts from dev's latest instead of its own old copy.
    await prod.setDisplay('2023', true);
    await dev.setDefaultView([WEDDING]);
    const final = dev.getSettings()!;
    expect(final.onDisplay).toEqual(['2023', '2023/birthday-leo', WEDDING]);
    expect(final.defaultView).toEqual([WEDDING]);
  });
});

describe('curation routes', () => {
  let library: LibraryService;
  let app: FastifyInstance;

  async function start(options: { pin: string | null; libraryWrites: boolean }) {
    library = new LibraryService({ libraryRoot, dataRoot });
    await library.initialize();
    await library.rescan();
    const curation = new CurationService({
      library,
      curationRoot: path.join(dataRoot, 'curation'),
      curatorPin: options.pin,
      libraryWrites: options.libraryWrites,
    });
    await curation.initialize();
    app = Fastify({ logger: false });
    await registerLibraryRoutes(app, library, curation);
    await registerCurationRoutes(app, {
      curation,
      library,
      shares: new ShareService(curation.getPaths().sharesDir),
    });
    await registerPhotoRoutes(app, { library, curation });
    await registerMediaRoutes(app, {
      library,
      curation,
      derivatives: new DerivativeService({ cacheRoot: library.getCacheDir() }),
    });
  }

  afterEach(async () => {
    await app?.close();
  });

  async function login(): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: CURATION_SESSION_PATH,
      payload: { pin: PIN },
    });
    expect(res.statusCode).toBe(200);
    return String(res.headers['set-cookie']).split(';')[0]!;
  }

  async function photos(cookie?: string, query = ''): Promise<PhotosQuerySuccessResponse> {
    const res = await app.inject({
      method: 'GET',
      url: `${PHOTOS_QUERY_PATH}?${query}`,
      headers: cookie ? { cookie } : {},
    });
    expect(res.statusCode).toBe(200);
    return res.json() as PhotosQuerySuccessResponse;
  }

  async function curatorPut(cookie: string, url: string, payload: unknown) {
    return app.inject({ method: 'PUT', url, payload: payload as object, headers: { cookie } });
  }

  it('with curation off, shows everything outside _hidden and has no curator', async () => {
    await fs.mkdir(path.join(libraryRoot, WEDDING, '_hidden'));
    await fs.rename(
      path.join(libraryRoot, WEDDING, 'img_001.jpg'),
      path.join(libraryRoot, WEDDING, '_hidden', 'img_001.jpg'),
    );
    await start({ pin: null, libraryWrites: true });

    const session = await app.inject({ method: 'GET', url: CURATION_SESSION_PATH });
    expect(session.json()).toEqual({
      enabled: false,
      curator: false,
      vip: false,
      vipPinSet: false,
      libraryWrites: false,
      display: { spacing: 'none', lightboxFrames: false, randomFrames: 'standard' },
    });
    expect((await photos()).totalMatching).toBe(4);
    // Even asked for directly, viewers never get hidden photos.
    expect((await photos(undefined, `folder=${WEDDING}/_hidden`)).totalMatching).toBe(0);
    const login = await app.inject({
      method: 'POST',
      url: CURATION_SESSION_PATH,
      payload: { pin: PIN },
    });
    expect(login.statusCode).toBe(404);
  });

  it('keeps new albums in storage until the curator puts them on display', async () => {
    await start({ pin: PIN, libraryWrites: false });

    expect((await photos()).totalMatching).toBe(0);
    const wrong = await app.inject({
      method: 'POST',
      url: CURATION_SESSION_PATH,
      payload: { pin: 'nope' },
    });
    expect(wrong.statusCode).toBe(401);
    const forbidden = await app.inject({
      method: 'PUT',
      url: CURATION_ALBUM_DISPLAY_PATH,
      payload: { folder: '2024', onDisplay: true },
    });
    expect(forbidden.statusCode).toBe(403);

    const cookie = await login();
    expect((await photos(cookie)).totalMatching).toBe(5);

    const shown = await curatorPut(cookie, CURATION_ALBUM_DISPLAY_PATH, {
      folder: '2024',
      onDisplay: true,
    });
    expect(shown.json()).toMatchObject({
      onDisplay: ['2024', '2024/travel-iceland', WEDDING],
    });
    const viewer = await photos();
    expect(viewer.totalMatching).toBe(4);
    expect(viewer.photos.every((p) => p.relativePath.startsWith('2024/'))).toBe(true);

    const facets = (
      await app.inject({ method: 'GET', url: LIBRARY_FACETS_PATH })
    ).json() as LibraryFacetsResponse;
    expect(facets.folders.map((f) => f.path)).not.toContain('2023/birthday-leo');

    // A stored album's media is not served to viewers.
    const stored = (await photos(cookie, 'folder=2023')).photos[0]!;
    const media = await app.inject({
      method: 'GET',
      url: `${MEDIA_BASE_PATH}/${stored.id}?variant=thumb`,
    });
    expect(media.statusCode).toBe(404);

    await curatorPut(cookie, CURATION_ALBUM_DISPLAY_PATH, { folder: WEDDING, onDisplay: false });
    expect((await photos()).totalMatching).toBe(1);
  });

  it('builds the Starred album from starred photos, even in stored albums', async () => {
    await start({ pin: PIN, libraryWrites: true });
    const cookie = await login();
    // Only 2024 on display; 2023 stays in storage.
    await curatorPut(cookie, CURATION_ALBUM_DISPLAY_PATH, { folder: '2024', onDisplay: true });
    const stored = (await photos(cookie, 'folder=2023')).photos[0]!;
    const shown = (await photos(cookie, `folder=${WEDDING}`)).photos[0]!;
    const star = (id: string, starred: boolean, withCookie = cookie) =>
      app.inject({
        method: 'POST',
        url: curationPhotoStarPath(id),
        payload: { starred },
        headers: withCookie ? { cookie: withCookie } : {},
      });
    expect((await star(stored.id, true, '')).statusCode).toBe(403);
    const starred = await star(stored.id, true);
    expect(starred.statusCode).toBe(200);
    expect(starred.json()).toMatchObject({ photo: { id: stored.id, starred: true } });
    await star(shown.id, true);

    // Viewers get exactly the starred photos, the stored album's included.
    const album = await photos(undefined, 'starred=1');
    expect(album.photos.map((p) => p.id).sort()).toEqual([shown.id, stored.id].sort());
    expect(album.photos.every((p) => p.starred)).toBe(true);
    expect(album.appliedFilters.starred).toBe(true);
    // ...without the stored album showing up in the picker,
    const facets = (
      await app.inject({ method: 'GET', url: LIBRARY_FACETS_PATH })
    ).json() as LibraryFacetsResponse;
    expect(facets.starredCount).toBe(2);
    expect(facets.folders.map((f) => f.path)).not.toContain('2023/birthday-leo');
    // ...and its photo's media loads for them.
    const media = await app.inject({
      method: 'GET',
      url: `${MEDIA_BASE_PATH}/${stored.id}?variant=thumb`,
    });
    expect(media.statusCode).toBe(200);

    // Mixed with an album: each photo once.
    const mixed = await photos(undefined, `starred=1&folder=${WEDDING}`);
    expect(mixed.totalMatching).toBe(4);

    // Starred can be the default view.
    await curatorPut(cookie, CURATION_DEFAULT_VIEW_PATH, { folders: [], starred: true });
    const byDefault = await photos();
    expect(byDefault.totalMatching).toBe(2);
    expect(byDefault.appliedFilters).toMatchObject({ folders: [], starred: true });

    // Hiding a starred photo takes it out of Starred; restoring brings it back.
    const hidden = (
      (
        await app.inject({
          method: 'POST',
          url: curationPhotoHidePath(shown.id),
          payload: {},
          headers: { cookie },
        })
      ).json() as PhotoMoveResponse
    ).photo;
    expect((await photos(undefined, 'starred=1')).totalMatching).toBe(1);
    await app.inject({
      method: 'POST',
      url: curationPhotoRestorePath(hidden.id),
      payload: {},
      headers: { cookie },
    });
    expect((await photos(undefined, 'starred=1')).totalMatching).toBe(2);

    await star(stored.id, false);
    expect((await photos(undefined, 'starred=1')).photos.map((p) => p.id)).toEqual([shown.id]);
  });

  it('keeps private photos from guests, even in Favorites, without moving them', async () => {
    await start({ pin: PIN, libraryWrites: true });
    const cookie = await login();
    await curatorPut(cookie, CURATION_ALBUM_DISPLAY_PATH, { folder: '', onDisplay: true });
    const target = (await photos(cookie, `folder=${WEDDING}`)).photos[0]!;
    const flag = (route: (id: string) => string, body: object, withCookie = cookie) =>
      app.inject({
        method: 'POST',
        url: route(target.id),
        payload: body,
        headers: withCookie ? { cookie: withCookie } : {},
      });
    expect((await flag(curationPhotoPrivatePath, { private: true }, '')).statusCode).toBe(403);
    const made = await flag(curationPhotoPrivatePath, { private: true });
    expect(made.json()).toMatchObject({ photo: { id: target.id, private: true } });
    await flag(curationPhotoStarPath, { starred: true });

    // Guests: gone from its album, from Favorites, and from media.
    expect((await photos(undefined, `folder=${WEDDING}`)).photos.map((p) => p.id)).not.toContain(
      target.id,
    );
    expect((await photos(undefined, 'starred=1')).totalMatching).toBe(0);
    const media = await app.inject({
      method: 'GET',
      url: `${MEDIA_BASE_PATH}/${target.id}?variant=thumb`,
    });
    expect(media.statusCode).toBe(404);
    // The curator still sees it, marked, and the file never moved.
    const mine = (await photos(cookie, `folder=${WEDDING}`)).photos.find((p) => p.id === target.id);
    expect(mine).toMatchObject({ private: true, starred: true });
    expect(await exists(path.join(libraryRoot, target.relativePath))).toBe(true);

    // Privacy follows the photo through reject and restore.
    const rejected = (
      (
        await app.inject({
          method: 'POST',
          url: curationPhotoHidePath(target.id),
          payload: {},
          headers: { cookie },
        })
      ).json() as PhotoMoveResponse
    ).photo;
    await app.inject({
      method: 'POST',
      url: curationPhotoRestorePath(rejected.id),
      payload: {},
      headers: { cookie },
    });
    expect((await photos(cookie, `folder=${WEDDING}`)).photos.find((p) => p.id === target.id))
      .toMatchObject({ private: true });

    await flag(curationPhotoPrivatePath, { private: false });
    expect((await photos(undefined, 'starred=1')).photos.map((p) => p.id)).toEqual([target.id]);
  });

  it('shows private photos in place to authorized guests until the VIP PIN changes', async () => {
    await start({ pin: PIN, libraryWrites: false });
    const cookie = await login();
    await curatorPut(cookie, CURATION_ALBUM_DISPLAY_PATH, { folder: WEDDING, onDisplay: true });
    const target = (await photos(cookie, `folder=${WEDDING}`)).photos[0]!;
    await app.inject({
      method: 'POST',
      url: curationPhotoPrivatePath(target.id),
      payload: { private: true },
      headers: { cookie },
    });
    await app.inject({
      method: 'POST',
      url: curationPhotoStarPath(target.id),
      payload: { starred: true },
      headers: { cookie },
    });
    const enter = (pin: string) =>
      app.inject({ method: 'POST', url: CURATION_SESSION_PATH, payload: { pin } });

    // No VIP PIN yet, and only the curator may set one, never equal to the curator PIN.
    expect((await enter('1357')).statusCode).toBe(401);
    expect((await curatorPut('', CURATION_VIP_PIN_PATH, { pin: '1357' })).statusCode).toBe(403);
    expect((await curatorPut(cookie, CURATION_VIP_PIN_PATH, { pin: PIN })).statusCode).toBe(409);
    const set = await curatorPut(cookie, CURATION_VIP_PIN_PATH, { pin: '1357' });
    expect(set.json()).toMatchObject({ curator: true, vipPinSet: true });

    const entered = await enter('1357');
    expect(entered.json()).toMatchObject({ curator: false, vip: true, vipPinSet: false });
    const vip = String(entered.headers['set-cookie']).split(';')[0]!;

    // The authorized guest sees the private photo in its album, in Best of and as media...
    const ids = async (who: string | undefined, query: string) =>
      (await photos(who, query)).photos.map((p) => p.id);
    expect(await ids(vip, `folder=${WEDDING}`)).toContain(target.id);
    expect(await ids(vip, 'starred=1')).toEqual([target.id]);
    const media = (who: string) =>
      app.inject({
        method: 'GET',
        url: `${MEDIA_BASE_PATH}/${target.id}?variant=thumb`,
        headers: { cookie: who },
      });
    expect((await media(vip)).statusCode).toBe(200);
    // ...but only open albums, and no curator tools.
    expect((await photos(vip)).totalMatching).toBe((await photos(cookie, `folder=${WEDDING}`)).totalMatching);
    expect((await curatorPut(vip, CURATION_ALBUM_DISPLAY_PATH, { folder: '', onDisplay: true })).statusCode).toBe(403);
    // A plain guest still doesn't see it.
    expect(await ids(undefined, `folder=${WEDDING}`)).not.toContain(target.id);

    // Changing the PIN signs the old browser out; turning it off signs everyone out.
    await curatorPut(cookie, CURATION_VIP_PIN_PATH, { pin: '8642' });
    expect(await ids(vip, `folder=${WEDDING}`)).not.toContain(target.id);
    const again = String((await enter('8642')).headers['set-cookie']).split(';')[0]!;
    expect(await ids(again, `folder=${WEDDING}`)).toContain(target.id);
    const off = await app.inject({
      method: 'DELETE',
      url: CURATION_VIP_PIN_PATH,
      headers: { cookie },
    });
    expect((off.json() as CurationSessionResponse).vipPinSet).toBe(false);
    expect(await ids(again, `folder=${WEDDING}`)).not.toContain(target.id);
    expect((await enter('8642')).statusCode).toBe(401);
  });

  it('lets the curator preview the wall as a guest without losing curator powers', async () => {
    await start({ pin: PIN, libraryWrites: false });
    const cookie = await login();
    await curatorPut(cookie, CURATION_ALBUM_DISPLAY_PATH, { folder: '2024', onDisplay: true });
    const asGuest = (query = '') =>
      app.inject({
        method: 'GET',
        url: `${PHOTOS_QUERY_PATH}?${query}`,
        headers: { cookie, [VIEW_AS_HEADER]: VIEW_AS_GUEST },
      });
    // The guest view: only the open album, like a real guest.
    expect(((await asGuest()).json() as PhotosQuerySuccessResponse).totalMatching).toBe(
      (await photos()).totalMatching,
    );
    expect((await photos(cookie)).totalMatching).toBe(5);
    const facets = await app.inject({
      method: 'GET',
      url: LIBRARY_FACETS_PATH,
      headers: { cookie, [VIEW_AS_HEADER]: VIEW_AS_GUEST },
    });
    expect((facets.json() as LibraryFacetsResponse).folders.map((f) => f.path)).not.toContain(
      '2023/birthday-leo',
    );
    // ...while still allowed to curate.
    const change = await app.inject({
      method: 'PUT',
      url: CURATION_ALBUM_DISPLAY_PATH,
      payload: { folder: '2023', onDisplay: true },
      headers: { cookie, [VIEW_AS_HEADER]: VIEW_AS_GUEST },
    });
    expect(change.statusCode).toBe(200);
    expect(((await asGuest()).json() as PhotosQuerySuccessResponse).totalMatching).toBe(5);
    // A guest can't use the header to see more than a guest.
    const sneaky = await app.inject({
      method: 'GET',
      url: PHOTOS_QUERY_PATH,
      headers: { [VIEW_AS_HEADER]: 'curator' },
    });
    expect((sneaky.json() as PhotosQuerySuccessResponse).totalMatching).toBe(5);
  });

  it('shows the default view when nothing is picked', async () => {
    await start({ pin: PIN, libraryWrites: false });
    const cookie = await login();
    await curatorPut(cookie, CURATION_ALBUM_DISPLAY_PATH, { folder: '', onDisplay: true });
    await curatorPut(cookie, CURATION_DEFAULT_VIEW_PATH, { folders: [WEDDING] });

    const byDefault = await photos();
    expect(byDefault.totalMatching).toBe(3);
    expect(byDefault.appliedFilters.folders).toEqual([WEDDING]);
    // Picking albums overrides the default view.
    expect((await photos(undefined, 'folder=2023')).totalMatching).toBe(1);
  });

  it('hides a photo by moving it, and restores it', async () => {
    await start({ pin: PIN, libraryWrites: true });
    const cookie = await login();
    await curatorPut(cookie, CURATION_ALBUM_DISPLAY_PATH, { folder: '', onDisplay: true });
    const target = (await photos(cookie, `folder=${WEDDING}`)).photos[0]!;

    const hide = await app.inject({
      method: 'POST',
      url: curationPhotoHidePath(target.id),
      payload: {},
      headers: { cookie },
    });
    expect(hide.statusCode).toBe(200);
    const hidden = (hide.json() as PhotoMoveResponse).photo;
    expect(hidden.relativePath).toBe(`${WEDDING}/_hidden/${target.filename}`);
    expect(await exists(path.join(libraryRoot, hidden.relativePath))).toBe(true);
    expect(await exists(path.join(libraryRoot, target.relativePath))).toBe(false);

    // Gone for viewers, in its _hidden folder for the curator.
    expect((await photos(undefined, `folder=${WEDDING}`)).totalMatching).toBe(2);
    expect((await photos(cookie, `folder=${WEDDING}`)).totalMatching).toBe(2);
    expect((await photos(cookie, `folder=${WEDDING}/_hidden`)).totalMatching).toBe(1);
    const log = await fs.readFile(path.join(dataRoot, 'curation', 'moves.log'), 'utf8');
    expect(JSON.parse(log.trim())).toMatchObject({ action: 'hide' });

    // The snapshot on disk already knows about the move.
    const reloaded = new LibraryService({ libraryRoot, dataRoot });
    await reloaded.initialize();
    expect(reloaded.getActiveSnapshot()!.photos.map((p) => p.relativePath)).toContain(
      hidden.relativePath,
    );

    const restore = await app.inject({
      method: 'POST',
      url: curationPhotoRestorePath(hidden.id),
      payload: {},
      headers: { cookie },
    });
    expect(restore.statusCode).toBe(200);
    expect((restore.json() as PhotoMoveResponse).photo.id).toBe(target.id);
    expect((await photos(undefined, `folder=${WEDDING}`)).totalMatching).toBe(3);
  });

  it('features one photo per album, asking before replacing the current one', async () => {
    await start({ pin: PIN, libraryWrites: true });
    const cookie = await login();
    await curatorPut(cookie, CURATION_ALBUM_DISPLAY_PATH, { folder: '', onDisplay: true });
    const [first, second] = (await photos(cookie, `folder=${WEDDING}`)).photos;
    const other = (await photos(cookie, 'folder=2023')).photos[0]!;
    const feature = (id: string, featured: boolean, replace?: boolean, withCookie = cookie) =>
      app.inject({
        method: 'POST',
        url: curationPhotoFeaturedPath(id),
        payload: { featured, ...(replace === undefined ? {} : { replace }) },
        headers: withCookie ? { cookie: withCookie } : {},
      });
    const featuredIds = async (query: string, withCookie?: string) =>
      (await photos(withCookie, query)).photos.filter((p) => p.featured).map((p) => p.id);

    expect((await feature(first!.id, true, undefined, '')).statusCode).toBe(403);
    const made = await feature(first!.id, true);
    expect(made.statusCode).toBe(200);
    expect(made.json()).toMatchObject({ photo: { id: first!.id, featured: true } });
    // Another album keeps its own featured photo.
    expect((await feature(other.id, true)).statusCode).toBe(200);
    // Guests see which photo is featured, so their wall shows it large.
    expect(await featuredIds(`folder=${WEDDING}`)).toEqual([first!.id]);

    // A second photo in the same album: nothing changes until confirmed.
    const conflict = await feature(second!.id, true);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({
      error: 'featured_exists',
      current: { id: first!.id, featured: true },
    });
    expect(await featuredIds(`folder=${WEDDING}`, cookie)).toEqual([first!.id]);

    const replaced = await feature(second!.id, true, true);
    expect(replaced.statusCode).toBe(200);
    expect(await featuredIds(`folder=${WEDDING}`, cookie)).toEqual([second!.id]);
    expect(await featuredIds('folder=2023', cookie)).toEqual([other.id]);

    // Unfeaturing leaves the album without one.
    expect((await feature(second!.id, false)).json()).toMatchObject({ photo: { id: second!.id } });
    expect(await featuredIds(`folder=${WEDDING}`, cookie)).toEqual([]);
    const stored = JSON.parse(
      await fs.readFile(path.join(dataRoot, 'curation', 'featured.json'), 'utf8'),
    ) as { photos: string[] };
    expect(stored.photos).toEqual([other.relativePath]);
  });

  it('keeps the frame and mat the curator picks for any photo, featured or not', async () => {
    await start({ pin: PIN, libraryWrites: true });
    const cookie = await login();
    await curatorPut(cookie, CURATION_ALBUM_DISPLAY_PATH, { folder: '', onDisplay: true });
    const [first, second, third] = (await photos(cookie, `folder=${WEDDING}`)).photos;
    const post = (url: string, payload: object, withCookie = cookie) =>
      app.inject({ method: 'POST', url, payload, headers: withCookie ? { cookie: withCookie } : {} });
    const framesFile = path.join(dataRoot, 'curation', 'frames.json');

    // Any photo: only the curator, and only known frames and mats.
    expect((await post(curationPhotoFramePath(third!.id), { frame: 'walnut', mat: 'cream' }, '')).statusCode).toBe(403);
    expect((await post(curationPhotoFramePath(third!.id), { frame: 'neon', mat: 'cream' })).statusCode).toBe(400);
    expect((await post(curationPhotoFramePath(third!.id), { frame: 'walnut', mat: 'tartan' })).statusCode).toBe(400);
    expect((await post(curationPhotoFramePath(third!.id), { frame: 'walnut', mat: 'cream' })).json()).toMatchObject({
      photo: { id: third!.id, frame: { frame: 'walnut', mat: 'cream' } },
    });
    // Guests get it too, to hang it the same way.
    expect((await photos(undefined, `folder=${WEDDING}`)).photos.find((p) => p.id === third!.id))
      .toMatchObject({ frame: { frame: 'walnut', mat: 'cream' } });
    // Random with the frame's own mat is what an unpicked photo gets: it clears the pick.
    const cleared = (await post(curationPhotoFramePath(third!.id), { frame: 'random', mat: 'frame' })).json();
    expect(cleared.photo.frame).toBeUndefined();

    // Featuring sets the frame and mat; without them the photo keeps its own.
    expect((await post(curationPhotoFeaturedPath(first!.id), { featured: true })).json().photo.frame).toBeUndefined();
    expect(
      (await post(curationPhotoFeaturedPath(first!.id), { featured: true, frame: 'gilded', mat: 'velvet' })).json(),
    ).toMatchObject({ photo: { featured: true, frame: { frame: 'gilded', mat: 'velvet' } } });
    expect((await post(curationPhotoFeaturedPath(first!.id), { featured: true, frame: 'neon' })).statusCode).toBe(400);
    // A featured photo can hang in a fancy frame, picked or random.
    expect(
      (await post(curationPhotoFeaturedPath(first!.id), { featured: true, frame: 'random-fancy' })).json(),
    ).toMatchObject({ photo: { frame: { frame: 'random-fancy', mat: 'velvet' } } });
    expect(
      (await post(curationPhotoFeaturedPath(first!.id), { featured: true, frame: 'museum-gilt' })).json(),
    ).toMatchObject({ photo: { frame: { frame: 'museum-gilt', mat: 'velvet' } } });
    await post(curationPhotoFeaturedPath(first!.id), { featured: true, frame: 'gilded' });

    // Replacing carries the new photo's frame; unfeaturing keeps each photo's frame.
    expect((await post(curationPhotoFeaturedPath(second!.id), { featured: true, frame: 'walnut' })).statusCode).toBe(409);
    expect(
      (await post(curationPhotoFeaturedPath(second!.id), { featured: true, replace: true, frame: 'walnut' })).json(),
    ).toMatchObject({ photo: { featured: true, frame: { frame: 'walnut', mat: 'frame' } } });
    await post(curationPhotoFeaturedPath(second!.id), { featured: false });
    expect(JSON.parse(await fs.readFile(framesFile, 'utf8')).frames).toEqual({
      [first!.relativePath]: { frame: 'gilded', mat: 'velvet' },
      [second!.relativePath]: { frame: 'walnut', mat: 'frame' },
    });
  });

  it('carries featured photos\' frames over from before frames had mats', async () => {
    await fs.mkdir(path.join(dataRoot, 'curation'), { recursive: true });
    const photo = (await (async () => {
      await start({ pin: PIN, libraryWrites: true });
      const cookie = await login();
      await curatorPut(cookie, CURATION_ALBUM_DISPLAY_PATH, { folder: '', onDisplay: true });
      return (await photos(cookie, `folder=${WEDDING}`)).photos[0]!;
    })());
    await app.close();
    await fs.writeFile(
      path.join(dataRoot, 'curation', 'featured-frames.json'),
      JSON.stringify({ schemaVersion: 1, frames: { [photo.relativePath]: 'baroque' } }),
    );
    await start({ pin: PIN, libraryWrites: true });
    expect((await photos(await login(), `folder=${WEDDING}`)).photos.find((p) => p.id === photo.id))
      .toMatchObject({ frame: { frame: 'baroque', mat: 'frame' } });
  });

  it('lets the curator set the wall spacing and photo-view frames every visitor starts with', async () => {
    await start({ pin: PIN, libraryWrites: true });
    const cookie = await login();
    const session = async (withCookie?: string) =>
      (await app.inject({ method: 'GET', url: CURATION_SESSION_PATH, headers: withCookie ? { cookie: withCookie } : {} }))
        .json() as CurationSessionResponse;
    expect((await session()).display).toEqual({ spacing: 'none', lightboxFrames: false, randomFrames: 'standard' });
    expect((await curatorPut('', CURATION_DISPLAY_PATH, { spacing: 'framed' })).statusCode).toBe(403);
    expect((await curatorPut(cookie, CURATION_DISPLAY_PATH, { spacing: 'tiled' })).statusCode).toBe(400);
    expect((await curatorPut(cookie, CURATION_DISPLAY_PATH, { spacing: 'framed' })).json()).toMatchObject({
      display: { spacing: 'framed', lightboxFrames: false },
    });
    await curatorPut(cookie, CURATION_DISPLAY_PATH, { lightboxFrames: true });
    // Random frames come from the standard frames, the fancy ones, or both.
    expect((await curatorPut(cookie, CURATION_DISPLAY_PATH, { randomFrames: 'gaudy' })).statusCode).toBe(400);
    await curatorPut(cookie, CURATION_DISPLAY_PATH, { randomFrames: 'fancy' });
    // Guests start from them; the curator's albums.json keeps them.
    expect((await session()).display).toEqual({ spacing: 'framed', lightboxFrames: true, randomFrames: 'fancy' });
    const albums = JSON.parse(await fs.readFile(path.join(dataRoot, 'curation', 'albums.json'), 'utf8'));
    expect(albums.display).toEqual({ spacing: 'framed', lightboxFrames: true, randomFrames: 'fancy' });
  });

  it('unfeatures a photo when it is hidden, and restoring does not feature it again', async () => {
    await start({ pin: PIN, libraryWrites: true });
    const cookie = await login();
    await curatorPut(cookie, CURATION_ALBUM_DISPLAY_PATH, { folder: '', onDisplay: true });
    const target = (await photos(cookie, `folder=${WEDDING}`)).photos[0]!;
    const post = (url: string, payload: object) =>
      app.inject({ method: 'POST', url, payload, headers: { cookie } });
    expect((await post(curationPhotoFeaturedPath(target.id), { featured: true })).statusCode).toBe(200);

    const hidden = ((await post(curationPhotoHidePath(target.id), {})).json() as PhotoMoveResponse)
      .photo;
    expect(hidden.featured).toBeUndefined();
    // A hidden photo can't be featured.
    expect((await post(curationPhotoFeaturedPath(hidden.id), { featured: true })).statusCode).toBe(409);
    const restored = ((await post(curationPhotoRestorePath(hidden.id), {})).json() as PhotoMoveResponse)
      .photo;
    expect(restored.featured).toBeUndefined();
    expect((await photos(cookie, `folder=${WEDDING}`)).photos.some((p) => p.featured)).toBe(false);
  });

  async function imageSize(url: string, cookie?: string): Promise<{ width: number; height: number }> {
    const res = await app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });
    expect(res.statusCode).toBe(200);
    const meta = await sharp(res.rawPayload).metadata();
    return { width: meta.width!, height: meta.height! };
  }

  it('saves a light edit as a recipe, never touching the original', async () => {
    // Editing needs no library writes: only the recipe is stored.
    await start({ pin: PIN, libraryWrites: false });
    const cookie = await login();
    await curatorPut(cookie, CURATION_ALBUM_DISPLAY_PATH, { folder: '', onDisplay: true });
    const target = (await photos(cookie, `folder=${WEDDING}`)).photos[0]!;
    const originalBytes = await fs.readFile(path.join(libraryRoot, target.relativePath));
    const edit: PhotoEdit = {
      ...NEUTRAL_EDIT,
      rotation: 90,
      crop: { x: 0, y: 0.25, w: 1, h: 0.5 },
      temperature: 0.5,
      brightness: 0.4,
      look: 'sepia',
    };

    // Only the curator may edit, and only with a valid recipe.
    const asViewer = await app.inject({
      method: 'PUT',
      url: curationPhotoEditPath(target.id),
      payload: { edit },
    });
    expect(asViewer.statusCode).toBe(403);
    const invalid = await curatorPut(cookie, curationPhotoEditPath(target.id), {
      edit: { ...edit, rotation: 45 },
    });
    expect(invalid.statusCode).toBe(400);

    const saved = await curatorPut(cookie, curationPhotoEditPath(target.id), { edit });
    expect(saved.statusCode).toBe(200);
    const edited = (saved.json() as PhotoEditResponse).photo;
    // A quarter turn swaps the sides; the crop keeps half the height.
    expect(edited).toMatchObject({
      id: target.id,
      width: target.height,
      height: Math.round(target.width * 0.5),
      edit: { rotation: 90, look: 'sepia', temperature: 0.5, exposure: 0 },
    });
    expect(edited.editVersion).toEqual(expect.any(String));

    // Viewers see the edited size, and the edited image.
    const forViewer = (await photos(undefined, `folder=${WEDDING}`)).photos.find(
      (photo) => photo.id === target.id,
    )!;
    expect(forViewer).toMatchObject({ width: edited.width, height: edited.height });
    const thumb = `${MEDIA_BASE_PATH}/${target.id}?variant=thumb&format=webp`;
    const shown = await imageSize(thumb);
    expect(shown.width / shown.height).toBeCloseTo(edited.width / edited.height, 1);
    // Only the curator's editor gets the original back.
    const original = await imageSize(`${thumb}&edit=original`, cookie);
    expect(original.width / original.height).toBeCloseTo(target.width / target.height, 1);
    const viewerAsksOriginal = await imageSize(`${thumb}&edit=original`);
    expect(viewerAsksOriginal).toEqual(shown);

    // The file on disk is untouched; the recipe and a log line are kept.
    expect(await fs.readFile(path.join(libraryRoot, target.relativePath))).toEqual(originalBytes);
    const editsFile = JSON.parse(
      await fs.readFile(path.join(dataRoot, 'curation', 'edits.json'), 'utf8'),
    ) as { edits: Record<string, PhotoEdit> };
    expect(editsFile.edits[target.relativePath]).toMatchObject({ rotation: 90 });
    const log = await fs.readFile(path.join(dataRoot, 'curation', 'edits.log'), 'utf8');
    expect(JSON.parse(log.trim().split('\n').at(-1)!)).toMatchObject({ action: 'edit' });

    // Reverting brings the original back for everyone.
    const reverted = await app.inject({
      method: 'DELETE',
      url: curationPhotoEditPath(target.id),
      headers: { cookie },
    });
    expect(reverted.statusCode).toBe(200);
    expect((reverted.json() as PhotoEditResponse).photo).toMatchObject({
      width: target.width,
      height: target.height,
    });
    expect((reverted.json() as PhotoEditResponse).photo.edit).toBeUndefined();
    const back = await imageSize(thumb);
    expect(back.width / back.height).toBeCloseTo(target.width / target.height, 1);
  });

  it('reads recipes saved before temperature and exposure existed as neutral for both', async () => {
    await start({ pin: PIN, libraryWrites: false });
    const cookie = await login();
    await curatorPut(cookie, CURATION_ALBUM_DISPLAY_PATH, { folder: '', onDisplay: true });
    const target = (await photos(cookie, `folder=${WEDDING}`)).photos[0]!;
    const { temperature: _t, exposure: _e, ...older } = { ...NEUTRAL_EDIT, contrast: 0.2 };
    const saved = await curatorPut(cookie, curationPhotoEditPath(target.id), { edit: older });
    expect(saved.statusCode).toBe(200);
    expect((saved.json() as PhotoEditResponse).photo.edit).toMatchObject({
      contrast: 0.2,
      temperature: 0,
      exposure: 0,
    });
  });

  it('saving a neutral edit reverts, and an edit follows its photo into _hidden', async () => {
    await start({ pin: PIN, libraryWrites: true });
    const cookie = await login();
    await curatorPut(cookie, CURATION_ALBUM_DISPLAY_PATH, { folder: '', onDisplay: true });
    const target = (await photos(cookie, `folder=${WEDDING}`)).photos[0]!;
    const edit: PhotoEdit = { ...NEUTRAL_EDIT, crop: { x: 0, y: 0, w: 0.5, h: 0.5 } };
    await curatorPut(cookie, curationPhotoEditPath(target.id), { edit });

    const hide = await app.inject({
      method: 'POST',
      url: curationPhotoHidePath(target.id),
      payload: {},
      headers: { cookie },
    });
    const hidden = (hide.json() as PhotoMoveResponse).photo;
    expect(hidden.edit).toMatchObject({ crop: { w: 0.5, h: 0.5 } });
    const inHidden = (await photos(cookie, `folder=${WEDDING}/_hidden`)).photos[0]!;
    expect(inHidden.edit).toMatchObject({ crop: { w: 0.5 } });

    const neutral = await curatorPut(cookie, curationPhotoEditPath(hidden.id), {
      edit: NEUTRAL_EDIT,
    });
    expect((neutral.json() as PhotoEditResponse).photo.edit).toBeUndefined();
    const editsFile = JSON.parse(
      await fs.readFile(path.join(dataRoot, 'curation', 'edits.json'), 'utf8'),
    ) as { edits: Record<string, PhotoEdit> };
    expect(editsFile.edits).toEqual({});
  });

  it('lets the server owner choose a PIN with the setup code, once', async () => {
    await start({ pin: null, libraryWrites: true });
    const choose = (pin: string, code: string) =>
      app.inject({ method: 'POST', url: CURATION_PIN_PATH, payload: { pin, code } });
    const codeFile = path.join(dataRoot, 'curation', 'setup-code');
    const code = (await fs.readFile(codeFile, 'utf8')).trim();
    expect(code).toMatch(/^\d{4}-\d{4}$/);

    expect((await choose('1357', '0000-0000')).statusCode).toBe(401);
    const chosen = await choose('1357', code);
    expect(chosen.statusCode).toBe(200);
    expect(chosen.json()).toMatchObject({ enabled: true, curator: true });
    expect(await exists(codeFile)).toBe(false);
    // Once chosen, nobody can choose again, even with the old code.
    expect((await choose('9999', code)).statusCode).toBe(409);

    // Curation is now on: new albums start in storage.
    expect((await photos()).totalMatching).toBe(0);
    const cookie = String(chosen.headers['set-cookie']).split(';')[0]!;
    expect((await photos(cookie)).totalMatching).toBe(5);
    const login = await app.inject({
      method: 'POST',
      url: CURATION_SESSION_PATH,
      payload: { pin: '1357' },
    });
    expect(login.statusCode).toBe(200);

    // The chosen PIN survives a restart, and no new setup code is made.
    const restarted = new CurationService({
      library,
      curationRoot: path.join(dataRoot, 'curation'),
      curatorPin: null,
      libraryWrites: true,
    });
    await restarted.initialize();
    expect(restarted.enabled).toBe(true);
    expect(restarted.getSetupCode()).toBeNull();
    expect(await restarted.login('1357')).not.toBeNull();
    expect(await restarted.login('2468')).toBeNull();
  });

  it('refuses to move photos unless library writes are on', async () => {
    await start({ pin: PIN, libraryWrites: false });
    const cookie = await login();
    const target = (await photos(cookie)).photos[0]!;
    const res = await app.inject({
      method: 'POST',
      url: curationPhotoHidePath(target.id),
      payload: {},
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: 'library_writes_disabled' });
    expect(await exists(path.join(libraryRoot, target.relativePath))).toBe(true);
  });

  it('makes share links whose id follows their content', async () => {
    await start({ pin: null, libraryWrites: false });
    const share = { folders: [WEDDING], excludeFolders: [], anchorPhotoId: 'abc123', zoom: 1.5 };
    const first = await app.inject({ method: 'POST', url: SHARES_PATH, payload: share });
    const again = await app.inject({ method: 'POST', url: SHARES_PATH, payload: share });
    const record = first.json() as ShareRecord;
    expect(record.id).toMatch(/^[A-Za-z0-9_-]{10}$/);
    expect((again.json() as ShareRecord).id).toBe(record.id);

    const read = await app.inject({ method: 'GET', url: `${SHARES_PATH}/${record.id}` });
    expect(read.json()).toMatchObject(share);
    const missing = await app.inject({ method: 'GET', url: `${SHARES_PATH}/nope` });
    expect(missing.statusCode).toBe(404);
    const invalid = await app.inject({
      method: 'POST',
      url: SHARES_PATH,
      payload: { ...share, folders: ['../etc'] },
    });
    expect(invalid.statusCode).toBe(400);
  });
});
