import { defineConfig } from '@playwright/test';

// Standalone recipient verification does not start or depend on a dev server.
const chromeExecutable = process.env.CHROME_TEST_EXECUTABLE;
export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/share.spec.js',
  workers: 1,
  reporter: 'list',
  outputDir: 'test-results-share',
  use: { browserName: 'chromium' },
  projects: [
    { name: 'Edge', use: { channel: 'msedge' } },
    { name: 'Chrome', use: chromeExecutable ? { launchOptions: { executablePath: chromeExecutable } } : { channel: 'chrome' } },
  ],
});
