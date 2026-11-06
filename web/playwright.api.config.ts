import { defineConfig, devices } from '@playwright/test';

// Test giao diện với BE thật (npm run test:api). Cần BE đang chạy (mặc định http://127.0.0.1:3000, đổi bằng
// VITE_API_TARGET) trên một DB thử có tài khoản admin; tài khoản lấy từ PW_ADMIN_USER / PW_ADMIN_PASS.
// Không bao giờ chạy trên DB lương thật: test tạo một nhân viên thử qua API Admin.
const port = Number(process.env.PW_PORT) || 4178;

export default defineConfig({
  testDir: './tests/api',
  // npm run demo -- test đặt thư mục riêng cho mỗi mảng: Playwright xoá outputDir lúc bắt đầu, các phiên chạy song song không được giẫm nhau.
  outputDir: process.env.PW_OUTPUT_DIR || 'test-results',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${port}`,
    headless: true
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30_000
  }
});
