import { expect, test, type Page } from '@playwright/test';

// Tổng quan chạy trên dữ liệu giả (mock/overview.ts): không page.route, không gọi /api.
const nav = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng' });
const requestsLink = (page: Page) => nav(page).getByRole('link', { name: /^Yêu cầu/ });
const requestsKpi = (page: Page) =>
  page.getByRole('region', { name: 'Chỉ số chính' }).getByRole('article', { name: 'Yêu cầu chờ duyệt' });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('overview shows the mock figures', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  await expect(page.getByRole('heading', { name: 'Tổng quan', exact: true })).toBeVisible();
  await expect(
    page.getByText('Còn 4 việc phải xong trước khi chốt lương tháng 10 · hạn 31/10, còn 3 ngày')
  ).toBeVisible();

  const kpis = page.getByRole('region', { name: 'Chỉ số chính' });
  for (const text of ['2,48 tỷ', '128', '113', '9']) await expect(kpis).toContainText(text);

  await expect(page.getByRole('figure', { name: /hôm nay 28\/10 88%/ })).toBeVisible();

  const period = page.getByRole('region', { name: 'Kỳ lương tháng 10' });
  await expect(period).toContainText('Chờ duyệt');
  await expect(period).toContainText('86');

  const approvals = page.getByRole('list', { name: 'Việc cần duyệt' });
  await expect(approvals.getByRole('listitem')).toHaveCount(3);
  await expect(approvals.getByRole('listitem').first()).toContainText('Nguyễn Thu Hà');
});

test('approving updates the list, KPI, sidebar badge and toast', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  const approvals = page.getByRole('list', { name: 'Việc cần duyệt' });
  await expect(approvals).toContainText('Nguyễn Thu Hà');

  await page.getByRole('button', { name: 'Duyệt yêu cầu của Nguyễn Thu Hà' }).click();
  await expect(approvals).not.toContainText('Nguyễn Thu Hà');
  await expect(requestsKpi(page).locator('.kpi-v')).toHaveText('8');
  await expect(requestsLink(page)).toContainText('8');
  await expect(page.getByText('Đã duyệt yêu cầu của Nguyễn Thu Hà.')).toBeVisible();

  await page.getByRole('button', { name: 'Từ chối yêu cầu của Trần Minh Quân' }).click();
  await expect(page.getByText('Đã từ chối yêu cầu của Trần Minh Quân.')).toBeVisible();
  await expect(requestsKpi(page).locator('.kpi-v')).toHaveText('7');
});

test('approving every request shows the empty state', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  const approve = page.getByRole('button', { name: /^Duyệt yêu cầu của / });
  await expect(approve.first()).toBeVisible();
  while (await approve.count()) {
    const label = (await approve.first().getAttribute('aria-label')) as string;
    await approve.first().click();
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  }
  await expect(page.getByText('Không còn yêu cầu nào chờ duyệt.')).toBeVisible();
  await expect(requestsKpi(page).locator('.kpi-v')).toHaveText('0');
  await expect(requestsLink(page)).toHaveText('Yêu cầu');
});

test('payroll table filters by status and searches without accents', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  const table = page.getByRole('region', { name: 'Bảng lương tháng 10' });
  const rows = table.locator('tbody tr');
  const filters = page.getByRole('group', { name: 'Lọc theo trạng thái' });
  const search = page.getByLabel('Tìm theo tên hoặc phòng ban');

  await filters.getByRole('button', { name: /^Chờ duyệt/ }).click();
  await expect(filters.getByRole('button', { name: /^Chờ duyệt/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Lê Hoàng Nam');
  await expect(rows.nth(1)).toContainText('Phạm Ngọc Anh');

  await filters.getByRole('button', { name: /^Tất cả/ }).click();
  await expect(rows).toHaveCount(6);

  await search.fill('quan');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Trần Minh Quân');

  await search.fill('QUÂN');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Trần Minh Quân');

  await search.fill('xyz');
  await expect(rows).toHaveCount(0);
  await expect(page.getByText('Không có phiếu nào khớp.')).toBeVisible();
});

test('month change relabels the overview', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  await page.getByRole('button', { name: 'Tháng trước' }).click();
  await expect(page.getByRole('heading', { name: 'Kỳ lương tháng 9' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bảng lương tháng 9' })).toBeVisible();
});

test('overview fits 375px and the table scrolls in its own region', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/admin/tong-quan');
  const table = page.getByRole('region', { name: 'Bảng lương tháng 10' });
  await expect(table).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await expect(table).toHaveAttribute('tabindex', '0');
  expect(await table.evaluate(el => el.scrollWidth > el.clientWidth)).toBeTruthy();
});

test('overview links keep the chosen month', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  await page.getByRole('button', { name: 'Tháng trước' }).click();
  await expect(page).toHaveURL(/thang=2026-09/);
  const links: [string, RegExp][] = [
    ['Mở bảng lương', /\/admin\/bang-luong\?thang=2026-09/],
    ['Xem tất cả', /\/admin\/yeu-cau\?thang=2026-09/],
    ['Mở bảng lương đầy đủ', /\/admin\/bang-luong\?thang=2026-09/]
  ];
  for (const [name, url] of links) {
    await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('href', url);
  }
  await page.getByRole('link', { name: 'Mở bảng lương', exact: true }).click();
  await expect(page).toHaveURL(/thang=2026-09/);
});
