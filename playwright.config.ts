import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'packages/ui/tests/e2e',
  reporter: 'line',
  timeout: 30_000,
  webServer: {
    command: 'npm --workspace @js-runtime-visualizer/ui run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
});
