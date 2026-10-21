import { expect, test, type Locator, type Page } from '@playwright/test';
import { HOVER_POP_SCALE } from '../src/client/src/features/wall/hoverPreview.js';

type Fit = 'partial' | 'visible' | 'large';

/**
 * A point on top of an exposed tile at fractions (fx, fy) of the tile. `fit`
 * classifies the tile's popped size against the viewport: partly off-screen
 * but able to fit, fully visible, or larger than the viewport.
 */
async function findTilePoint(page: Page, fx: number, fy: number, fit: Fit) {
  return page.evaluate(
    ({ fx, fy, fit, scale }) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      for (const node of Array.from(document.querySelectorAll<HTMLElement>('[data-testid="wall-photo-tile"]'))) {
        const r = node.getBoundingClientRect();
        const w = r.width * scale;
        const h = r.height * scale;
        const left = r.left - (w - r.width) / 2;
        const top = r.top - (h - r.height) / 2;
        const large = w > vw || h > vh;
        const visible = left >= 0 && top >= 0 && left + w <= vw && top + h <= vh;
        const kind = large ? 'large' : visible ? 'visible' : 'partial';
        if (kind !== fit) continue;
        const x = r.left + r.width * fx;
        const y = r.top + r.height * fy;
        if (x < 5 || y < 5 || x > vw - 5 || y > vh - 5) continue;
        if (document.elementFromPoint(x, y) !== node) continue;
        return { x, y, photoId: node.dataset['photoId']! };
      }
      return null;
    },
    { fx, fy, fit, scale: HOVER_POP_SCALE },
  );
}

async function camera(wall: Locator): Promise<string> {
  return `${await wall.getAttribute('data-camera-x')},${await wall.getAttribute('data-camera-y')}`;
}

async function openWall(page: Page): Promise<Locator> {
  await page.goto('/');
  await expect(page.getByTestId('wall-shell')).toHaveAttribute('data-screen', 'ready', { timeout: 60_000 });
  await expect(page.getByTestId('wall-photo-tile').first()).toBeVisible();
  return page.getByTestId('wall-canvas');
}

async function popCenterOffset(pop: Locator, cursor: { x: number; y: number }): Promise<number> {
  const box = (await pop.boundingBox())!;
  return Math.hypot(box.x + box.width / 2 - cursor.x, box.y + box.height / 2 - cursor.y);
}

test.describe('hover slide to cursor', () => {
  test.skip(({ isMobile }) => isMobile, 'hover is desktop-only');

  test('slowly slides a partly off-screen photo until the cursor is at its center, once', async ({ page }) => {
    const wall = await openWall(page);
    const target = await findTilePoint(page, 0.25, 0.3, 'partial');
    expect(target).not.toBeNull();

    await page.mouse.move(target!.x, target!.y);
    const pop = page.getByTestId('wall-hover-preview');
    await expect(pop).toHaveAttribute('data-photo-id', target!.photoId);
    const startOffset = await popCenterOffset(pop, target!);
    expect(startOffset).toBeGreaterThan(20);

    // It glides rather than jumping: sampled every frame, the offset passes
    // through in-between values on its way to centered.
    const offsets = await page.evaluate(async (cursor) => {
      const samples: number[] = [];
      for (let frame = 0; frame < 180; frame += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const el = document.querySelector<HTMLElement>('[data-testid="wall-hover-preview"]');
        if (!el) continue;
        const box = el.getBoundingClientRect();
        samples.push(Math.hypot(box.x + box.width / 2 - cursor.x, box.y + box.height / 2 - cursor.y));
      }
      return samples;
    }, target!);
    expect(offsets.some((offset) => offset > 3 && offset < startOffset - 2)).toBe(true);
    await expect.poll(() => popCenterOffset(pop, target!), { timeout: 3_000 }).toBeLessThan(3);
    await expect(pop).toHaveAttribute('data-photo-id', target!.photoId);

    // Moving within the same photo afterwards doesn't drag the wall along.
    const settled = await camera(wall);
    await page.mouse.move(target!.x + 15, target!.y + 10, { steps: 3 });
    await page.waitForTimeout(1_200);
    expect(await camera(wall)).toBe(settled);
  });

  test('does not slide a photo that is already fully in the viewport', async ({ page }) => {
    const wall = await openWall(page);
    // Zoom out so some fixture tiles fit entirely on screen.
    await page.mouse.move(720, 480);
    await page.keyboard.down('Control');
    for (let step = 0; step < 6; step += 1) await page.mouse.wheel(0, 40);
    await page.keyboard.up('Control');
    await expect.poll(async () => Number(await wall.getAttribute('data-zoom'))).toBeLessThan(0.7);
    // Parking the mouse can hover a partly off-screen photo, which slides;
    // let that finish before measuring.
    await page.mouse.move(1, 1);
    await expect
      .poll(async () => {
        const first = await camera(wall);
        await page.waitForTimeout(400);
        return first === (await camera(wall));
      })
      .toBe(true);
    const target = await findTilePoint(page, 0.2, 0.25, 'visible');
    expect(target).not.toBeNull();
    const before = await camera(wall);

    await page.mouse.move(target!.x, target!.y);
    await expect(page.getByTestId('wall-hover-preview')).toHaveAttribute('data-photo-id', target!.photoId);
    await page.waitForTimeout(1_200);
    expect(await camera(wall)).toBe(before);
  });

  test('also slides photos larger than the viewport toward the cursor', async ({ page }) => {
    // A short window makes the fixture's tallest tiles taller than the viewport.
    await page.setViewportSize({ width: 900, height: 220 });
    await openWall(page);
    const target = await findTilePoint(page, 0.25, 0.3, 'large');
    expect(target).not.toBeNull();

    await page.mouse.move(target!.x, target!.y);
    const pop = page.getByTestId('wall-hover-preview');
    await expect(pop).toHaveAttribute('data-photo-id', target!.photoId);
    await expect.poll(() => popCenterOffset(pop, target!), { timeout: 3_000 }).toBeLessThan(3);
  });
});
