import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';

// Curation contract: albums start in storage, the curator unlocks with
// a PIN and puts albums on display, viewers only see what is on display,
// hiding a photo moves it into its album's `_hidden` folder (with undo),
// share links reopen the same albums, and the curator's light edits
// (crop, straighten, colors) are stored as recipes, never in the file.
//
// Curation moves files, so this spec runs its own server against a
// throwaway copy of the wall fixtures with a PIN and library writes on.
// It reuses the build the main web server already made.

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 5186;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const PIN = '8642';

let server: ChildProcess | null = null;
let libraryRoot = '';
let dataRoot = '';

test.describe.configure({ mode: 'serial', timeout: 90_000 });
test.use({ baseURL: BASE_URL });

test.beforeAll(async () => {
  libraryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-wall-curation-lib-'));
  dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-wall-curation-data-'));
  await fs.cp(path.join(repoRoot, 'fixtures', 'library-wall'), libraryRoot, {
    recursive: true,
  });
  server = spawn('node', ['dist/server/index.js'], {
    cwd: repoRoot,
    stdio: 'ignore',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PHOTO_WALL_BIND_HOST: '127.0.0.1',
      PHOTO_WALL_PORT: String(PORT),
      PHOTO_WALL_LIBRARY_ROOT: libraryRoot,
      PHOTO_WALL_DATA_ROOT: dataRoot,
      PHOTO_WALL_LOG_LEVEL: 'warn',
      PHOTO_WALL_PREWARM_DERIVATIVES: 'false',
      // No PIN: the first test chooses one on /curate with the setup code.
    },
  });
  await expect
    .poll(
      async () => {
        const res = await fetch(`${BASE_URL}/api/library/status`).catch(() => null);
        if (!res?.ok) return 'down';
        return ((await res.json()) as { scanState: string }).scanState;
      },
      { timeout: 60_000 },
    )
    .toBe('ready');
});

test.afterAll(async () => {
  server?.kill();
  await fs.rm(libraryRoot, { recursive: true, force: true });
  await fs.rm(dataRoot, { recursive: true, force: true });
});

