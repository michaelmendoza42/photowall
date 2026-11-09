import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { PhotosQuerySuccessResponse } from '../src/shared/api/photos.js';

test.describe('grouped album areas', () => {
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
  });

  test.afterEach(async () => {
    expect(consoleErrors).toEqual([]);
  });

  test('renders grouped folder selections with separate album areas', async ({
    page,
  }, testInfo: TestInfo) => {
    await openReadyWall(page);
    await openControls(page);
    await page.getByTestId('controls-multi-select').check();
    await page.getByTestId('controls-folder-expand-2024').click();
    await page.getByTestId('controls-folder-2024/travel-iceland').click();
    await page.getByTestId('controls-folder-2024/wedding-anna').click();
    await closeControls(page);

    const shell = page.getByTestId('wall-shell');
    const wall = page.getByTestId('wall-canvas');

    await expect(shell).toHaveAttribute('data-layout-mode', 'grouped');
    await expect(shell).toHaveAttribute('data-active-album-area-count', '2');
    await expect(wall).toHaveAttribute('data-layout-mode', 'grouped');
    await expect(page.getByTestId('wall-photo-tile').first()).toHaveAttribute(
      'data-album-key',
      /folder:2024\/(travel-iceland|wedding-anna)/,
    );

    await expect.poll(async () => summarizeAlbumAreas(page)).toEqual({
      albumKeys: ['folder:2024/travel-iceland', 'folder:2024/wedding-anna'],
      distinctAreaCount: 2,
    });
    await expect(page.locator('.wall-signpost')).toHaveCount(0);

    const screenshotPath = testInfo.outputPath('grouped-album-areas.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await testInfo.attach('grouped-album-areas', {
      path: screenshotPath,
      contentType: 'image/png',
    });
  });

  test('keeps grouped selections populated across paginated reloads', async ({
    page,
  }, testInfo: TestInfo) => {
    await installGroupedCompletenessPaginationMock(page);
    await openReadyWall(page);
    await openControls(page);
    await page.getByTestId('controls-multi-select').check();
    await page.getByTestId('controls-folder-expand-2024').click();
    await page.getByTestId('controls-folder-2024/travel-iceland').click();
    await page.getByTestId('controls-folder-2024/wedding-anna').click();
    await closeControls(page);

    await assertGroupedSelection(page);
    await expect.poll(async () => packedPhotoCount(page)).toBe(SELECTED_PHOTO_COUNT);

    await page.reload();
    await openReadyWall(page);
    await openControls(page);
    await page.getByTestId('controls-folder-expand-2024').click();
    await expect(page.getByTestId('controls-folder-2024/travel-iceland')).toHaveAttribute(
      'data-selected',
      'true',
    );
    await expect(page.getByTestId('controls-folder-2024/wedding-anna')).toHaveAttribute(
      'data-selected',
      'true',
    );
    await closeControls(page);

    await assertGroupedSelection(page);
    await expect.poll(async () => packedPhotoCount(page)).toBe(SELECTED_PHOTO_COUNT);

    const screenshotPath = testInfo.outputPath('grouped-completeness-reload.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await testInfo.attach('grouped-completeness-reload', {
      path: screenshotPath,
      contentType: 'image/png',
    });
  });

  test('restores grouped signpost reveal, glide, and suppression rules', async ({
    page,
  }, testInfo: TestInfo) => {
    await openReadyWall(page);
    await openControls(page);
    await page.getByTestId('controls-multi-select').check();
    await page.getByTestId('controls-folder-expand-2024').click();
    await page.getByTestId('controls-folder-2024/travel-iceland').click();
    await page.getByTestId('controls-folder-2024/wedding-anna').click();
    await closeControls(page);

    await assertGroupedSelection(page);

    const wall = page.getByTestId('wall-canvas');
    const signposts = page.locator('.wall-signpost');
    const wallBox = await wall.boundingBox();
    if (!wallBox) {
      throw new Error('Expected visible grouped wall canvas');
    }

    await page.mouse.move(
      wallBox.x + wallBox.width / 2,
      wallBox.y + wallBox.height / 2,
    );
    await expect(signposts).toHaveCount(0);

    await page.mouse.wheel(420, 0);
    await expect(signposts.first()).toBeVisible();

    const screenshotPath = testInfo.outputPath('grouped-signposts-visible.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await testInfo.attach('grouped-signposts-visible', {
      path: screenshotPath,
      contentType: 'image/png',
    });

    await page.mouse.wheel(8, 0);
    await expect(signposts.first()).toBeVisible();

    const beforeRevealCamera = await cameraPosition(wall);
    const targetTestId = await signposts.evaluateAll((nodes) => {
      for (const node of nodes) {
        if (!(node instanceof HTMLButtonElement)) continue;
        const testId = node.dataset.testid;
        if (!testId) continue;
        node.click();
        return testId;
      }
      return null;
    });
    if (!targetTestId) {
      throw new Error('Expected grouped signpost test id');
    }
    await expect
      .poll(async () => JSON.stringify(await cameraPosition(wall)))
      .not.toBe(JSON.stringify(beforeRevealCamera));

    await page.mouse.move(wallBox.x + 4, wallBox.y + wallBox.height / 2);
    await expect(signposts.first()).toBeVisible();
    await expect(page.locator(`[data-testid="${targetTestId}"]`)).toHaveCount(0);

    const tile = await pickCenteredTile(page);
    const tileBox = await tile.boundingBox();
    if (!tileBox) {
      throw new Error('Expected grouped tile bounding box');
    }

    await page.mouse.click(
      tileBox.x + tileBox.width / 2,
      tileBox.y + tileBox.height / 2,
    );
    await expect(page.getByTestId('focused-photo-modal')).toBeVisible();

    await page.mouse.move(wallBox.x + 4, wallBox.y + wallBox.height / 2);
    await page.mouse.wheel(8, 0);
    await expect(signposts).toHaveCount(0);
  });
});

