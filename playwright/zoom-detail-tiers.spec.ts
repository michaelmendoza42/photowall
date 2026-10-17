import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { FAR_ZOOM_MAX } from '../src/client/src/features/wall/pixiScene.js';

/** Fixture photos are tiny; report them as camera-sized so tiers can rise above thumb. */
const SOURCE_SCALE = 40;

test.describe('zoom/detail tiers', () => {
  // Tiers follow drawn device pixels, so this also covers high-DPI rendering.
  test.use({ deviceScaleFactor: 2 });

  let consoleErrors: string[];
  let seenMediaVariants: Set<string>;
  let variantsByPhoto: Map<string, Set<string>>;

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    seenMediaVariants = new Set();
    variantsByPhoto = new Map();

    await page.route('**/api/photos?**', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      if (Array.isArray(body.photos)) {
        for (const photo of body.photos) {
          photo.width *= SOURCE_SCALE;
          photo.height *= SOURCE_SCALE;
        }
      }
      await route.fulfill({ response, json: body });
    });

    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => {
      consoleErrors.push(error.message);
    });
    page.on('response', (response) => {
      const url = response.url();
      if (!url.includes('/api/media/')) return;

      try {
        const parsed = new URL(url);
        const variant = parsed.searchParams.get('variant');
        if (!variant) return;
        seenMediaVariants.add(variant);
        const photoId = decodeURIComponent(parsed.pathname.split('/').pop() ?? '');
        const variants = variantsByPhoto.get(photoId) ?? new Set<string>();
        variants.add(variant);
        variantsByPhoto.set(photoId, variants);
      } catch {
        // Playwright response URLs are expected to be absolute; ignore malformed noise.
      }
    });

    await openReadyWall(page);
  });

  test.afterEach(async () => {
    expect(consoleErrors).toEqual([]);
  });

  test('zooming in loads sharper tiers for on-screen photos and keeps the focused view coherent', async ({
    page,
  }, testInfo: TestInfo) => {
    const shell = page.getByTestId('wall-shell');
    const wall = page.getByTestId('wall-canvas');
    const pixi = page.getByTestId('wall-pixi-surface');

    await expect(shell).toHaveAttribute('data-active-album-area-count', '1');
    await expect(pixi).toHaveAttribute('data-media-variant', 'thumb');
    await expect(pixi).toHaveAttribute('data-app-init-count', '1');
    await expect.poll(() => seenMediaVariants.has('thumb')).toBe(true);

    await zoomToMax(page, wall);
    expect(Number.parseFloat(await requiredAttr(wall, 'data-zoom'))).toBeGreaterThan(
      FAR_ZOOM_MAX,
    );
    // At max zoom on a 2x display, on-screen tiles need at least the modal tier
    // (detail where the tiles are large, e.g. desktop).
    await expect(pixi).toHaveAttribute('data-media-variant', /^(modal|detail)$/);
    const largestVariant = await requiredAttr(pixi, 'data-media-variant');
    await expect.poll(() => seenMediaVariants.has(largestVariant)).toBe(true);
    await expect(pixi).toHaveAttribute('data-app-init-count', '1');

    const { photoId: centeredId } = await exposedTileNearCenter(page);
    await expect
      .poll(() => [...(variantsByPhoto.get(centeredId) ?? [])].some((v) => v === 'modal' || v === 'detail'))
      .toBe(true);

    const zoomTierScreenshotPath = testInfo.outputPath('zoom-detail-modal-tier.png');
    await page.screenshot({ path: zoomTierScreenshotPath, fullPage: false });
    await testInfo.attach('zoom-detail-modal-tier', {
      path: zoomTierScreenshotPath,
      contentType: 'image/png',
    });

    const { photoId, x, y } = await exposedTileNearCenter(page);

    // Zoomed-in tiles can be larger than the screen, so tap a point, not the element.
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    if (coarse) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);

    const modal = page.getByTestId('focused-photo-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('data-photo-id', photoId);
    await expect(modal).toHaveAttribute('data-focused-view-kind', 'lightbox');
    await expect(page.getByTestId('focused-photo-image')).toHaveAttribute(
      'src',
      new RegExp(`${encodeURIComponent(photoId)}\\?variant=modal`),
    );
  });
});

async function openReadyWall(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('wall-shell')).toHaveAttribute('data-screen', 'ready', {
    timeout: 60_000,
  });
  await expect(page.getByTestId('wall-photo-tile').first()).toBeVisible();
}

async function zoomToMax(page: Page, wall: Locator): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const zoomBefore = await requiredAttr(wall, 'data-zoom');
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -220);
    await page.keyboard.up('Control');
    const changed = await expect
      .poll(async () => requiredAttr(wall, 'data-zoom'), { timeout: 1_000 })
      .not.toBe(zoomBefore)
      .then(() => true, () => false);
    if (!changed) return;
  }
}

/** The tile on top (not under an overlay or control) nearest the viewport center. */
async function exposedTileNearCenter(
  page: Page,
): Promise<{ photoId: string; x: number; y: number }> {
  const hit = await page.evaluate(() => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    let best: { photoId: string; x: number; y: number; score: number } | null = null;
    for (let x = 10; x < window.innerWidth; x += 20) {
      for (let y = 10; y < window.innerHeight; y += 20) {
        const top = document.elementFromPoint(x, y);
        if (!(top instanceof HTMLElement) || top.dataset['testid'] !== 'wall-photo-tile') continue;
        const photoId = top.dataset['photoId'];
        const score = (x - cx) ** 2 + (y - cy) ** 2;
        if (photoId && (!best || score < best.score)) best = { photoId, x, y, score };
      }
    }
    return best;
  });
  if (!hit) throw new Error('No exposed wall photo tile on screen');
  return hit;
}

async function requiredAttr(locator: Locator, name: string): Promise<string> {
  const value = await locator.getAttribute(name);
  if (!value) {
    throw new Error(`Expected ${name} on ${locator.toString()}`);
  }
  return value;
}