test('the server owner chooses the PIN on /curate, then albums start in storage', async ({
  page,
}) => {
  // Before a PIN exists curation is off and every album shows.
  await page.goto('/');
  await expect(page.getByTestId('wall-shell')).toHaveAttribute('data-screen', 'ready', {
    timeout: 60_000,
  });
  // Viewers get no sign of a curator login in the menu.
  await openControls(page);
  await expect(page.getByTestId('controls-curation')).toHaveCount(0);
  await expect(page.getByTestId('controls-curator-pin')).toHaveCount(0);

  // The unlisted route asks for the setup code from the server's files.
  await page.goto('/curate');
  const code = (await fs.readFile(path.join(dataRoot, 'curation', 'setup-code'), 'utf8')).trim();
  await expect(page.getByTestId('controls-curator-setup-code')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('controls-curator-setup-code').fill('0000-0000');
  await page.getByTestId('controls-curator-pin').fill(PIN);
  await page.getByTestId('controls-curator-login').click();
  await expect(page.getByRole('alert')).toContainText('setup code is not right');

  await page.getByTestId('controls-curator-setup-code').fill(code);
  await page.getByTestId('controls-curator-pin').fill(PIN);
  await page.getByTestId('controls-curator-login').click();
  await expect(page.getByTestId('controls-panel')).toHaveAttribute('data-curator', 'true');
  // Choosing the PIN leaves the curator route.
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');

  // Locked, the wall is a viewer's: every album is in storage.
  await page.getByTestId('controls-curator-logout').click();
  await expect(page.getByTestId('wall-shell')).toHaveAttribute(
    'data-screen',
    'nothing-on-display',
    { timeout: 60_000 },
  );

  // Unlocking again asks only for the PIN.
  await page.goto('/curate');
  await expect(page.getByTestId('controls-curator-pin')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('controls-curator-setup-code')).toHaveCount(0);
  await page.getByTestId('controls-curator-pin').fill('0000');
  await page.getByTestId('controls-curator-login').click();
  await expect(page.getByRole('alert')).toContainText('PIN is not right');
  await page.getByTestId('controls-curator-pin').fill(PIN);
  await page.getByTestId('controls-curator-login').click();
  await expect(page.getByTestId('controls-panel')).toHaveAttribute('data-curator', 'true');
  // The curator sees every album, in storage or not.
  await expect(page.getByTestId('wall-shell')).toHaveAttribute('data-screen', 'ready', {
    timeout: 60_000,
  });

  const display2024 = page.getByTestId('controls-folder-display-2024');
  await expect(display2024).toHaveAttribute('data-display', 'none');
  await display2024.click();
  await expect(display2024).toHaveAttribute('data-display', 'all');

  await page.getByTestId('controls-curator-logout').click();
  await expect(page.getByTestId('controls-panel')).toHaveAttribute('data-curator', 'false');
  await expect(page.getByTestId('controls-folder-2024')).toBeVisible();
  await expect(page.getByTestId('controls-folder-2023')).toHaveCount(0);
  await expect(page.getByTestId('controls-folder-display-2024')).toHaveCount(0);
  await closeControls(page);
  await expect(page.getByTestId('wall-shell')).toHaveAttribute('data-screen', 'ready', {
    timeout: 60_000,
  });
  const directories = await visibleDirectories(page, page.request);
  expect(directories.length).toBeGreaterThan(0);
  expect(directories.every((dir) => dir.startsWith('2024/'))).toBe(true);
});

test('the curator hides a photo by moving it into _hidden, and can undo', async ({ page }) => {
  await page.request.post('/api/curation/session', { data: { pin: PIN } });
  await page.goto('/');
  await expect(page.getByTestId('wall-shell')).toHaveAttribute('data-screen', 'ready', {
    timeout: 60_000,
  });

  const tile = await pickCenteredTile(page);
  const photoId = await tile.getAttribute('data-photo-id');
  const photo = await photoById(page.request, photoId!);
  await tile.click();
  await page.getByTestId('focused-photo-hide').click();

  const toast = page.getByTestId('curation-toast');
  await expect(toast).toContainText(`Hidden: ${photo.filename}`);
  const original = path.join(libraryRoot, photo.relativePath);
  const hidden = path.join(libraryRoot, photo.directoryPath, '_hidden', photo.filename);
  await expect.poll(() => exists(hidden)).toBe(true);
  expect(await exists(original)).toBe(false);
  // The lightbox stepped on to another photo.
  await expect(page.getByTestId('focused-photo-modal')).not.toHaveAttribute(
    'data-photo-id',
    photoId!,
  );

  await page.getByTestId('curation-toast-action').click();
  await expect(toast).toContainText(`Restored: ${photo.filename}`);
  await expect.poll(() => exists(original)).toBe(true);
  expect(await exists(hidden)).toBe(false);
});

test('the curator crops and brightens a photo; the file itself is never changed', async ({
  page,
}) => {
  await page.request.post('/api/curation/session', { data: { pin: PIN } });
  await page.goto('/');
  await expect(page.getByTestId('wall-shell')).toHaveAttribute('data-screen', 'ready', {
    timeout: 60_000,
  });

  const tile = await pickCenteredTile(page);
  const photoId = (await tile.getAttribute('data-photo-id'))!;
  const photo = await photoById(page.request, photoId);
  const originalBytes = await fs.readFile(path.join(libraryRoot, photo.relativePath));
  await tile.click();
  await page.getByTestId('focused-photo-edit').click();
  const editor = page.getByTestId('photo-editor');
  await expect(editor).toBeVisible();
  await expect(page.getByTestId('photo-editor-stage')).not.toContainText('Loading photo');

  // A square crop; the frame stays where it is while the photo moves.
  // The editor opens on Crop the first time.
  await expect(page.getByTestId('photo-editor-tab-crop')).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('photo-editor-aspect-1:1').click();
  const frame = page.getByTestId('crop-frame');
  const square = (await frame.boundingBox())!;
  expect(square.width / square.height).toBeCloseTo(1, 1);
  await page.mouse.move(square.x + square.width / 2, square.y + square.height / 2);
  await page.mouse.wheel(0, -300);
  await page.mouse.down();
  await page.mouse.move(square.x + square.width / 2 + 40, square.y + square.height / 2 + 20, {
    steps: 5,
  });
  await page.mouse.up();
  expect(await frame.boundingBox()).toEqual(square);
  // Resizing from a corner keeps the opposite corner where it was.
  const corner = (await page.getByTestId('crop-handle-se').boundingBox())!;
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x - 40, corner.y - 40, { steps: 5 });
  await page.mouse.up();
  const smaller = (await frame.boundingBox())!;
  expect(smaller.x).toBeCloseTo(square.x, 0);
  expect(smaller.y).toBeCloseTo(square.y, 0);
  expect(smaller.width).toBeLessThan(square.width);

  await page.getByTestId('photo-editor-tab-adjust').click();
  // Temperature leads the sliders, then exposure, brightness and contrast.
  const sliders = page.locator('.photo-editor__slider input');
  expect(await sliders.evaluateAll((inputs) => inputs.slice(0, 4).map((i) => i.dataset['testid']))).toEqual([
    'photo-editor-temperature',
    'photo-editor-exposure',
    'photo-editor-brightness',
    'photo-editor-contrast',
  ]);
  await page.getByTestId('photo-editor-temperature').fill('0.5');
  await page.getByTestId('photo-editor-brightness').fill('0.4');
  await page.getByTestId('photo-editor-save').click();

  const toast = page.getByTestId('curation-toast');
  await expect(toast).toContainText(`Edited: ${photo.filename}`);
  await expect(editor).toHaveCount(0);
  // Back in the focused view, showing the square edit.
  const modal = page.getByTestId('focused-photo-modal');
  await expect(modal).toHaveAttribute('data-photo-id', photoId);
  await expect
    .poll(async () => {
      const box = await page.getByTestId('focused-photo-frame').boundingBox();
      return box ? Math.round((box.width / box.height) * 10) / 10 : 0;
    })
    .toBe(1);
  await expect(page.getByTestId('focused-photo-image')).toHaveAttribute('src', /&v=[\d.]+-\w+$/);
  const edited = (await page.request.get('/api/photos?limit=5000').then((r) => r.json())) as {
    photos: {
      id: string;
      width: number;
      height: number;
      edit?: { brightness: number; temperature: number };
    }[];
  };
  const record = edited.photos.find((p) => p.id === photoId)!;
  expect(Math.abs(record.width - record.height)).toBeLessThanOrEqual(1);
  expect(record.edit?.brightness).toBeCloseTo(0.4);
  expect(record.edit?.temperature).toBeCloseTo(0.5);
  expect(await fs.readFile(path.join(libraryRoot, photo.relativePath))).toEqual(originalBytes);

  // Undo puts the original back.
  await page.getByTestId('curation-toast-action').click();
  await expect(toast).toContainText(`Back to the original: ${photo.filename}`);
  await expect
    .poll(async () => {
      const res = (await page.request.get('/api/photos?limit=5000').then((r) => r.json())) as {
        photos: { id: string; edit?: unknown }[];
      };
      return res.photos.find((p) => p.id === photoId)?.edit ?? null;
    })
    .toBeNull();
});

