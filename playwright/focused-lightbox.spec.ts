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

  test('next and previous step to adjacent photos and center the wall on each', async ({
    page,
  }) => {
    const shell = page.getByTestId('wall-shell');
    const wall = page.getByTestId('wall-canvas');
    const modal = page.getByTestId('focused-photo-modal');

    await zoomWall(page, wall);
    const tile = await pickCenteredTile(page);
    const startId = await requiredAttr(tile, 'data-photo-id');
    await tile.click();
    await expect(modal).toHaveAttribute('data-photo-id', startId);

    // Press next and watch the wall: it glides there over several frames
    // rather than jumping.
    const cameraPath = await page.evaluate(async () => {
      const wallEl = document.querySelector<HTMLElement>('[data-testid="wall-canvas"]')!;
      const position = () => `${wallEl.dataset['cameraX']},${wallEl.dataset['cameraY']}`;
      const start = position();
      document.querySelector<HTMLElement>('[data-testid="focused-photo-next"]')!.click();
      const samples: string[] = [];
      for (let i = 0; i < 40; i += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        samples.push(position());
      }
      return { start, samples };
    });
    await expect(modal).not.toHaveAttribute('data-photo-id', startId);
    const nextId = await requiredAttr(modal, 'data-photo-id');
    const end = cameraPath.samples.at(-1);
    const inBetween = cameraPath.samples.filter((p) => p !== cameraPath.start && p !== end);
    expect(end).not.toBe(cameraPath.start);
    expect(inBetween.length).toBeGreaterThan(0);
    await expect(page.getByTestId('focused-photo-image')).toHaveAttribute(
      'src',
      new RegExp(`${encodeURIComponent(nextId)}\\?variant=modal`),
    );
    await expect.poll(() => distanceFromViewportCenter(page, nextId)).toBeLessThan(3);

    await page.getByTestId('focused-photo-previous').click();
    await expect(modal).toHaveAttribute('data-photo-id', startId);
    await expect.poll(() => distanceFromViewportCenter(page, startId)).toBeLessThan(3);

    // Arrow keys step too, and keep reaching new photos rather than
    // circling a small group. (That the order is one cycle through every
    // photo is covered by the focusNavigation unit tests.)
    const visited = [startId];
    for (let step = 0; step < 30; step += 1) {
      const before = await requiredAttr(modal, 'data-photo-id');
      await page.keyboard.press('ArrowRight');
      await expect(modal).not.toHaveAttribute('data-photo-id', before);
      const current = await requiredAttr(modal, 'data-photo-id');
      expect(visited).not.toContain(current);
      visited.push(current);
    }
    await page.keyboard.press('ArrowLeft');
    await expect(modal).toHaveAttribute('data-photo-id', visited.at(-2)!);

    const lastId = await requiredAttr(modal, 'data-photo-id');
    await page.getByTestId('focused-photo-close').click();
    await expect(shell).toHaveAttribute('data-modal-open', 'false');
    await expect.poll(() => distanceFromViewportCenter(page, lastId)).toBeLessThan(3);
  });
});

test('clicking outside the focused photo closes it, clicking the photo does not', async ({
  page,
}) => {
  const shell = page.getByTestId('wall-shell');
  const modal = page.getByTestId('focused-photo-modal');
  await openReadyWall(page);
  const tile = await pickCenteredTile(page);
  await tile.click();
  await expect(modal).toBeVisible();

  const box = (await page.getByTestId('focused-photo-image').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  await expect(shell).toHaveAttribute('data-modal-open', 'true');

  const viewport = page.viewportSize()!;
  const right = viewport.width - (box.x + box.width);
  const outside =
    right > 12
      ? { x: box.x + box.width + right / 2, y: viewport.height * 0.85 }
      : { x: viewport.width / 2, y: (box.y + box.height + viewport.height) / 2 };
  await page.mouse.click(outside.x, outside.y);
  await expect(shell).toHaveAttribute('data-modal-open', 'false');
});

test('a sideways trackpad swipe steps once per swipe; zoomed in, it pans instead', async ({
  page,
}) => {
  const modal = page.getByTestId('focused-photo-modal');
  await openReadyWall(page);
  await (await pickCenteredTile(page)).click();
  await expect(modal).toBeVisible();
  const box = (await page.getByTestId('focused-photo-image').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  // Fingers moving left (positive deltaX) step to the next photo, once,
  // even with a long momentum tail.
  const first = await requiredAttr(modal, 'data-photo-id');
  const seen = new Set<string>([first]);
  await trackpadSwipe(page, 1, (id) => seen.add(id));
  const second = await requiredAttr(modal, 'data-photo-id');
  expect(second).not.toBe(first);
  // Only one step for the whole swipe, tail included.
  expect([...seen]).toEqual([first, second]);

  // After the wheel goes quiet, swiping the other way steps back.
  await trackpadSwipe(page, -1);
  await expect(modal).toHaveAttribute('data-photo-id', first);
  await page.waitForTimeout(400);

  // Vertical scrolling never steps.
  for (let i = 0; i < 12; i += 1) await page.mouse.wheel(0, 30);
  await page.waitForTimeout(400);
  await expect(modal).toHaveAttribute('data-photo-id', first);

  // Zoomed in, a sideways swipe pans the photo and stays on it.
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  const frame = page.getByTestId('focused-photo-frame');
  await expect.poll(async () => Number(await frame.getAttribute('data-zoom'))).toBeGreaterThan(1);
  for (let i = 0; i < 12; i += 1) await page.mouse.wheel(30, 0);
  await page.waitForTimeout(400);
  await expect(modal).toHaveAttribute('data-photo-id', first);
});

/**
 * A two-finger sideways trackpad swipe: a quick push, then a momentum
 * tail of decaying events at frame rate for about a second and a half.
 * `direction` 1 is fingers moving left. Reports each photo shown.
 */
async function trackpadSwipe(
  page: Page,
  direction: 1 | -1,
  onPhoto?: (photoId: string) => void,
): Promise<void> {
  const seen = await page.evaluate(async (sign) => {
    const deltas = [
      ...[20, 40, 60, 60],
      ...Array.from({ length: 90 }, (_, i) => Math.max(1, Math.round(60 * 0.95 ** i))),
    ];
    const ids: string[] = [];
    const record = () => {
      const id = document
        .querySelector('[data-testid="focused-photo-modal"]')
        ?.getAttribute('data-photo-id');
      if (id) ids.push(id);
    };
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    for (const delta of deltas) {
      // Re-query each frame: the photo's element may be replaced on a step.
      const target = document.querySelector('[data-testid="focused-photo-image"]')!;
      target.dispatchEvent(
        new WheelEvent('wheel', { deltaX: sign * delta, bubbles: true, cancelable: true }),
      );
      record();
      await frame();
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    record();
    return ids;
  }, direction);
  seen.forEach((id) => onPhoto?.(id));
}

/** Pixels between the viewport center and the nearest copy of the photo's tile center. */
async function distanceFromViewportCenter(page: Page, photoId: string): Promise<number> {
  return page.evaluate((id) => {
    const nodes = document.querySelectorAll<HTMLElement>(
      `[data-testid="wall-photo-tile"][data-photo-id="${CSS.escape(id)}"]`,
    );
    let best = Number.POSITIVE_INFINITY;
    nodes.forEach((node) => {
      const rect = node.getBoundingClientRect();
      const dx = rect.left + rect.width / 2 - window.innerWidth / 2;
      const dy = rect.top + rect.height / 2 - window.innerHeight / 2;
      best = Math.min(best, Math.hypot(dx, dy));
    });
    return best;
  }, photoId);
}

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
