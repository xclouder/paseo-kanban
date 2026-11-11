import { defineConfig } from '@playwright/test';
const port = Number(process.env.PLAYWRIGHT_PORT || 5173);
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: true, retries: 0,
  use: { baseURL, viewport: { width: 1720, height: 1040 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: `npm run dev -- --port ${port}`, url: baseURL, reuseExistingServer: true },
});