test('closing the editor leaves the wall drawing', async ({ page }) => {
  // Tearing down the editor's Pixi app once released Pixi's page-wide
  // pools, which broke the wall's renderer and left it black.
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.request.post('/api/curation/session', { data: { pin: PIN } });
  await page.goto('/');
  await expect(page.getByTestId('wall-shell')).toHaveAttribute('data-screen', 'ready', {
    timeout: 60_000,
  });
  await (await pickCenteredTile(page)).click();
  const editor = page.getByTestId('photo-editor');
  for (let round = 0; round < 2; round += 1) {
    await page.getByTestId('focused-photo-edit').click();
    await expect(page.getByTestId('photo-editor-stage')).not.toContainText('Loading photo');
    // Crop the first time, then the last tab used.
    const expectedTab = round === 0 ? 'crop' : 'adjust';
    await expect(page.getByTestId(`photo-editor-tab-${expectedTab}`)).toHaveAttribute('aria-selected', 'true');
    if (round === 0) await page.getByTestId('photo-editor-tab-adjust').click();
    await page.getByTestId('photo-editor-brightness').fill('0.2');
    await page.getByTestId('photo-editor-save').click();
    await expect(editor).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
  }
  await page.getByTestId('focused-photo-close').click();
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
});

test('a share link reopens the same albums for someone else', async ({ page, browser }) => {
  const curator = await playwrightRequest.newContext({ baseURL: BASE_URL });
  await curator.post('/api/curation/session', { data: { pin: PIN } });
  await curator.put('/api/curation/albums/display', { data: { folder: '', onDisplay: true } });
  await curator.dispose();

  await page.goto('/');
  await expect(page.getByTestId('wall-shell')).toHaveAttribute('data-screen', 'ready', {
    timeout: 60_000,
  });
  await openControls(page);
  await page.getByTestId('controls-folder-2023').click();
  await expect(page.getByTestId('controls-folder-2023')).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('wall-shell')).toHaveAttribute('data-screen', 'ready', {
    timeout: 60_000,
  });
  await closeControls(page);
  // Move away from the starting position so the shared spot is distinct.
  await page.mouse.move(700, 480);
  await page.mouse.wheel(260, 340);
  await page.waitForTimeout(800);
  const anchorId = await (await pickCenteredTile(page)).getAttribute('data-photo-id');
  await openControls(page);
  await page.getByTestId('controls-share').click();
  const link = await page.getByTestId('controls-share-url').inputValue();
  expect(link).toMatch(new RegExp(`^${BASE_URL}/\\?s=[A-Za-z0-9_-]{10}$`));

  const other = await browser.newContext({ baseURL: BASE_URL });
  const viewer = await other.newPage();
  await viewer.goto(link);
  await expect(viewer.getByTestId('wall-shell')).toHaveAttribute('data-screen', 'ready', {
    timeout: 60_000,
  });
  // The link is dropped from the address bar once applied.
  await expect.poll(() => new URL(viewer.url()).search).toBe('');
  // The wall glides to the photo that was in the middle when shared.
  await expect
    .poll(async () => (await pickCenteredTile(viewer)).getAttribute('data-photo-id'))
    .toBe(anchorId);
  await openControls(viewer);
  await expect(viewer.getByTestId('controls-folder-2023')).toHaveAttribute(
    'data-selected',
    'true',
  );
  await expect(viewer.getByTestId('controls-folder-2024')).toHaveAttribute(
    'data-selected',
    'false',
  );
  await other.close();
});

