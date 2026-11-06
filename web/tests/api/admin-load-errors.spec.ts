// Màn Admin tải lỗi (500 ở lần gọi đầu) thì hiện "Không tải được …" kèm nút Thử lại, bấm Thử lại thì có dữ liệu; không còn trang trắng.
// Chạy trên BE thật (playwright.api.config.ts).
import { expect, test } from '@playwright/test';

const ADMIN_USER = process.env.PW_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.PW_ADMIN_PASS || '';

const SCREENS: Array<{ name: string; path: string; api: string; what: RegExp; heading: RegExp }> = [
  { name: 'Chấm công', path: '/admin/cham-cong', api: '**/api/v2/attendance/week**', what: /Không tải được bảng chấm công/, heading: /^Chấm công$/ },
  { name: 'Bảng lương', path: '/admin/bang-luong', api: '**/api/v2/payroll/20*', what: /Không tải được bảng lương/, heading: /^Bảng lương$/ },
  { name: 'Nhân sự', path: '/admin/nhan-su', api: '**/api/v2/employees', what: /Không tải được danh sách nhân sự/, heading: /^Nhân sự$/ },
  { name: 'Tài khoản', path: '/admin/cai-dat/phan-quyen/tai-khoan', api: '**/api/v2/employees**', what: /Không tải được danh sách tài khoản/, heading: /./ }
];

test.beforeEach(async ({ page }) => {
  test.skip(!ADMIN_PASS, 'Đặt PW_ADMIN_PASS để chạy test với BE thật');
  await page.goto('/dang-nhap');
  await page.locator('#lg-user').fill(ADMIN_USER);
  await page.locator('#lg-pass').fill(ADMIN_PASS);
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/dang-nhap'));
});

for (const s of SCREENS) {
  test(`${s.name}: a failed first load shows the error with Thử lại, and retrying loads it`, async ({ page }) => {
    let failed = false;
    await page.route(s.api, route => {
      if (route.request().method() === 'GET' && !failed) {
        failed = true;
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Máy chủ đang lỗi (thử)' }) });
      }
      return route.continue();
    });
    await page.goto(s.path);
    const err = page.getByRole('alert').filter({ hasText: s.what });
    await expect(err).toBeVisible();
    await expect(err).toContainText('Máy chủ đang lỗi (thử)');
    await err.getByRole('button', { name: 'Thử lại' }).click();
    await expect(err).toHaveCount(0);
    await expect(page.getByRole('heading', { name: s.heading, level: 1 }).first()).toBeVisible();
  });
}
