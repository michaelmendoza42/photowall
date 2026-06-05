import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const repoRoot = path.dirname(fileURLToPath(new URL(import.meta.url)));
const port = 3110;
const smokeLibraryRoot = path.join(repoRoot, 'fixtures', 'library-smoke');
const dataRoot = mkdtempSync(path.join(os.tmpdir(), 'photo-wall-playwright-'));

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
    reuseExistingServer: false,
    env: {
      NODE_ENV: 'test',
      PHOTO_WALL_BIND_HOST: '127.0.0.1',
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
  ],
});
