import { expect, test, type Page, type TestInfo } from '@playwright/test';

test.describe('wall layout modes', () => {
  test('default wall stays in single-stream mode and exposes album-area diagnostics', async ({
    page,
  }, testInfo: TestInfo) => {
    await openReadyWall(page);

    const shell = page.getByTestId('wall-shell');
    const wall = page.getByTestId('wall-canvas');

    await expect(shell).toHaveAttribute('data-active-album-area-count', '1');
    await expect(wall).toHaveAttribute('data-layout-mode', 'single');

    const screenshotPath = testInfo.outputPath('wall-layout-single-stream.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await testInfo.attach('wall-layout-single-stream', {
      path: screenshotPath,
      contentType: 'image/png',
    });
  });

  test('grouped year view switches to grouped mode and exposes album-area diagnostics', async ({
    page,
  }, testInfo: TestInfo) => {
    await openReadyWall(page);
    await openControls(page);
    await page.getByTestId('controls-year-2024').click();
    await closeControls(page);

    const shell = page.getByTestId('wall-shell');
    const wall = page.getByTestId('wall-canvas');

    await expect(wall).toHaveAttribute('data-layout-mode', 'grouped');
    await expect(shell).toHaveAttribute('data-active-album-area-count', /^[2-9]\d*$/);

    const screenshotPath = testInfo.outputPath('wall-layout-grouped.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await testInfo.attach('wall-layout-grouped', {
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