async function openControls(page: Page): Promise<void> {
  await page.getByTestId('controls-trigger').click();
  await expect(page.getByTestId('controls-panel')).toBeVisible();
}

async function closeControls(page: Page): Promise<void> {
  await page.getByTestId('controls-trigger').click();
  await expect(page.getByTestId('controls-panel')).toHaveCount(0);
}

interface PhotoRow {
  id: string;
  filename: string;
  relativePath: string;
  directoryPath: string;
  starred?: boolean;
}

async function allPhotos(api: APIRequestContext): Promise<PhotoRow[]> {
  const res = await api.get('/api/photos?limit=5000');
  return ((await res.json()) as { photos: PhotoRow[] }).photos;
}

async function photoById(api: APIRequestContext, id: string): Promise<PhotoRow> {
  const photo = (await allPhotos(api)).find((p) => p.id === id);
  if (!photo) throw new Error(`photo ${id} not found`);
  return photo;
}

async function visibleDirectories(page: Page, api: APIRequestContext): Promise<string[]> {
  const ids = await page
    .getByTestId('wall-photo-tile')
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset['photoId'] ?? ''));
  const byId = new Map((await allPhotos(api)).map((p) => [p.id, p.directoryPath]));
  return [...new Set(ids.map((id) => byId.get(id)).filter((d): d is string => !!d))].sort();
}

