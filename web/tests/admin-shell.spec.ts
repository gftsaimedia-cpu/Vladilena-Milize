import { expect, test, type Page } from '@playwright/test';

// Ghi lại mọi request tới /api; khung Admin chạy trên dữ liệu giả, không được gọi máy chủ nào.
function trackApi(page: Page) {
  const calls: string[] = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api')) calls.push(`${req.method()} ${url.pathname}`);
  });
  return calls;
}

test('admin shell makes no /api requests while navigating', async ({ page }) => {
  const calls = trackApi(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/admin/tong-quan');
  const nav = page.getByRole('navigation', { name: 'Điều hướng' });
  for (const name of ['Tổng quan', 'Yêu cầu', 'Chấm công', 'Đánh giá KPI', 'Bảng lương', 'Nhân sự']) {
    // Mục Yêu cầu kèm số đếm (vd. "Yêu cầu 9") nên so tên theo phần đầu
    await nav.getByRole('link', { name: new RegExp(`^${name}`) }).click();
    await expect(page.getByRole('navigation', { name: 'Điều hướng' })).toBeVisible();
  }
  await page.getByRole('link', { name: 'Cài đặt', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/cai-dat/);
  expect(calls).toEqual([]);
});

test('unmocked screen keeps the shell', async ({ page }) => {
  await page.goto('/admin/yeu-cau');
  await expect(page.getByRole('navigation', { name: 'Điều hướng' })).toBeVisible();
  await expect(page.getByLabel('Tìm nhân viên')).toBeVisible();
});

test('topbar month picker changes ?thang and label', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  const mpick = page.locator('.topbar .mpick');
  await expect(mpick).toContainText('Tháng 10/2026');
  await expect(page.getByRole('button', { name: 'Tháng sau' })).toBeDisabled();
  await page.getByRole('button', { name: 'Tháng trước' }).click();
  await expect(page).toHaveURL(/thang=2026-09/);
  await expect(mpick).toContainText('Tháng 9/2026');
});

test('bell shows the mock count and opens the task list', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  const bell = page.locator('.topbar .bell');
  await expect(bell).toContainText('13');
  await bell.click();
  await expect(page.getByRole('dialog', { name: 'Việc cần xử lý' })).toBeVisible();
});

test('steps strip shows only on attendance, KPI and payroll', async ({ page }) => {
  await page.goto('/admin/kpi');
  await expect(page.locator('.period .state')).toContainText('Chờ phê duyệt');
  const steps = page.locator('.period .steps');
  await expect(steps).toHaveAttribute('role', 'region');
  await expect(steps).toHaveAttribute('tabindex', '0');
  await steps.focus();
  await expect(steps).toBeFocused();
  await page.goto('/admin/tong-quan');
  await expect(page.getByLabel('Tìm nhân viên')).toBeVisible();
  await expect(page.locator('.period')).toHaveCount(0);
});

test('search opens the staff list with q', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  const search = page.getByLabel('Tìm nhân viên');
  await search.fill('Quân');
  await search.press('Enter');
  await expect(page).toHaveURL(/\/admin\/nhan-su\?q=Qu%C3%A2n/);
});

test('mobile admin drawer is keyboard accessible, closes on navigation and preserves queries', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/admin/tong-quan?thang=2026-10&q=needle&nv=staff&kb=empty');

  const toggle = page.locator('.mobile-nav-toggle');
  const sidebar = page.locator('#admin-navigation');
  const nav = page.getByRole('navigation', { name: 'Điều hướng' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveAccessibleName('Mở điều hướng');
  await expect(sidebar).not.toHaveClass(/mobile-open/);
  await expect(sidebar).toHaveAttribute('inert');
  await expect(sidebar.locator('a').first()).toBeHidden();

  await page.keyboard.press('Tab');
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle).toHaveAccessibleName('Đóng điều hướng');
  await expect(nav.locator('a').first()).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(sidebar.locator('button.me')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(sidebar).toHaveAttribute('inert');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Tìm nhân viên')).toBeFocused();

  await toggle.click();
  await page.getByRole('link', { name: 'Cài đặt', exact: true }).click();
  await expect(page).toHaveURL('/admin/cai-dat?thang=2026-10');
  await expect(sidebar.locator('a[aria-current="page"]')).toContainText('Cài đặt');
  await page.goBack();
  await expect(page).toHaveURL('/admin/tong-quan?thang=2026-10&q=needle&nv=staff&kb=empty');
  await toggle.click();
  await page.getByRole('link', { name: 'Đánh giá KPI' }).click();
  await expect(page).toHaveURL('/admin/kpi?thang=2026-10');
  await expect(sidebar.locator('a[aria-current="page"]')).toContainText('Đánh giá KPI');
  await expect(sidebar).not.toHaveClass(/mobile-open/);

  await toggle.click();
  await page.getByRole('button', { name: /Quản trị viên/ }).click();
  await expect(sidebar).not.toHaveClass(/mobile-open/);
});

test('navigation drops stale view queries without reopening a shell dialog', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto('/admin/tong-quan?thang=2026-10&q=needle&nv=staff');
  await page.locator('.topbar .bell').click();
  await expect(page.getByRole('dialog', { name: 'Việc cần xử lý' })).toBeVisible();
  await page.getByRole('link', { name: 'Đánh giá KPI' }).click();
  await expect(page).toHaveURL('/admin/kpi?thang=2026-10');
  await expect(page.getByRole('dialog', { name: 'Việc cần xử lý' })).toHaveCount(0);
});

