import { expect, test, type Page } from '@playwright/test';

// Album picker contract: top-level folders hold their nested folders.
// By default one album is picked at a time with no checkboxes; with
// "Select multiple" on, a top-level pick selects everything inside it
// and deselecting a nested folder leaves the parent partially selected.
test.describe('album picker', () => {
  test('picks one album at a time until Select multiple is on', async ({ page }) => {
    await openReadyWall(page);
    await openControls(page);

    const toggle = page.getByTestId('controls-multi-select');
    await expect(toggle).not.toBeChecked();
    await expect(page.locator('.album-tree input[type="checkbox"]')).toHaveCount(0);

    await page.getByTestId('controls-folder-expand-2024').click();
    const wedding = page.getByTestId('controls-folder-2024/wedding-anna');
    const iceland = page.getByTestId('controls-folder-2024/travel-iceland');
    await wedding.click();
    await expect(wedding).toHaveAttribute('data-selected', 'true');
    // A second pick replaces the first instead of adding to it.
    await iceland.click();
    await expect(iceland).toHaveAttribute('data-selected', 'true');
    await expect(wedding).toHaveAttribute('data-selected', 'false');
    await closeControls(page);
    await expect.poll(async () => uniquePhotoDirectories(page)).toEqual(['2024/travel-iceland']);

    await openControls(page);
    await page.getByTestId('controls-multi-select').check();
    await expect(page.locator('.album-tree input[type="checkbox"]').first()).toBeVisible();
    await page.getByTestId('controls-folder-2024/wedding-anna').click();
    await expect(page.getByTestId('controls-folder-2024/wedding-anna')).toHaveAttribute(
      'data-selected',
      'true',
    );
    await expect(page.getByTestId('controls-folder-2024/travel-iceland')).toHaveAttribute(
      'data-selected',
      'true',
    );
  });

  test('shows only the album tree, without year chips or the root editor', async ({ page }) => {
    await openReadyWall(page);
    await openControls(page);

    await expect(page.getByTestId('controls-folder-2024')).toBeVisible();
    await expect(page.getByTestId('controls-folder-2024/wedding-anna')).toHaveCount(0);
    await expect(page.locator('[data-testid^="controls-year-"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /use local picker/i })).toHaveCount(0);

    await page.getByTestId('controls-folder-expand-2024').click();
    await expect(page.getByTestId('controls-folder-2024/wedding-anna')).toBeVisible();
    await expect(page.getByTestId('controls-folder-2024/travel-iceland')).toBeVisible();
  });

  test('a top-level pick selects its nested folders and a nested deselect marks it partial', async ({
    page,
  }) => {
    await openReadyWall(page);
    await openControls(page);
    await page.getByTestId('controls-multi-select').check();
    await page.getByTestId('controls-folder-2024').click();
    await page.getByTestId('controls-folder-expand-2024').click();

    const year = page.getByTestId('controls-folder-2024');
    const wedding = page.getByTestId('controls-folder-2024/wedding-anna');
    const iceland = page.getByTestId('controls-folder-2024/travel-iceland');
    await expect(year).toHaveAttribute('data-selected', 'true');
    await expect(wedding).toHaveAttribute('data-selected', 'true');
    await expect(iceland).toHaveAttribute('data-selected', 'true');

    await wedding.click();
    await expect(wedding).toHaveAttribute('data-selected', 'false');
    await expect(year).toHaveAttribute('data-selected', 'partial');
    expect(await year.evaluate((el) => (el as HTMLInputElement).indeterminate)).toBe(true);
    await closeControls(page);

    // Only the remaining nested folder's photo stays on the wall.
    await expect.poll(async () => uniquePhotoDirectories(page)).toEqual(['2024/travel-iceland']);

    // The partial selection survives a reload and reopens expanded.
    await page.reload();
    await openReadyWall(page);
    await openControls(page);
    await page.getByTestId('controls-multi-select').check();
    await expect(page.getByTestId('controls-folder-2024')).toHaveAttribute('data-selected', 'partial');
    await expect(page.getByTestId('controls-folder-2024/wedding-anna')).toHaveAttribute(
      'data-selected',
      'false',
    );

    // Picking the partial parent again selects everything inside it.
    await page.getByTestId('controls-folder-2024').click();
    await expect(page.getByTestId('controls-folder-2024/wedding-anna')).toHaveAttribute(
      'data-selected',
      'true',
    );
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
  await page.getByTestId('controls-trigger').click();
  await expect(page.getByTestId('controls-panel')).toBeVisible();
}

async function closeControls(page: Page): Promise<void> {
  await page.getByTestId('controls-trigger').click();
  await expect(page.getByTestId('controls-panel')).toHaveCount(0);
}

async function uniquePhotoDirectories(page: Page): Promise<string[]> {
  const ids = await page.getByTestId('wall-photo-tile').evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLElement).dataset['photoId'] ?? ''),
  );
  const response = await page.request.get('/api/photos?limit=200');
  const body = (await response.json()) as {
    photos: Array<{ id: string; directoryPath: string }>;
  };
  const byId = new Map(body.photos.map((p) => [p.id, p.directoryPath]));
  return [...new Set(ids.map((id) => byId.get(id)).filter((d): d is string => !!d))].sort();
}
