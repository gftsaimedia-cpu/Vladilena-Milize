// Cài đặt trên BE thật (playwright.api.config.ts): kho cài đặt /api/v2/settings. Tài khoản admin lấy từ PW_ADMIN_USER /
// PW_ADMIN_PASS. Test đổi cài đặt chung của công ty (nhóm số, vùng chấm công) và tạo nhân viên thử, nên chỉ chạy trên DB thử.
import { expect, test, type Page } from '@playwright/test';

const ADMIN_USER = process.env.PW_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.PW_ADMIN_PASS || '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  test.skip(!ADMIN_PASS, 'Đặt PW_ADMIN_PASS để chạy test với BE thật');
});

async function signIn(page: Page, username: string, password: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dang-nhap');
  await page.locator('#lg-user').fill(username);
  await page.locator('#lg-pass').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).not.toHaveURL(/\/dang-nhap/);
}

test('Phân quyền offers only the Vai trò and Tài khoản tabs', async ({ page }) => {
  await signIn(page, ADMIN_USER, ADMIN_PASS);
  await page.goto('/admin/cai-dat/phan-quyen/tai-khoan');
  const tabs = page.locator('.tabs.in');
  await expect(tabs.getByRole('link', { name: /Tài khoản/ })).toBeVisible();
  await expect(tabs.getByRole('link', { name: /Vai trò/ })).toBeVisible();
  await expect(tabs.getByRole('link', { name: 'Xử lý yêu cầu' })).toHaveCount(0);
});

test('no settings page calls the v1 settings routes', async ({ page }) => {
  const v1: string[] = [];
  page.on('request', r => {
    const path = new URL(r.url()).pathname;
    if (/\/api\/v2\/(settings\/params|settings\/first-run|blocks\/)/.test(path)) v1.push(`${r.method()} ${path}`);
  });
  await signIn(page, ADMIN_USER, ADMIN_PASS);
  const pages = [
    '/admin/cai-dat',
    '/admin/cai-dat/lich',
    '/admin/cai-dat/kpi',
    '/admin/cai-dat/tat-ca',
    '/admin/cai-dat/phan-quyen',
    '/admin/cai-dat/phan-quyen/xu-ly-yeu-cau'
  ];
  for (const path of pages) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  expect(v1).toEqual([]);
});
