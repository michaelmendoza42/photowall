import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { NEAR_ZOOM_MIN } from '../src/client/src/features/wall/pixiScene.js';

test.describe('zoom/detail tiers', () => {
  let consoleErrors: string[];
  let seenMediaVariants: Set<string>;

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    seenMediaVariants = new Set();

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
        const variant = new URL(url).searchParams.get('variant');
        if (variant) seenMediaVariants.add(variant);
      } catch {
        // Playwright response URLs are expected to be absolute; ignore malformed noise.
      }
    });

    await openReadyWall(page);
  });

  test.afterEach(async () => {
    expect(consoleErrors).toEqual([]);
  });

  test('keeps derivative tiers coherent across overview, wall, near-detail, and focused view', async ({
    page,
  }, testInfo: TestInfo) => {
    const shell = page.getByTestId('wall-shell');
    const wall = page.getByTestId('wall-canvas');
    const pixi = page.getByTestId('wall-pixi-surface');

    await expect(shell).toHaveAttribute('data-active-album-area-count', '1');
    await expect(pixi).toHaveAttribute('data-media-variant', 'thumb');
    await expect(pixi).toHaveAttribute('data-app-init-count', '1');
    await expect.poll(() => seenMediaVariants.has('thumb')).toBe(true);

    await zoomUntilVariant(page, wall, pixi, 'modal', -220);
    await expect.poll(() => seenMediaVariants.has('modal')).toBe(true);
    await expect(pixi).toHaveAttribute('data-app-init-count', '1');

    expect(Number.parseFloat(await requiredAttr(wall, 'data-zoom'))).toBeGreaterThanOrEqual(
      NEAR_ZOOM_MIN,
    );
    await expect.poll(() => seenMediaVariants.has('modal')).toBe(true);
    await expect(pixi).toHaveAttribute('data-app-init-count', '1');

    const zoomTierScreenshotPath = testInfo.outputPath('zoom-detail-modal-tier.png');
    await page.screenshot({ path: zoomTierScreenshotPath, fullPage: false });
    await testInfo.attach('zoom-detail-modal-tier', {
      path: zoomTierScreenshotPath,
      contentType: 'image/png',
    });

    const tile = await pickCenteredTile(page);
    const photoId = await requiredAttr(tile, 'data-photo-id');

    await tile.click();

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

async function zoomUntilVariant(
  page: Page,
  wall: Locator,
  pixi: Locator,
  expectedVariant: 'thumb' | 'modal',
  deltaY: number,
): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if ((await pixi.getAttribute('data-media-variant')) === expectedVariant) {
      return;
    }

    const zoomBefore = await requiredAttr(wall, 'data-zoom');
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, deltaY);
    await page.keyboard.up('Control');
    await expect.poll(async () => requiredAttr(wall, 'data-zoom')).not.toBe(zoomBefore);
  }

  await expect(pixi).toHaveAttribute('data-media-variant', expectedVariant);
}

async function pickCenteredTile(page: Page): Promise<Locator> {
  const tiles = page.getByTestId('wall-photo-tile');
  const index = await tiles.evaluateAll((nodes) => {
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;

    nodes.forEach((node, index) => {
      if (!(node instanceof HTMLElement)) return;
      const rect = node.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 40) return;

      const visibleWidth =
        Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
      const visibleHeight =
        Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
      if (visibleWidth < rect.width * 0.6 || visibleHeight < rect.height * 0.6) {
        return;
      }

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = centerX - viewportCenterX;
      const dy = centerY - viewportCenterY;
      const score = dx * dx + dy * dy;

      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    return bestIndex;
  });

  return tiles.nth(index);
}

async function requiredAttr(locator: Locator, name: string): Promise<string> {
  const value = await locator.getAttribute(name);
  if (!value) {
    throw new Error(`Expected ${name} on ${locator.toString()}`);
  }
  return value;
}
