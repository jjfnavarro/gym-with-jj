import { defineConfig, devices } from '@playwright/test';
const testUrl = process.env.TEST_DATABASE_URL;
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4173';
if (!testUrl || !new URL(testUrl).pathname.endsWith('_test'))
  throw new Error('TEST_DATABASE_URL must name a disposable database ending in _test.');
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 12000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'mobile-webkit',
      testMatch: /(?:timer-alerts|cardio|push)\.spec\.ts/,
      use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: 'node apps/api/dist/server.js',
    url: 'http://localhost:4173/api/health',
    reuseExistingServer: false,
    env: {
      DATABASE_URL: testUrl,
      APP_ORIGIN: new URL(baseURL).origin,
      PORT: '4173',
      NODE_ENV: 'development',
    },
    timeout: 30000,
  },
});
