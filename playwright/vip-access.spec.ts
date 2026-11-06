import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Authorized guests contract: the curator sets a VIP PIN in the
// Curator section; a guest who enters it on the unlisted /vip page
// sees private photos in place, with no switch, until the curator
// changes or turns off the PIN. Plain guests never see them.
//
// Runs its own server against a throwaway copy of the wall fixtures,
// reusing the build the main web server already made.

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 5198;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const PIN = '8642';
const VIP_PIN = '1357';

let server: ChildProcess | null = null;
let libraryRoot = '';
let dataRoot = '';

test.describe.configure({ mode: 'serial', timeout: 90_000 });
test.use({ baseURL: BASE_URL });

test.beforeAll(async () => {
  libraryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-wall-vip-lib-'));
  dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-wall-vip-data-'));
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
      PHOTO_WALL_CURATOR_PIN: PIN,
      PHOTO_WALL_LIBRARY_WRITES: 'false',
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

test('a guest with the VIP PIN sees private photos until the curator changes it', async ({
  page,
  browser,
}) => {
  // The curator opens an album, makes a photo in it private and sets a VIP PIN.
  await page.request.post('/api/curation/session', { data: { pin: PIN } });
  await page.request.put('/api/curation/albums/display', { data: { folder: '2024', onDisplay: true } });
  const album = (await photosIn(page.request, '2024'))[0]!;
  await page.request.post(`/api/curation/photos/${album.id}/private`, { data: { private: true } });

  await page.goto('/');
  await openControls(page);
  await expect(page.getByTestId('controls-vip-pin-status')).toContainText('Set a VIP PIN');
  await page.getByTestId('controls-vip-pin').fill(VIP_PIN);
  await page.getByTestId('controls-vip-pin-set').click();
  await expect(page.getByTestId('controls-vip-pin-status')).toContainText('VIP PIN is on');

  // A guest enters it on /vip and lands on the plain wall, private photo included.
  const guest = await browser.newContext({ baseURL: BASE_URL });
  const vip = await guest.newPage();
  await vip.goto('/vip');
  await expect(vip.getByTestId('controls-curator-pin')).toHaveAttribute('placeholder', 'VIP PIN', {
    timeout: 60_000,
  });
  await vip.getByTestId('controls-curator-pin').fill('0000');
  await vip.getByTestId('controls-curator-login').click();
  await expect(vip.getByRole('alert')).toContainText('PIN is not right');
  await vip.getByTestId('controls-curator-pin').fill(VIP_PIN);
  await vip.getByTestId('controls-curator-login').click();
  await expect(vip.getByTestId('controls-vip')).toBeVisible();
  await expect.poll(() => new URL(vip.url()).pathname).toBe('/');
  // No curator tools, and no switch for private photos.
  await expect(vip.getByTestId('controls-panel')).toHaveAttribute('data-curator', 'false');
  await expect(vip.getByTestId('controls-folder-display-2024')).toHaveCount(0);
  expect((await photosIn(vip.request, '2024')).map((p) => p.id)).toContain(album.id);

  // A plain guest doesn't see it.
  const plain = await browser.newContext({ baseURL: BASE_URL });
  expect((await photosIn(plain.request, '2024')).map((p) => p.id)).not.toContain(album.id);
  await plain.close();

  // Changing the PIN signs the vip browser out; it's a plain guest again.
  await page.getByTestId('controls-vip-pin').fill('9753');
  await page.getByTestId('controls-vip-pin-set').click();
  await expect.poll(async () => (await photosIn(vip.request, '2024')).map((p) => p.id)).not.toContain(
    album.id,
  );
  await vip.reload();
  await openControls(vip);
  await expect(vip.getByTestId('controls-vip')).toHaveCount(0);

  // Turning it off: /vip no longer accepts the PIN.
  await page.getByTestId('controls-vip-pin-off').click();
  await expect(page.getByTestId('controls-vip-pin-status')).toContainText('Set a VIP PIN');
  const res = await vip.request.post('/api/curation/session', { data: { pin: '9753' } });
  expect(res.status()).toBe(401);
  await guest.close();
});

async function openControls(page: Page): Promise<void> {
  await page.getByTestId('controls-trigger').click();
  await expect(page.getByTestId('controls-panel')).toBeVisible();
}

async function photosIn(api: APIRequestContext, folder: string): Promise<{ id: string }[]> {
  const res = await api.get(`/api/photos?limit=5000&folder=${encodeURIComponent(folder)}`);
  return ((await res.json()) as { photos: { id: string }[] }).photos;
}