async function openReadyWall(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await expect(page.getByTestId('wall-shell')).toHaveAttribute('data-screen', 'ready', {
    timeout: 60_000,
  });
  await expect(page.getByTestId('wall-photo-tile').first()).toBeVisible();
}

async function openControls(page: Page): Promise<void> {
  const trigger = page.getByTestId('controls-trigger');
  await trigger.click();
  await expect(page.getByTestId('controls-panel')).toBeVisible();
}

async function closeControls(page: Page): Promise<void> {
  const trigger = page.getByTestId('controls-trigger');
  await trigger.click();
  await expect(page.getByTestId('controls-panel')).toHaveCount(0);
}

async function assertGroupedSelection(page: Page): Promise<void> {
  const shell = page.getByTestId('wall-shell');
  const wall = page.getByTestId('wall-canvas');

  await expect(shell).toHaveAttribute('data-layout-mode', 'grouped');
  await expect(shell).toHaveAttribute('data-active-album-area-count', '2');
  await expect(wall).toHaveAttribute('data-layout-mode', 'grouped');
  await expect.poll(async () => summarizeAlbumAreas(page)).toEqual({
    albumKeys: ['folder:2024/travel-iceland', 'folder:2024/wedding-anna'],
    distinctAreaCount: 2,
  });
}

async function installGroupedCompletenessPaginationMock(page: Page): Promise<void> {
  let groupedSelectionPage: PhotosQuerySuccessResponse | null = null;

  await page.route('**/api/photos**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const folders = requestUrl.searchParams.getAll('folder').sort();
    const cursor = requestUrl.searchParams.get('cursor');
    const isGroupedSelection =
      folders.length === 2 &&
      folders[0] === '2024/travel-iceland' &&
      folders[1] === '2024/wedding-anna';

    if (!isGroupedSelection) {
      await route.continue();
      return;
    }

    if (cursor === 'grouped-page-2') {
      if (!groupedSelectionPage) {
        throw new Error('Expected grouped seed page before follow-up cursor');
      }

      const photos = groupedSelectionPage.photos.filter((photo) =>
        photo.directoryPath.includes('wedding-anna'),
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          ...groupedSelectionPage,
          photos,
          nextCursor: null,
        },
      });
      return;
    }

    const response = await route.fetch();
    const body = (await response.json()) as PhotosQuerySuccessResponse;
    groupedSelectionPage = body;

    const travelSeed = body.photos.filter((photo) =>
      photo.directoryPath.includes('travel-iceland'),
    );

    await route.fulfill({
      response,
      json: {
        ...body,
        photos: travelSeed,
        nextCursor: 'grouped-page-2',
      },
    });
  });
}

/** Iceland (50) plus wedding (70) photos in `fixtures/library-wall`. */
const SELECTED_PHOTO_COUNT = 120;

/** Photos laid out on the wall (tiles off-screen are not mounted). */
async function packedPhotoCount(page: Page): Promise<number> {
  return Number(await page.getByTestId('wall-canvas').getAttribute('data-packed-photo-count'));
}

async function cameraPosition(
  wall: import('@playwright/test').Locator,
): Promise<{ x: string; y: string }> {
  return {
    x: (await wall.getAttribute('data-camera-x')) ?? '0',
    y: (await wall.getAttribute('data-camera-y')) ?? '0',
  };
}

async function pickCenteredTile(
  page: Page,
): Promise<import('@playwright/test').Locator> {
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


async function summarizeAlbumAreas(page: Page): Promise<{
  albumKeys: string[];
  distinctAreaCount: number;
}> {
  return page.getByTestId('wall-photo-tile').evaluateAll((nodes) => {
    const stats = new Map<string, { minLeft: number; maxLeft: number; count: number }>();

    nodes.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      const albumKey = node.dataset['albumKey'];
      if (!albumKey) return;
      const x = Number.parseFloat(node.style.getPropertyValue('--tile-x') || '0');
      const width = node.getBoundingClientRect().width;
      const next = stats.get(albumKey) ?? {
        minLeft: Number.POSITIVE_INFINITY,
        maxLeft: Number.NEGATIVE_INFINITY,
        count: 0,
      };
      next.minLeft = Math.min(next.minLeft, x);
      next.maxLeft = Math.max(next.maxLeft, x + width);
      next.count += 1;
      stats.set(albumKey, next);
    });

    const albumKeys = [...stats.keys()].sort();
    let distinctAreaCount = 0;
    for (const albumKey of albumKeys) {
      const area = stats.get(albumKey);
      if (!area) continue;
      if (area.count > 0 && Number.isFinite(area.minLeft) && Number.isFinite(area.maxLeft)) {
        distinctAreaCount += 1;
      }
    }

    return { albumKeys, distinctAreaCount };
  });
}