async function pickCenteredTile(page: Page): Promise<Locator> {
  const tiles = page.getByTestId('wall-photo-tile');
  await expect(tiles.first()).toBeVisible();
  const index = await tiles.evaluateAll((nodes) => {
    let best = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    nodes.forEach((node, i) => {
      const rect = (node as HTMLElement).getBoundingClientRect();
      if (rect.width < 40 || rect.height < 40) return;
      const dx = rect.left + rect.width / 2 - window.innerWidth / 2;
      const dy = rect.top + rect.height / 2 - window.innerHeight / 2;
      const score = dx * dx + dy * dy;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return best;
  });
  return tiles.nth(index);
}

async function exists(file: string): Promise<boolean> {
  return fs.access(file).then(
    () => true,
    () => false,
  );
}

test('the curator stars photos into Favorites, which viewers can pick', async ({
  page,
  browser,
}) => {
  await page.request.post('/api/curation/session', { data: { pin: PIN } });
  await page.goto('/');
  await expect(page.getByTestId('wall-shell')).toHaveAttribute('data-screen', 'ready', {
    timeout: 60_000,
  });
  const tile = await pickCenteredTile(page);
  const photoId = await tile.getAttribute('data-photo-id');
  await tile.click();
  const star = page.getByTestId('focused-photo-star');
  await expect(star).toHaveAttribute('data-starred', 'false');
  await star.click();
  await expect(star).toHaveAttribute('data-starred', 'true');
  await page.getByTestId('focused-photo-close').click();

  const other = await browser.newContext({ baseURL: BASE_URL });
  const viewer = await other.newPage();
  await viewer.goto('/');
  await expect(viewer.getByTestId('wall-shell')).toHaveAttribute('data-screen', 'ready', {
    timeout: 60_000,
  });
  await openControls(viewer);
  const starredAlbum = viewer.getByTestId('controls-folder-starred');
  await expect(starredAlbum).toBeVisible();
  await starredAlbum.click();
  await expect(starredAlbum).toHaveAttribute('data-selected', 'true');
  await closeControls(viewer);
  await expect
    .poll(async () => {
      const ids = await viewer
        .getByTestId('wall-photo-tile')
        .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset['photoId']));
      return [...new Set(ids)];
    })
    .toEqual([photoId]);
  await other.close();
});

