// Đăng nhập, phân khu và đăng xuất trên BE thật (playwright.api.config.ts). Tài khoản admin lấy từ PW_ADMIN_USER /
// PW_ADMIN_PASS; nhân viên thử PW_STAFF_USER (mặc định pw-staff) được tạo qua API Admin nếu chưa có.
import { expect, test, type APIRequestContext } from '@playwright/test';

const ADMIN_USER = process.env.PW_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.PW_ADMIN_PASS || '';
const STAFF_USER = process.env.PW_STAFF_USER || 'pw-staff';
const STAFF_PASS = process.env.PW_STAFF_PASS || 'PwStaff@12345';

const json = { 'Content-Type': 'application/json' };

// Bảo đảm có tài khoản nhân viên thử, dùng phiên admin của chính `request`.
async function ensureStaff(request: APIRequestContext) {
  const login = await request.post('/api/v2/auth/login', { headers: json, data: { username: ADMIN_USER, password: ADMIN_PASS } });
  expect(login.ok(), 'đăng nhập admin cho fixture').toBeTruthy();
  const found = await request.get(`/api/v2/employees/${STAFF_USER}`);
  if (found.status() === 404) {
    const created = await request.post('/api/v2/employees', {
      headers: json,
      data: {
        username: STAFF_USER,
        password: STAFF_PASS,
        profile: { familyName: 'Nhân viên', givenName: 'Thử' },
        account: { username: STAFF_USER, roles: ['staff'] },
        contract: { status: 'nv', position: { type: 'nv', level: 1 } }
      }
    });
    expect(created.ok(), await created.text()).toBeTruthy();
  }
  await request.post('/api/v2/auth/logout', { headers: json, data: {} });
}

async function signIn(page, username: string, password: string) {
  await page.goto('/dang-nhap');
  await page.locator('#lg-user').fill(username);
  await page.locator('#lg-pass').fill(password);
  await page.getByRole('button', { name: /đăng nhập/i }).click();
}

test.beforeAll(async ({ request }) => {
  test.skip(!ADMIN_PASS, 'Đặt PW_ADMIN_PASS để chạy test với BE thật');
  await ensureStaff(request);
});

test('admin signs in and lands in the admin area', async ({ page }) => {
  await signIn(page, ADMIN_USER, ADMIN_PASS);
  await expect(page).toHaveURL(/\/admin\/tong-quan/);
});

test('staff signs in and lands in the staff area', async ({ page }) => {
  await signIn(page, STAFF_USER, STAFF_PASS);
  await expect(page).toHaveURL(/\/(nv\/hom-nay|nv-may-tinh)/);
});

test('a wrong password shows the server message', async ({ page }) => {
  await signIn(page, ADMIN_USER, 'sai-mat-khau');
  await expect(page.getByText('Sai tên đăng nhập hoặc mật khẩu')).toBeVisible();
  await expect(page).toHaveURL(/\/dang-nhap/);
});

test('signing out returns to the login screen and stays there after reload', async ({ page }) => {
  await signIn(page, ADMIN_USER, ADMIN_PASS);
  await expect(page).toHaveURL(/\/admin\/tong-quan/);
  await page.request.post('/api/v2/auth/logout', { headers: json, data: {} });
  await page.goto('/admin/tong-quan');
  await expect(page).toHaveURL(/\/dang-nhap/);
  await page.reload();
  await expect(page).toHaveURL(/\/dang-nhap/);
});
