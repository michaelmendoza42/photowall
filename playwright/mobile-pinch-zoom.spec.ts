import { expect, test, type Page } from '@playwright/test';

test('supports two-finger pinch zoom and touch zoom controls', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch zoom controls are intentionally mobile-only');
  await page.goto('/');
  const wall = page.getByTestId('wall-canvas');
  await expect(wall).toHaveAttribute('data-zoom', '1.00', { timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();

  await page.getByRole('button', { name: 'Zoom in' }).evaluate((button) => (button as HTMLElement).click());
  await expect.poll(() => wall.getAttribute('data-zoom')).not.toBe('1.00');
  const afterButton = Number.parseFloat((await wall.getAttribute('data-zoom'))!);

  await wall.evaluate((element) => {
    const touch = (identifier: number, x: number, y: number) =>
      new Touch({ identifier, target: element, clientX: x, clientY: y });
    element.dispatchEvent(new TouchEvent('touchmove', {
      touches: [touch(1, 40, 120), touch(2, 140, 120)], bubbles: true, cancelable: true,
    }));
    element.dispatchEvent(new TouchEvent('touchmove', {
      touches: [touch(1, 40, 120), touch(2, 260, 120)], bubbles: true, cancelable: true,
    }));
  });

  await expect.poll(async () => Number.parseFloat((await wall.getAttribute('data-zoom'))!)).toBeGreaterThan(afterButton);
});

/**
 * An exposed tile point (not under the debug overlay or controls) nearest the
 * screen center, away from the top-left so a corner pivot would visibly drift.
 */
async function exposedTilePointNearCenter(page: Page): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(() => {
    let best: { x: number; y: number; score: number } | null = null;
    for (let x = 80; x < window.innerWidth - 20; x += 10) {
      for (let y = 80; y < window.innerHeight - 20; y += 10) {
        const top = document.elementFromPoint(x, y);
        if (!(top instanceof HTMLElement) || top.dataset['testid'] !== 'wall-photo-tile') continue;
        const score = (x - innerWidth / 2) ** 2 + (y - innerHeight / 2) ** 2;
        if (!best || score < best.score) best = { x, y, score };
      }
    }
    return best;
  });
  if (!point) throw new Error('No exposed wall photo tile');
  return { x: point.x, y: point.y };
}

/** Which photo is under a screen point, and where inside it (0–1 fractions). */
async function photoPointAt(page: Page, x: number, y: number) {
  return page.evaluate(([px, py]) => {
    const tile = document
      .elementsFromPoint(px, py)
      .find((node) => node instanceof HTMLElement && node.dataset['testid'] === 'wall-photo-tile');
    if (!(tile instanceof HTMLElement)) return null;
    const rect = tile.getBoundingClientRect();
    return {
      photoId: tile.dataset['photoId'],
      fx: (px - rect.left) / rect.width,
      fy: (py - rect.top) / rect.height,
    };
  }, [x, y] as const);
}

test('two-finger pinch zooms around the pinch point, not the screen corner', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch pinch is mobile-only');
  await page.goto('/');
  const wall = page.getByTestId('wall-canvas');
  await expect(wall).toHaveAttribute('data-zoom', '1.00', { timeout: 60_000 });
  await expect(page.getByTestId('wall-photo-tile').first()).toBeVisible();

  const mid = await exposedTilePointNearCenter(page);
  const before = await photoPointAt(page, mid.x, mid.y);
  expect(before).not.toBeNull();

  await wall.evaluate((element, center) => {
    const touch = (identifier: number, x: number, y: number) =>
      new Touch({ identifier, target: element, clientX: x, clientY: y });
    for (const half of [40, 70, 100]) {
      element.dispatchEvent(new TouchEvent('touchmove', {
        touches: [touch(1, center.x - half, center.y), touch(2, center.x + half, center.y)],
        bubbles: true,
        cancelable: true,
      }));
    }
    element.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true }));
  }, mid);

  await expect.poll(async () => Number.parseFloat((await wall.getAttribute('data-zoom'))!)).toBeGreaterThan(1.5);
  await expect.poll(() => photoPointAt(page, mid.x, mid.y)).toMatchObject({ photoId: before!.photoId });
  const after = await photoPointAt(page, mid.x, mid.y);
  expect(Math.abs(after!.fx - before!.fx)).toBeLessThan(0.05);
  expect(Math.abs(after!.fy - before!.fy)).toBeLessThan(0.05);
});

test('ctrl/⌘ wheel (trackpad pinch) zooms around the cursor', async ({ page, isMobile }) => {
  test.skip(isMobile, 'trackpad pinch is desktop-only');
  await page.goto('/');
  const wall = page.getByTestId('wall-canvas');
  await expect(wall).toHaveAttribute('data-zoom', '1.00', { timeout: 60_000 });
  await expect(page.getByTestId('wall-photo-tile').first()).toBeVisible();

  const cursor = await exposedTilePointNearCenter(page);
  const before = await photoPointAt(page, cursor.x, cursor.y);
  expect(before).not.toBeNull();

  await page.mouse.move(cursor.x, cursor.y);
  await page.keyboard.down('Control');
  for (let step = 0; step < 6; step += 1) await page.mouse.wheel(0, -8);
  await page.keyboard.up('Control');

  await expect.poll(async () => Number.parseFloat((await wall.getAttribute('data-zoom'))!)).toBeGreaterThan(1.5);
  await expect.poll(() => photoPointAt(page, cursor.x, cursor.y)).toMatchObject({ photoId: before!.photoId });
  const after = await photoPointAt(page, cursor.x, cursor.y);
  expect(Math.abs(after!.fx - before!.fx)).toBeLessThan(0.05);
  expect(Math.abs(after!.fy - before!.fy)).toBeLessThan(0.05);
});