test('in Favorites, a photo shows its album and unstarring takes it off the wall', async ({
  page,
}) => {
  await page.request.post('/api/curation/session', { data: { pin: PIN } });
  // The previous test starred one photo; star a second from another album.
  const photos = await allPhotos(page.request);
  const first = photos.find((p) => p.starred)!;
  const second = photos.find((p) => !p.starred && p.directoryPath !== first.directoryPath)!;
  await page.request.post(`/api/curation/photos/${second.id}/star`, { data: { starred: true } });

  await page.goto('/');
  await expect(page.getByTestId('wall-shell')).toHaveAttribute('data-screen', 'ready', {
    timeout: 60_000,
  });
  await openControls(page);
  await page.getByTestId('controls-folder-starred').click();
  await closeControls(page);
  const shownIds = async () => [
    ...new Set(
      await page
        .getByTestId('wall-photo-tile')
        .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset['photoId'])),
    ),
  ];
  await expect.poll(async () => (await shownIds()).sort()).toEqual([first.id, second.id].sort());

  const tile = await pickCenteredTile(page);
  const openedId = (await tile.getAttribute('data-photo-id'))!;
  const opened = openedId === first.id ? first : second;
  await tile.click();
  const star = page.getByTestId('focused-photo-star');
  await expect(star).toHaveAttribute('data-starred', 'true');
  await expect(page.getByTestId('focused-photo-album')).toHaveText(
    `From ${opened.directoryPath.split('/').at(-1)}`,
  );

  await star.click();
  await expect(page.getByTestId('curation-toast')).toContainText(
    `Taken out of Favorites: ${opened.filename}`,
  );
  // The lightbox stepped on to the other Favorites photo, which stays starred.
  await expect(page.getByTestId('focused-photo-star')).toHaveAttribute('data-starred', 'true');
  await expect.poll(shownIds).toEqual([openedId === first.id ? second.id : first.id]);

  // Undo puts it back in Favorites.
  await page.getByTestId('curation-toast-action').click();
  await expect.poll(async () => (await shownIds()).sort()).toEqual([first.id, second.id].sort());
  await page.request.post(`/api/curation/photos/${second.id}/star`, { data: { starred: false } });
});

test('a private photo stays where it is but guests never see it', async ({ page, browser }) => {
  await page.request.post('/api/curation/session', { data: { pin: PIN } });
  await page.goto('/');
  await expect(page.getByTestId('wall-shell')).toHaveAttribute('data-screen', 'ready', {
    timeout: 60_000,
  });
  const tile = await pickCenteredTile(page);
  const photoId = (await tile.getAttribute('data-photo-id'))!;
  const photo = await photoById(page.request, photoId);
  await tile.click();
  const toggle = page.getByTestId('focused-photo-private');
  await expect(toggle).toHaveAttribute('data-private', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('data-private', 'true');
  await expect(toggle).toContainText('Private');
  await page.getByTestId('focused-photo-close').click();
  expect(await exists(path.join(libraryRoot, photo.relativePath))).toBe(true);

  const other = await browser.newContext({ baseURL: BASE_URL });
  const viewer = await other.newPage();
  await viewer.goto('/');
  await expect(viewer.getByTestId('wall-shell')).toHaveAttribute('data-screen', 'ready', {
    timeout: 60_000,
  });
  const res = await viewer.request.get(`/api/photos?limit=5000&folder=${encodeURIComponent(photo.directoryPath)}`);
  const ids = ((await res.json()) as { photos: { id: string }[] }).photos.map((p) => p.id);
  expect(ids.length).toBeGreaterThan(0);
  expect(ids).not.toContain(photoId);
  await other.close();
});

test('the curator previews the wall as a guest and keeps curating', async ({ page }) => {
  await page.request.post('/api/curation/session', { data: { pin: PIN } });
  // The previous test made a photo private.
  const privatePaths = JSON.parse(
    await fs.readFile(path.join(dataRoot, 'curation', 'private.json'), 'utf8'),
  ) as { photos: string[] };
  const privateId = (await allPhotos(page.request)).find(
    (p) => p.relativePath === privatePaths.photos[0],
  )!.id;

  await page.goto('/');
  await expect(page.getByTestId('wall-shell')).toHaveAttribute('data-screen', 'ready', {
    timeout: 60_000,
  });
  await openControls(page);
  await page.getByTestId('controls-preview-guest').check();
  await expect(page.getByTestId('guest-preview-badge')).toBeVisible();
  // The curator's tools are still in the menu.
  await expect(page.getByTestId('controls-folder-display-2024')).toBeVisible();
  await closeControls(page);

  const shownIds = async () =>
    page
      .getByTestId('wall-photo-tile')
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset['photoId']));
  await expect.poll(async () => (await shownIds()).includes(privateId)).toBe(false);

  // Photos still open with the curator's buttons.
  await (await pickCenteredTile(page)).click();
  await expect(page.getByTestId('focused-photo-star')).toBeVisible();
  await page.getByTestId('focused-photo-close').click();

  // The preview is remembered on reload, and the badge exits it.
  await page.reload();
  await expect(page.getByTestId('guest-preview-badge')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('guest-preview-badge').click();
  await expect(page.getByTestId('guest-preview-badge')).toHaveCount(0);
});