test('mobile drawer closes when resized to desktop', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/admin/tong-quan');
  await page.locator('.mobile-nav-toggle').click();
  await expect(page.locator('#admin-navigation')).toHaveClass(/mobile-open/);
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(page.locator('#admin-navigation')).not.toHaveClass(/mobile-open/);
  await expect(page.locator('#admin-navigation')).not.toHaveAttribute('inert');
  await expect(page.locator('.mobile-nav-toggle')).toBeHidden();
});

for (const width of [375, 768, 1024]) {
  test(`topbar keeps controls inside the viewport at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/admin/tong-quan?thang=2026-10');
    const parts = [page.locator('.topbar .mpick'), page.locator('.topbar .bell'), page.getByLabel('Tìm nhân viên')];
    for (const part of parts) {
      await expect(part).toBeVisible();
      const box = await part.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
  });
}

test('sidebar defaults to the dark floating card', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/tong-quan');
  await expect(page.locator('html')).toHaveAttribute('data-side', 'dark');
  const side = page.locator('#admin-navigation');
  await expect(side).toHaveCSS('border-radius', '24px');
  await expect(side).toHaveCSS('background-color', 'rgb(28, 28, 28)');
  const box = await side.boundingBox();
  expect(Math.abs(box!.width - 248)).toBeLessThanOrEqual(1);
  const current = side.locator('a[aria-current="page"]');
  await expect(current).toHaveCSS('color', 'rgb(232, 195, 114)');
  await expect(current).toHaveCSS('background-color', 'rgb(42, 42, 42)');
});

test('light sidebar is chosen in the account menu and persists', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/tong-quan');
  await page.getByRole('button', { name: /Quản trị viên/ }).click();
  const row = page.locator('.pop .mr', { hasText: 'Thanh bên' });
  await row.getByRole('button', { name: 'Sáng' }).click();
  const check = async () => {
    const side = page.locator('#admin-navigation');
    await expect(page.locator('html')).toHaveAttribute('data-side', 'light');
    await expect(side).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    const current = side.locator('a[aria-current="page"]');
    await expect(current).toHaveCSS('background-color', 'rgb(252, 232, 178)');
    await expect(current).toHaveCSS('color', 'rgb(33, 33, 33)');
  };
  await check();
  await page.reload();
  await check();
});

test('kem ground keeps the active sidebar link colours in both sidebar styles', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/tong-quan');
  await page.getByRole('button', { name: /Quản trị viên/ }).click();
  await page
    .locator('.pop .mr', { hasText: 'Màu nền' })
    .getByRole('button', { name: 'Kem' })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-ground', 'kem');
  const current = page.locator('#admin-navigation a[aria-current="page"]');
  await expect(current).toHaveCSS('background-color', 'rgb(42, 42, 42)');
  await expect(current).toHaveCSS('color', 'rgb(232, 195, 114)');
  await page.locator('.pop .mr', { hasText: 'Thanh bên' }).getByRole('button', { name: 'Sáng' }).click();
  await expect(current).toHaveCSS('background-color', 'rgb(252, 232, 178)');
  await expect(current).toHaveCSS('color', 'rgb(33, 33, 33)');
});

test('bell popover opens below the bell on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/tong-quan');
  const bell = page.locator('.topbar .bell');
  await bell.click();
  const pop = page.getByRole('dialog', { name: 'Việc cần xử lý' });
  await expect(pop).toBeVisible();
  const bellBox = (await bell.boundingBox())!;
  const popBox = (await pop.boundingBox())!;
  expect(popBox.y).toBeGreaterThanOrEqual(bellBox.y + bellBox.height);
  expect(popBox.x + popBox.width).toBeLessThanOrEqual(1440);
});

test('bell popover stays inside a 375px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/admin/tong-quan');
  const bell = page.locator('.topbar .bell');
  await bell.click();
  const pop = page.getByRole('dialog', { name: 'Việc cần xử lý' });
  await expect(pop).toBeVisible();
  const bellBox = (await bell.boundingBox())!;
  const popBox = (await pop.boundingBox())!;
  expect(popBox.x).toBeGreaterThanOrEqual(0);
  expect(popBox.x + popBox.width).toBeLessThanOrEqual(375);
  expect(popBox.y).toBeGreaterThanOrEqual(bellBox.y + bellBox.height);
});
