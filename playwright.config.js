import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { browserName: 'chromium', baseURL: 'http://127.0.0.1:5173', channel: process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
  },
});