test('a guest stepping through photos skips one made private after their wall loaded', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext({ baseURL: BASE_URL });
  const viewer = await other.newPage();
  await viewer.goto('/');
  await expect(viewer.getByTestId('wall-shell')).toHaveAttribute('data-screen', 'ready', {
    timeout: 60_000,
  });
  const modal = viewer.getByTestId('focused-photo-modal');
  // Learn the next photo without loading its big image, as for a guest
  // who has not opened it yet.
  const modalImages = '**/api/media/**variant=modal**';
  await viewer.route(modalImages, (route) => route.abort());
  await (await pickCenteredTile(viewer)).click();
  const startId = (await modal.getAttribute('data-photo-id'))!;
  await viewer.keyboard.press('ArrowRight');
  await expect(modal).not.toHaveAttribute('data-photo-id', startId);
  const nextId = (await modal.getAttribute('data-photo-id'))!;
  await viewer.keyboard.press('ArrowLeft');
  await expect(modal).toHaveAttribute('data-photo-id', startId);
  await viewer.unroute(modalImages);

  // The curator makes the next photo private while the guest's wall is open.
  await page.request.post('/api/curation/session', { data: { pin: PIN } });
  const res = await page.request.post(`/api/curation/photos/${nextId}/private`, {
    data: { private: true },
  });
  expect(res.ok()).toBe(true);

  // Stepping onto it moves straight past it, and stepping back skips it too.
  await viewer.keyboard.press('ArrowRight');
  await expect
    .poll(() => modal.getAttribute('data-photo-id'), { timeout: 15_000 })
    .not.toMatch(new RegExp(`^(${nextId}|${startId})$`));
  await viewer.keyboard.press('ArrowLeft');
  await expect(modal).toHaveAttribute('data-photo-id', startId);
  await other.close();
});

test('making a photo private keeps the curator where they were on the wall', async ({ page }) => {
  await page.request.post('/api/curation/session', { data: { pin: PIN } });
  await page.goto('/');
  await expect(page.getByTestId('wall-shell')).toHaveAttribute('data-screen', 'ready', {
    timeout: 60_000,
  });
  const canvas = page.getByTestId('wall-canvas');
  const cameraAt = async () => ({
    x: Number(await canvas.getAttribute('data-camera-x')),
    y: Number(await canvas.getAttribute('data-camera-y')),
  });
  const settled = async () => {
    let last = await cameraAt();
    await expect
      .poll(async () => {
        const now = await cameraAt();
        const still = now.x === last.x && now.y === last.y;
        last = now;
        return still;
      })
      .toBe(true);
    return last;
  };
  const opened = await settled();
  // Pan away from the wall's center.
  await page.mouse.move(400, 300);
  for (let step = 0; step < 6; step += 1) await page.mouse.wheel(120, 90);
  const panned = await settled();
  expect(Math.abs(panned.x - opened.x) + Math.abs(panned.y - opened.y)).toBeGreaterThan(200);

  await (await pickCenteredTile(page)).click();
  const before = await settled();
  const toggle = page.getByTestId('focused-photo-private');
  for (const next of ['true', 'false']) {
    const refetched = page.waitForResponse((res) => res.url().includes('/api/photos'));
    await toggle.click();
    await expect(toggle).toHaveAttribute('data-private', next);
    await refetched;
    expect(await settled()).toEqual(before);
  }
  await page.getByTestId('focused-photo-close').click();
  expect(await settled()).toEqual(before);
});
