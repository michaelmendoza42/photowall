import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';

test.describe('mobile wall gestures', () => {
  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch gestures are intentionally mobile-only');
    await page.goto('/');
    await expect(page.getByTestId('wall-shell')).toHaveAttribute(
      'data-screen',
      'ready',
      {
        timeout: 60_000,
      },
    );
    await expect(page.getByTestId('wall-photo-tile').first()).toBeVisible();
  });

  test('continues panning briefly after a single-finger drag release', async ({
    page,
  }) => {
    const wall = page.getByTestId('wall-canvas');
    const before = await cameraPosition(wall);

    await performTouchDrag(page, { x: 280, y: 360 }, { x: 180, y: 300 });

    // Direct drag contributes 100px; the post-release tail must carry farther.
    await expect
      .poll(async () => (await cameraPosition(wall)).x)
      .toBeGreaterThan(before.x + 105);
  });

  test('does not open or fling a photo gesture that becomes a pinch', async ({
    page,
  }) => {
    const wall = page.getByTestId('wall-canvas');
    await performPinch(page);
    await page.waitForTimeout(50);
    const afterPinch = await cameraPosition(wall);
    await page.waitForTimeout(250);

    await expect(page.getByTestId('focused-photo-modal')).toHaveCount(0);
    expect(await cameraPosition(wall)).toEqual(afterPinch);
  });

  test('opens a photo whose tile overlaps a later row hit region', async ({
    page,
  }, testInfo: TestInfo) => {
    const candidate = await findTileOverlappedByLaterRow(page);
    expect(candidate).not.toBeNull();
    if (!candidate) return;

    await page.touchscreen.tap(candidate.x, candidate.y);

    const modal = page.getByTestId('focused-photo-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('data-photo-id', candidate.photoId);

    const screenshotPath = testInfo.outputPath('mobile-tap-focused-photo.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await testInfo.attach('mobile-tap-focused-photo', {
      path: screenshotPath,
      contentType: 'image/png',
    });
  });
});

async function performTouchDrag(
  page: Page,
  start: { x: number; y: number },
  end: { x: number; y: number },
): Promise<void> {
  const client = await page.context().newCDPSession(page);
  const touchPoint = (point: { x: number; y: number }) => ({
    ...point,
    id: 41,
    radiusX: 6,
    radiusY: 6,
    force: 1,
  });

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [touchPoint(start)],
  });
  await page.waitForTimeout(20);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [touchPoint(end)],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await client.detach();
}

async function performPinch(page: Page): Promise<void> {
  const client = await page.context().newCDPSession(page);
  const point = (id: number, x: number) => ({
    id,
    x,
    y: 240,
    radiusX: 6,
    radiusY: 6,
    force: 1,
  });

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point(51, 150)],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point(51, 150), point(52, 250)],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [point(51, 110), point(52, 290)],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await client.detach();
}

async function cameraPosition(
  wall: Locator,
): Promise<{ x: number; y: number }> {
  return {
    x: Number.parseFloat((await wall.getAttribute('data-camera-x')) ?? '0'),
    y: Number.parseFloat((await wall.getAttribute('data-camera-y')) ?? '0'),
  };
}

async function findTileOverlappedByLaterRow(page: Page): Promise<{
  photoId: string;
  x: number;
  y: number;
} | null> {
  return page.getByTestId('wall-photo-tile').evaluateAll((tiles) => {
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>('.wall-canvas__row'),
    );
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>('.wall-zoom-controls button'),
    ).map((control) => control.getBoundingClientRect());

    for (const tile of tiles) {
      if (
        !(tile instanceof HTMLElement) ||
        !(tile.parentElement instanceof HTMLElement)
      )
        continue;
      const tileRect = tile.getBoundingClientRect();
      if (
        tileRect.width < 40 ||
        tileRect.height < 40 ||
        tileRect.right <= 0 ||
        tileRect.bottom <= 0 ||
        tileRect.left >= window.innerWidth ||
        tileRect.top >= window.innerHeight
      )
        continue;

      const x = tileRect.left + tileRect.width / 2;
      const y = tileRect.top + tileRect.height / 2;
      if (
        controls.some(
          (rect) =>
            x >= rect.left &&
            x <= rect.right &&
            y >= rect.top &&
            y <= rect.bottom,
        )
      ) {
        continue;
      }

      const ownRowIndex = rows.indexOf(tile.parentElement);
      const overlapsLaterRow = rows.slice(ownRowIndex + 1).some((row) => {
        const rect = row.getBoundingClientRect();
        return (
          x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
        );
      });
      if (!overlapsLaterRow) continue;

      const photoId = tile.dataset['photoId'];
      if (photoId) return { photoId, x, y };
    }
    return null;
  });
}
