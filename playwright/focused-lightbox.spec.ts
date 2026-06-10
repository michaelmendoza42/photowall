import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

test.describe('focused-photo lightbox flow', () => {
  test.describe.configure({ timeout: 60_000 });
  let consoleErrors: string[];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];

    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => {
      consoleErrors.push(error.message);
    });

    await openReadyWall(page);
  });

  test.afterEach(async () => {
    expect(consoleErrors).toEqual([]);
  });

  test('opens the focused-photo lightbox, closes explicitly, and returns to the same wall context', async ({
    page,
  }, testInfo: TestInfo) => {
    const shell = page.getByTestId('wall-shell');
    const wall = page.getByTestId('wall-canvas');

    await zoomWall(page, wall);

    const tile = await pickCenteredTile(page);
    const photoId = await requiredAttr(tile, 'data-photo-id');
    const cameraXBefore = await requiredAttr(wall, 'data-camera-x');
    const cameraYBefore = await requiredAttr(wall, 'data-camera-y');
    const zoomBefore = await requiredAttr(wall, 'data-zoom');

    await tile.click();

    const modal = page.getByTestId('focused-photo-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('data-photo-id', photoId);
    await expect(modal).toHaveAttribute('data-focused-view-kind', 'lightbox');
    await expect(page.getByTestId('focused-photo-image')).toHaveAttribute(
      'src',
      new RegExp(`${encodeURIComponent(photoId)}\\?variant=modal`),
    );

    const screenshotPath = testInfo.outputPath('focused-lightbox-open.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await testInfo.attach('focused-lightbox-open', {
      path: screenshotPath,
      contentType: 'image/png',
    });

    await page.getByTestId('focused-photo-close').click();
    await expect(modal).toHaveCount(0);
    await expect(shell).toHaveAttribute('data-modal-open', 'false');
    await expect(wall).toHaveAttribute('data-camera-x', cameraXBefore);
    await expect(wall).toHaveAttribute('data-camera-y', cameraYBefore);
    await expect(wall).toHaveAttribute('data-zoom', zoomBefore);

    const cameraYAfterClose = await requiredAttr(wall, 'data-camera-y');
    await page.mouse.wheel(0, 180);
    await expect
      .poll(async () => requiredAttr(wall, 'data-camera-y'))
      .not.toBe(cameraYAfterClose);
  });
});

async function openReadyWall(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('wall-shell')).toHaveAttribute('data-screen', 'ready', {
    timeout: 60_000,
  });
  await expect(page.getByTestId('wall-photo-tile').first()).toBeVisible();
}

async function zoomWall(page: Page, wall: Locator): Promise<void> {
  const zoomBefore = await requiredAttr(wall, 'data-zoom');
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -220);
  await page.keyboard.up('Control');
  await expect.poll(async () => requiredAttr(wall, 'data-zoom')).not.toBe(zoomBefore);
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
