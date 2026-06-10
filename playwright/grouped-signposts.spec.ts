import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

test.describe('grouped signpost navigation', () => {
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

  test('reveals grouped album signposts, glides on click, and suppresses labels in the modal', async ({
    page,
  }, testInfo: TestInfo) => {
    await openControls(page);
    await page.getByTestId('controls-year-2024').click();
    await closeControls(page);

    const wall = page.getByTestId('wall-canvas');
    await expect(wall).toHaveAttribute('data-layout-mode', 'grouped');

    const wallBox = await wall.boundingBox();
    if (!wallBox) {
      throw new Error('Expected visible wall canvas');
    }

    const beforeRevealCamera = await cameraPosition(wall);
    await page.mouse.move(
      wallBox.x + wallBox.width / 2,
      wallBox.y + wallBox.height / 2,
    );
    await page.mouse.wheel(8, 0);

    const signposts = page.locator('.wall-signpost');
    await expect(signposts.first()).toBeVisible();
    const signpostText = (await signposts.allTextContents()).join(' ');
    expect(signpostText).toMatch(/travel-iceland|wedding-anna/);

    const screenshotPath = testInfo.outputPath('grouped-signposts-visible.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await testInfo.attach('grouped-signposts-visible', {
      path: screenshotPath,
      contentType: 'image/png',
    });

    await page.mouse.wheel(8, 0);
    await expect(signposts.first()).toBeVisible();
    const targetTestId = await firstVisibleSignpostTestId(page);
    await clickSignpostByTestId(page, targetTestId);
    await expect
      .poll(async () => JSON.stringify(await cameraPosition(wall)))
      .not.toBe(JSON.stringify(beforeRevealCamera));

    await page.mouse.wheel(8, 0);
    await expect(signposts.first()).toBeVisible();

    const tile = await pickCenteredTile(page);
    const tileBox = await tile.boundingBox();
    if (!tileBox) {
      throw new Error('Expected centered tile bounding box');
    }
    await page.mouse.click(
      tileBox.x + tileBox.width / 2,
      tileBox.y + tileBox.height / 2,
    );
    const modal = page.getByTestId('focused-photo-modal');
    await expect(modal).toBeVisible();

    await page.mouse.wheel(10, 0);
    await expect(signposts).toHaveCount(0);
  });

  test('multi-folder grouped selection stays populated and survives reload', async ({
    page,
  }) => {
    await openControls(page);
    await page.getByTestId('controls-folder-2024/travel-iceland').click();
    await page.getByTestId('controls-folder-2024/wedding-anna').click();
    await closeControls(page);

    const wall = page.getByTestId('wall-canvas');
    await expect(wall).toHaveAttribute('data-layout-mode', 'grouped');
    await expect
      .poll(async () => countUniquePhotoIds(page))
      .toBe(4);

    await page.reload();
    await openReadyWall(page);
    await openControls(page);
    await expect(page.getByTestId('controls-folder-2024/travel-iceland')).toHaveAttribute(
      'data-selected',
      'true',
    );
    await expect(page.getByTestId('controls-folder-2024/wedding-anna')).toHaveAttribute(
      'data-selected',
      'true',
    );
    await closeControls(page);

    await expect(page.getByTestId('wall-canvas')).toHaveAttribute('data-layout-mode', 'grouped');
    await expect
      .poll(async () => countUniquePhotoIds(page))
      .toBe(4);
  });
});

async function openReadyWall(page: Page): Promise<void> {
  await page.goto('/');
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

async function firstVisibleSignpostTestId(page: Page): Promise<string> {
  const testId = await page.locator('.wall-signpost').evaluateAll((nodes) => {
    for (const node of nodes) {
      if (node instanceof HTMLElement && node.dataset.testid) {
        return node.dataset.testid;
      }
    }
    return null;
  });
  if (!testId) {
    throw new Error('Expected grouped signpost test id');
  }
  return testId;
}

async function clickSignpostByTestId(page: Page, testId: string): Promise<void> {
  await page.evaluate((targetTestId) => {
    const signpost = document.querySelector<HTMLButtonElement>(`[data-testid="${targetTestId}"]`);
    if (!signpost) {
      throw new Error(`Missing grouped signpost: ${targetTestId}`);
    }
    signpost.click();
  }, testId);
}

async function cameraPosition(wall: Locator): Promise<{ x: string; y: string }> {
  return {
    x: (await wall.getAttribute('data-camera-x')) ?? '0',
    y: (await wall.getAttribute('data-camera-y')) ?? '0',
  };
}

async function countUniquePhotoIds(page: Page): Promise<number> {
  return page.getByTestId('wall-photo-tile').evaluateAll((nodes) => {
    const ids = new Set<string>();
    nodes.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      const id = node.dataset['photoId'];
      if (id) ids.add(id);
    });
    return ids.size;
  });
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
