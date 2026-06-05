import { expect, test, type Locator, type Page } from '@playwright/test';

test.describe('photo wall hover / click / modal contract', () => {
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

  test('hover shows an anchored preview halfway between the current tile and focused modal sizes', async ({
    page,
  }) => {
    const tile = await pickCenteredTile(page);
    const photoId = await requiredAttr(tile, 'data-photo-id');

    await tile.hover();

    const preview = page.getByTestId('wall-hover-preview');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute('data-photo-id', photoId);
    await expect(page.getByTestId('wall-hover-preview-image')).toHaveAttribute(
      'src',
      new RegExp(`${encodeURIComponent(photoId)}\\?variant=modal`),
    );

    const previewBox = await requiredBox(preview);
    const tileBox = await requiredBox(tile);

    await tile.click();

    const modal = page.getByTestId('focused-photo-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('data-photo-id', photoId);
    await expect(preview).toHaveCount(0);

    const modalImage = page.getByTestId('focused-photo-image');
    await expect(modalImage).toBeVisible();
    const modalBox = await requiredBox(modalImage);

    expect(Math.abs(previewBox.width - (tileBox.width + modalBox.width) / 2)).toBeLessThanOrEqual(8);
    expect(Math.abs(previewBox.height - (tileBox.height + modalBox.height) / 2)).toBeLessThanOrEqual(8);
  });

  test('sub-threshold pointer jitter still opens the correct focused-photo modal', async ({
    page,
  }) => {
    const wall = page.getByTestId('wall-canvas');
    const tile = await pickCenteredTile(page);
    const photoId = await requiredAttr(tile, 'data-photo-id');
    const tileBox = await requiredBox(tile);
    const cameraXBefore = await requiredAttr(wall, 'data-camera-x');
    const cameraYBefore = await requiredAttr(wall, 'data-camera-y');

    const centerX = tileBox.x + tileBox.width / 2;
    const centerY = tileBox.y + tileBox.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + 2, centerY + 1, { steps: 2 });
    await page.mouse.up();

    const modal = page.getByTestId('focused-photo-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('data-photo-id', photoId);
    await expect(page.getByTestId('focused-photo-image')).toHaveAttribute(
      'src',
      new RegExp(`${encodeURIComponent(photoId)}\\?variant=modal`),
    );

    await page.getByTestId('focused-photo-close').click();
    await expect(modal).toHaveCount(0);
    await expect(page.getByTestId('wall-shell')).toHaveAttribute(
      'data-modal-open',
      'false',
    );
    await expect(wall).toHaveAttribute('data-camera-x', cameraXBefore);
    await expect(wall).toHaveAttribute('data-camera-y', cameraYBefore);
  });

  test('dragging past the threshold pans the wall and suppresses modal open', async ({
    page,
  }) => {
    const wall = page.getByTestId('wall-canvas');
    const tile = await pickCenteredTile(page);
    const tileBox = await requiredBox(tile);
    const cameraXBefore = await requiredAttr(wall, 'data-camera-x');
    const cameraYBefore = await requiredAttr(wall, 'data-camera-y');

    const centerX = tileBox.x + tileBox.width / 2;
    const centerY = tileBox.y + tileBox.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + 48, centerY + 20, { steps: 6 });
    await page.mouse.up();

    await expect(page.getByTestId('focused-photo-modal')).toHaveCount(0);
    await expect(wall).toHaveAttribute('data-dragging', 'false');

    const cameraXAfter = await requiredAttr(wall, 'data-camera-x');
    const cameraYAfter = await requiredAttr(wall, 'data-camera-y');
    expect(
      cameraXAfter !== cameraXBefore || cameraYAfter !== cameraYBefore,
    ).toBe(true);
  });
});

async function openReadyWall(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('wall-shell')).toHaveAttribute('data-screen', 'ready', {
    timeout: 60_000,
  });
  await expect(page.getByTestId('wall-photo-tile').first()).toBeVisible();
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

async function requiredBox(locator: Locator): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(`Expected visible bounding box for ${locator.toString()}`);
  }
  return box;
}
