import { HOVER_POP_SCALE } from '../src/client/src/features/wall/hoverPreview.js';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

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

  test('hover pops the photo out slightly above its neighbors with a drop shadow', async ({
    page,
  }, testInfo: TestInfo) => {
    const shell = page.getByTestId('wall-shell');
    const wall = page.getByTestId('wall-canvas');
    const tile = await pickCenteredTile(page);
    const photoId = await requiredAttr(tile, 'data-photo-id');

    await expect(shell).toHaveAttribute('data-active-album-area-count', '1');

    await tile.hover();

    const preview = page.getByTestId('wall-hover-preview');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute('data-photo-id', photoId);
    await expect(page.getByTestId('wall-hover-preview-image')).toHaveAttribute(
      'src',
      new RegExp(`${encodeURIComponent(photoId)}\\?variant=`),
    );
    // Lifted above the wall: casts a shadow and sits over the canvas.
    const lift = await preview.evaluate((element) => {
      const style = getComputedStyle(element);
      return { boxShadow: style.boxShadow, zIndex: Number(style.zIndex) };
    });
    expect(lift.boxShadow).not.toBe('none');
    expect(lift.zIndex).toBeGreaterThan(0);

    const hoverScreenshotPath = testInfo.outputPath('wall-hover-preview.png');
    await page.screenshot({ path: hoverScreenshotPath, fullPage: false });
    await testInfo.attach('wall-hover-preview', {
      path: hoverScreenshotPath,
      contentType: 'image/png',
    });

    // Let the pop animation and any hover center pan settle.
    await expect
      .poll(() => preview.evaluate((element) => element.getAnimations().length))
      .toBe(0);
    await expect
      .poll(async () => {
        const first = await wall.getAttribute('data-camera-x');
        await page.waitForTimeout(250);
        return first === (await wall.getAttribute('data-camera-x'));
      })
      .toBe(true);

    // Measure the pop and the copy of the hovered photo it sits on in one frame.
    const { pop, tileUnder } = await preview.evaluate((element, id) => {
      const popRect = element.getBoundingClientRect();
      const cx = popRect.left + popRect.width / 2;
      const cy = popRect.top + popRect.height / 2;
      const tiles = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-testid="wall-photo-tile"][data-photo-id="${id}"]`),
      ).map((node) => node.getBoundingClientRect());
      tiles.sort(
        (a, b) =>
          Math.hypot(a.left + a.width / 2 - cx, a.top + a.height / 2 - cy) -
          Math.hypot(b.left + b.width / 2 - cx, b.top + b.height / 2 - cy),
      );
      const plain = (r: DOMRect) => ({ x: r.left, y: r.top, width: r.width, height: r.height });
      return { pop: plain(popRect), tileUnder: plain(tiles[0]!) };
    }, photoId);

    await page.mouse.click(pop.x + pop.width / 2, pop.y + pop.height / 2);

    const modal = page.getByTestId('focused-photo-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('data-photo-id', photoId);
    await expect(modal).toHaveAttribute('data-focused-view-kind', 'lightbox');
    await expect(preview).toHaveCount(0);

    const modalImage = page.getByTestId('focused-photo-image');
    await expect(modalImage).toBeVisible();

    const focusedScreenshotPath = testInfo.outputPath('focused-photo-open.png');
    await page.screenshot({ path: focusedScreenshotPath, fullPage: false });
    await testInfo.attach('focused-photo-open', {
      path: focusedScreenshotPath,
      contentType: 'image/png',
    });

    // A small pop always centered on the photo itself, never shifted into view.
    expect(pop.width / tileUnder.width).toBeCloseTo(HOVER_POP_SCALE, 1);
    expect(pop.height / tileUnder.height).toBeCloseTo(HOVER_POP_SCALE, 1);
    expect(Math.abs(pop.x + pop.width / 2 - (tileUnder.x + tileUnder.width / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(pop.y + pop.height / 2 - (tileUnder.y + tileUnder.height / 2))).toBeLessThanOrEqual(1);
  });

  test('each newly hovered photo pops in while the previous one settles back', async ({
    page,
  }) => {
    // Zoom out so a couple of photos fit entirely on screen.
    const wall = page.getByTestId('wall-canvas');
    await page.mouse.move(720, 480);
    await page.keyboard.down('Control');
    for (let step = 0; step < 6; step += 1) await page.mouse.wheel(0, 40);
    await page.keyboard.up('Control');
    await expect.poll(async () => Number(await wall.getAttribute('data-zoom'))).toBeLessThan(0.7);
    await page.mouse.move(1, 1);
    await expect
      .poll(async () => {
        const first = await wall.getAttribute('data-camera-x');
        await page.waitForTimeout(400);
        return first === (await wall.getAttribute('data-camera-x'));
      })
      .toBe(true);
    const targets = await page.getByTestId('wall-photo-tile').evaluateAll((nodes) => {
      const seen = new Set<string>();
      const points: Array<{ id: string; x: number; y: number }> = [];
      for (const node of nodes) {
        const el = node as HTMLElement;
        const id = el.dataset['photoId']!;
        const r = el.getBoundingClientRect();
        const fullyVisible =
          r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight;
        if (!fullyVisible || r.width < 60 || seen.has(id)) continue;
        seen.add(id);
        points.push({ id, x: r.left + r.width / 2, y: r.top + r.height / 2 });
      }
      return points.slice(0, 2);
    });
    expect(targets).toHaveLength(2);
    const [first, second] = targets as [(typeof targets)[0], (typeof targets)[0]];

    const preview = page.getByTestId('wall-hover-preview');
    await page.mouse.move(first.x, first.y);
    await expect(preview).toHaveAttribute('data-photo-id', first.id);
    await expect
      .poll(() => preview.evaluate((element) => element.getAnimations().length))
      .toBe(0);

    // Record whether each pop element animates as it mounts.
    await page.evaluate(() => {
      const mounts: Array<{ kind: string; id: string; animated: boolean }> = [];
      (window as unknown as { __popMounts: typeof mounts }).__popMounts = mounts;
      new MutationObserver((records) => {
        for (const record of records) {
          for (const node of Array.from(record.addedNodes)) {
            if (!(node instanceof HTMLElement)) continue;
            const kind = node.dataset['testid'] ?? '';
            if (!kind.startsWith('wall-hover-preview')) continue;
            mounts.push({ kind, id: node.dataset['photoId']!, animated: node.getAnimations().length > 0 });
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    });
    await page.mouse.move(second.x, second.y);
    await expect(preview).toHaveAttribute('data-photo-id', second.id);
    // A fresh pop element per photo, so its pop-in animation plays again,
    // while the previous photo animates back down into the wall.
    const mounts = await page.evaluate(
      () =>
        (window as unknown as { __popMounts: Array<{ kind: string; id: string; animated: boolean }> })
          .__popMounts,
    );
    expect(mounts).toContainEqual({ kind: 'wall-hover-preview', id: second.id, animated: true });
    expect(mounts).toContainEqual({ kind: 'wall-hover-preview-settling', id: first.id, animated: true });
    const settling = page.getByTestId('wall-hover-preview-settling');
    await expect(settling).toHaveCount(0);
  });

  test('sub-threshold pointer jitter still opens the correct focused-photo modal', async ({
    page,
  }) => {
    const shell = page.getByTestId('wall-shell');
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

  test('dragging past the threshold pans the wall, hides the hover preview, and suppresses modal open', async ({
    page,
  }) => {
    const shell = page.getByTestId('wall-shell');
    const wall = page.getByTestId('wall-canvas');
    const tile = await pickCenteredTile(page);
    const tileBox = await requiredBox(tile);
    const cameraXBefore = await requiredAttr(wall, 'data-camera-x');
    const cameraYBefore = await requiredAttr(wall, 'data-camera-y');

    await tile.hover();
    await expect(page.getByTestId('wall-hover-preview')).toBeVisible();

    const centerX = tileBox.x + tileBox.width / 2;
    const centerY = tileBox.y + tileBox.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + 48, centerY + 20, { steps: 6 });

    await expect(page.getByTestId('wall-hover-preview')).toHaveCount(0);
    await expect(wall).toHaveAttribute('data-dragging', 'true');

    await page.mouse.up();

    await expect(page.getByTestId('focused-photo-modal')).toHaveCount(0);
    await expect(wall).toHaveAttribute('data-dragging', 'false');

    const cameraXAfter = await requiredAttr(wall, 'data-camera-x');
    const cameraYAfter = await requiredAttr(wall, 'data-camera-y');
    expect(
      cameraXAfter !== cameraXBefore || cameraYAfter !== cameraYBefore,
    ).toBe(true);
  });

  test('the focused view keeps hover preview suppressed while open', async ({
    page,
  }) => {
    const shell = page.getByTestId('wall-shell');
    const wall = page.getByTestId('wall-canvas');
    const tile = await pickCenteredTile(page);
    const tileBox = await requiredBox(tile);


    await tile.click();

    const modal = page.getByTestId('focused-photo-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('data-focused-view-kind', 'lightbox');
    await expect(page.getByTestId('wall-hover-preview')).toHaveCount(0);

    await page.mouse.move(
      tileBox.x + tileBox.width / 2,
      tileBox.y + tileBox.height / 2,
    );
    await expect(page.getByTestId('wall-hover-preview')).toHaveCount(0);
    await expect(wall).toHaveAttribute('data-dragging', 'false');
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
