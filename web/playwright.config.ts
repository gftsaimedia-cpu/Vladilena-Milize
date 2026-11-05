import { defineConfig, devices } from '@playwright/test';

// Bộ test giao diện chạy trên dữ liệu giả (npm run dev:mock), không cần BE. Test với BE thật: playwright.api.config.ts.
// PW_PORT lets several worktrees run the suite at once without fighting over one dev-server port.
const port = Number(process.env.PW_PORT) || 4177;

export default defineConfig({
  testDir: './tests',
  testIgnore: 'api/**',
  fullyParallel: true,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${port}`,
    headless: true
  },
  webServer: {
    command: `npm run dev:mock -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30_000
  }
});
