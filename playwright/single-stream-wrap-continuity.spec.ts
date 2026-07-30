import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

test.describe('single-stream wrap continuity', () => {
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

  test('keeps the same render window after full-period wrap travel without reinitializing Pixi', async ({
    page,
  }, testInfo: TestInfo) => {
    const shell = page.getByTestId('wall-shell');
    const wall = page.getByTestId('wall-canvas');
    const pixi = page.getByTestId('wall-pixi-surface');

    await expect(pixi).toHaveAttribute('data-app-init-count', '1');

    const before = await collectDiagnostics(page);
    expect(before.spriteCount).toBeGreaterThan(0);
    expect(before.renderWindowRowCopies).toBeGreaterThan(0);
    expect(before.renderWindowSegments).toBeGreaterThan(0);
    expect(before.renderWindowXCopies).toBeGreaterThan(0);

    await wall.evaluate((element, deltaX) => {
      element.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaX,
      }));
    }, before.worldWidth);

    await expect.poll(async () => requiredAttr(wall, 'data-render-x')).toBe(before.renderX);
    await expect.poll(async () => requiredAttr(wall, 'data-render-y')).toBe(before.renderY);
    await expect.poll(async () => requiredAttr(pixi, 'data-app-init-count')).toBe('1');

    const after = await collectDiagnostics(page);

    expect(after.centerPhotoId).toBe(before.centerPhotoId);
    expect(after.renderedTiles).toBe(before.renderedTiles);
    expect(after.spriteCount).toBe(before.spriteCount);
    expect(after.renderWindowRowCopies).toBe(before.renderWindowRowCopies);
    expect(after.renderWindowSegments).toBe(before.renderWindowSegments);
    expect(after.renderWindowXCopies).toBe(before.renderWindowXCopies);
    expect(after.cameraX !== before.cameraX || after.cameraY !== before.cameraY).toBe(true);

    const screenshotPath = testInfo.outputPath('single-stream-wrap-continuity.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await testInfo.attach('single-stream-wrap-continuity', {
      path: screenshotPath,
      contentType: 'image/png',
    });
  });
});

async function openReadyWall(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('wall-shell')).toHaveAttribute('data-screen', 'ready', {
    timeout: 60_000,
  });
  await expect(page.getByTestId('wall-photo-tile').first()).toBeVisible();
}

async function collectDiagnostics(page: Page): Promise<{
  cameraX: string;
  cameraY: string;
  renderX: string;
  renderY: string;
  centerPhotoId: string;
  spriteCount: number;
  renderedTiles: number;
  renderWindowRowCopies: number;
  renderWindowSegments: number;
  renderWindowXCopies: number;
  worldWidth: number;
  contentHeight: number;
}> {
  const wall = page.getByTestId('wall-canvas');
  const pixi = page.getByTestId('wall-pixi-surface');
  const centeredTile = await pickCenteredTile(page);

  return {
    cameraX: await requiredAttr(wall, 'data-camera-x'),
    cameraY: await requiredAttr(wall, 'data-camera-y'),
    renderX: await requiredAttr(wall, 'data-render-x'),
    renderY: await requiredAttr(wall, 'data-render-y'),
    centerPhotoId: await requiredAttr(centeredTile, 'data-photo-id'),
    spriteCount: Number.parseInt(await requiredAttr(pixi, 'data-sprite-count'), 10),
    renderedTiles: Number.parseInt(await requiredAttr(wall, 'data-rendered-tiles'), 10),
    renderWindowRowCopies: Number.parseInt(
      await requiredAttr(wall, 'data-render-window-row-copies'),
      10,
    ),
    renderWindowSegments: Number.parseInt(
      await requiredAttr(wall, 'data-render-window-segments'),
      10,
    ),
    renderWindowXCopies: Number.parseInt(
      await requiredAttr(wall, 'data-render-window-x-copies'),
      10,
    ),
    worldWidth: Math.max(1, Number.parseFloat(await requiredAttr(wall, 'data-world-width'))),
    contentHeight: Math.max(
      1,
      Math.round(Number.parseFloat(await requiredAttr(wall, 'data-content-height'))),
    ),
  };
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
    throw new Error(`Expected ${name}`);
  }
  return value;
}
