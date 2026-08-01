import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import { sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const port = 5176;
const smokeLibraryRoot = fileURLToPath(new URL('./fixtures/library-smoke/', import.meta.url));
const dataRoot = mkdtempSync(`${os.tmpdir()}${sep}photo-wall-playwright-`);

export default defineConfig({
  testDir: './playwright',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: false,
  retries: process.env['CI'] ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  outputDir: 'test-results/playwright',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  webServer: {
    command: 'npm run playwright:serve',
    url: `http://127.0.0.1:${port}/healthz`,
    timeout: 120_000,
    reuseExistingServer: process.env['PLAYWRIGHT_REUSE_EXISTING_SERVER'] === 'true',
    env: {
      NODE_ENV: 'test',
      PHOTO_WALL_BIND_HOST: '0.0.0.0',
      PHOTO_WALL_PORT: String(port),
      PHOTO_WALL_LIBRARY_ROOT: smokeLibraryRoot,
      PHOTO_WALL_DATA_ROOT: dataRoot,
      PHOTO_WALL_LOG_LEVEL: 'warn',
      PHOTO_WALL_SCAN_TOP_LEVEL_YEARS_ONLY: 'false',
    },
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 960 },
      },
    },
    {
      name: 'chromium-mobile',
      testMatch: [
        '**/media-diagnostics.spec.ts',
        '**/mobile-pinch-zoom.spec.ts',
        '**/mobile-wall-gestures.spec.ts',
        '**/single-stream-wrap-continuity.spec.ts',
        '**/zoom-detail-tiers.spec.ts',
      ],
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
  ],
});
