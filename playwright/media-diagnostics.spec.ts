import { expect, test, type Page, type TestInfo } from '@playwright/test';

test.describe('media diagnostics', () => {
  test('reports server and browser pipeline progress without media identifiers', async ({
    page,
  }, testInfo: TestInfo) => {
    await openReadyWall(page);

    await expect.poll(async () => page.evaluate(() => {
      const diagnostics = (globalThis as typeof globalThis & {
        photoWallMediaDiagnostics?: { snapshot: () => { counters: { byEvent: { sprite_applied: number } } } };
      }).photoWallMediaDiagnostics;
      return diagnostics?.snapshot().counters.byEvent.sprite_applied ?? 0;
    })).toBeGreaterThan(0);

    const browserSnapshot = await page.evaluate(() => {
      const diagnostics = (globalThis as typeof globalThis & {
        photoWallMediaDiagnostics?: { snapshot: () => unknown };
      }).photoWallMediaDiagnostics;
      if (!diagnostics) throw new Error('browser media diagnostics are unavailable');
      return diagnostics.snapshot();
    });
    const serverSnapshot = await page.request
      .get('/api/diagnostics/media')
      .then(async (response) => {
        expect(response.ok()).toBe(true);
        expect(response.headers()['cache-control']).toBe('no-store');
        return response.json();
      });

    expect(serverSnapshot.requestCounters.total).toBeGreaterThan(0);
    expect(
      serverSnapshot.requestCounters.byReason.success_rendered
        + serverSnapshot.requestCounters.byReason.success_cache_hit,
    ).toBeGreaterThan(0);
    expect(JSON.stringify({ browserSnapshot, serverSnapshot })).not.toMatch(
      /photoId|libraryRoot|filePath|mediaUrl|sourceUrl/i,
    );

    await testInfo.attach('media-diagnostics.json', {
      body: JSON.stringify({ browserSnapshot, serverSnapshot }, null, 2),
      contentType: 'application/json',
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
