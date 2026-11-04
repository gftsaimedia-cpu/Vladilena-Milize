import { expect, test, type Page } from '@playwright/test';

const HINT = 'Bản mockup: mật khẩu bất kỳ. Tên admin vào khu quản trị, tên khác vào khu nhân viên.';

// Ghi lại mọi request tới /api; mockup không được gọi máy chủ nào.
function trackApi(page: Page) {
  const calls: string[] = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api')) calls.push(`${req.method()} ${url.pathname}`);
  });
  return calls;
}

async function startLoggedOut(page: Page) {
  await page.addInitScript(() => localStorage.setItem('aicb.mock.session', 'none'));
  await page.goto('/dang-nhap');
}

test('opens straight into admin with the default mock session', async ({ page }) => {
  const calls = trackApi(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/admin\/tong-quan/);
  expect(calls).toEqual([]);
});

test('admin login lands on the overview', async ({ page }) => {
  const calls = trackApi(page);
  await startLoggedOut(page);
  await expect(page.getByText(HINT)).toBeVisible();
  await page.getByLabel('Tên đăng nhập').fill('admin');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('x');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL(/\/admin\/tong-quan/);
  expect(calls).toEqual([]);
});

test('any other name lands in the staff area', async ({ page }) => {
  const calls = trackApi(page);
  await startLoggedOut(page);
  await page.getByLabel('Tên đăng nhập').fill('NhanVien ');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('x');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL(/\/nv-may-tinh/);
  expect(calls).toEqual([]);
});

test('empty password shows the validation message', async ({ page }) => {
  const calls = trackApi(page);
  await startLoggedOut(page);
  await page.getByLabel('Tên đăng nhập').fill('admin');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByText('Nhập tên đăng nhập và mật khẩu.')).toBeVisible();
  await expect(page).toHaveURL(/\/dang-nhap/);
  expect(calls).toEqual([]);
});

test('logout survives a reload', async ({ page }) => {
  const calls = trackApi(page);
  await page.goto('/admin/tong-quan');
  await page.locator('#admin-navigation button.me').click();
  await page.getByRole('menuitem', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/dang-nhap/);
  await page.reload();
  await expect(page).toHaveURL(/\/dang-nhap/);
  expect(calls).toEqual([]);
});

test('blocked storage still opens admin', async ({ page }) => {
  const calls = trackApi(page);
  // Chỉ chặn khoá của app (aicb.*): công cụ devtools của Vue ở chế độ dev tự đọc storage không bọc try/catch.
  await page.addInitScript(() => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    const guard = (key: string) => {
      if (key.startsWith('aicb.')) throw new Error('storage blocked');
    };
    Storage.prototype.getItem = function (key: string) {
      guard(key);
      return getItem.call(this, key);
    };
    Storage.prototype.setItem = function (key: string, value: string) {
      guard(key);
      return setItem.call(this, key, value);
    };
  });
  await page.goto('/');
  await expect(page).toHaveURL(/\/admin\/tong-quan/);
  await expect(page.getByRole('navigation', { name: 'Điều hướng' })).toBeVisible();
  expect(calls).toEqual([]);
});
