import { expect, test } from '@playwright/test';

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
