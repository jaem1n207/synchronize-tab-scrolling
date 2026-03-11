import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/landing',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'pnpm dev:landing',
    url: 'http://localhost:4173/landing/',
    reuseExistingServer: !process.env.CI,
  },
});
