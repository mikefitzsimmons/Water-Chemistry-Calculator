import { defineConfig } from '@playwright/test';

const baseURL = process.env.CALCULATOR_URL || 'http://127.0.0.1:4173';
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: {
    baseURL,
    launchOptions: { executablePath: process.env.CALCULATOR_CHROMIUM || undefined }
  },
  webServer: process.env.CALCULATOR_URL ? undefined : {
    command: 'node scripts/serve.mjs',
    url: baseURL,
    reuseExistingServer: true
  }
});
