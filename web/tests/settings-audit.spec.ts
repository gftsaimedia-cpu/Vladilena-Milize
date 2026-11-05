import { expect, test, type Page } from '@playwright/test';

// Màn Cài đặt › Nhật ký thay đổi trên dữ liệu giả (mock/audit.ts): 45 dòng, 25 dòng một trang, không page.route.
// Lọc, tổng và kiểm tra chuỗi băm đều đi qua hàm giả chạy theo cùng luật với máy chủ.
const rowsOf = (page: Page) => page.locator('table.tbl tbody tr:not(.day)');
const options = (page: Page, label: string) => page.getByLabel(label, { exact: true }).locator('option');
const filterBtn = (page: Page) => page.getByRole('button', { name: 'Lọc', exact: true });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('shows the real total and 25 rows a page', async ({ page }) => {
  await page.goto('/admin/cai-dat/nhat-ky');
  await expect(page.getByText('45 dòng', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('25 dòng đầu trên 45')).toBeVisible();
  await expect(page.getByText('Trang 1/2')).toBeVisible();
  await page.getByRole('button', { name: 'Trang sau' }).click();
  await expect(page.getByText('Dòng 26–45 trên 45')).toBeVisible();
  await expect(page.getByText('Trang 2/2')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
});

test('the Mục list has every action in Vietnamese on page 1', async ({ page }) => {
  await page.goto('/admin/cai-dat/nhat-ky');
  const opts = options(page, 'Mục');
  await expect(opts.first()).toHaveText('Tất cả');
  const texts = await opts.allTextContents();
  for (const want of [
    'Sửa tham số lương',
    'Thêm ngày lễ',
    'Duyệt / từ chối đơn',
    'Chốt công',
    'Tính lương',
    'Chấm điểm KPI',
    'Sửa nhân sự'
  ]) {
    expect(texts).toContain(want);
  }
  for (const t of texts) expect(t).not.toMatch(/\w\.\w/);
});

test('the Người list has everyone including the system', async ({ page }) => {
  await page.goto('/admin/cai-dat/nhat-ky');
  const opts = options(page, 'Người');
  await expect(opts.first()).toHaveText('Tất cả');
  // Thứ tự theo tên (người không tên cuối cùng) là việc của máy chủ; ở đây chỉ cần đủ người.
  await expect(opts).toHaveCount(5);
  const texts = await opts.allTextContents();
  for (const want of ['Quản trị viên', 'Phạm Ngọc Anh', 'Nguyễn Thu Hà', 'Hệ thống']) expect(texts).toContain(want);
  expect(texts[texts.length - 1]).toBe('Hệ thống');
});

test('filtering by person asks the server and updates the total', async ({ page }) => {
  await page.goto('/admin/cai-dat/nhat-ky');
  await page.getByLabel('Người', { exact: true }).selectOption({ label: 'Phạm Ngọc Anh' });
  await filterBtn(page).click();
  await expect(page.getByText('11 dòng').first()).toBeVisible();
  await expect(page.getByText('Trang 1/1')).toBeVisible();
  await expect(rowsOf(page)).toHaveCount(11);
  for (const row of await rowsOf(page).all()) await expect(row).toContainText('Phạm Ngọc Anh');
});

test('filtering by one day keeps only that day', async ({ page }) => {
  await page.goto('/admin/cai-dat/nhat-ky');
  await page.getByLabel('Từ ngày', { exact: true }).fill('27/10/2026');
  await page.getByLabel('Đến ngày', { exact: true }).fill('27/10/2026');
  await filterBtn(page).click();
  await expect(page.getByText('17 dòng').first()).toBeVisible();
  await expect(rowsOf(page)).toHaveCount(1);
  await expect(rowsOf(page).first()).toContainText('× 17');
});

test('a reversed date range cannot be applied', async ({ page }) => {
  await page.goto('/admin/cai-dat/nhat-ky');
  await page.getByLabel('Từ ngày', { exact: true }).fill('28/10/2026');
  await page.getByLabel('Đến ngày', { exact: true }).fill('27/10/2026');
  await expect(filterBtn(page)).toBeDisabled();
  await page.getByLabel('Đến ngày', { exact: true }).fill('28/10/2026');
  await expect(filterBtn(page)).toBeEnabled();
});

test('one quick-add opens into its 17 rows', async ({ page }) => {
  await page.goto('/admin/cai-dat/nhat-ky');
  const group = rowsOf(page).filter({ hasText: 'Thêm ngày lễ' });
  await expect(group).toHaveCount(1);
  await expect(group).toContainText('× 17');
  const closed = await rowsOf(page).count();
  await page.getByRole('button', { name: 'Mở ra' }).click();
  await expect(rowsOf(page)).toHaveCount(closed + 16);
  await expect(page.getByRole('button', { name: 'Gộp lại' })).toBeVisible();
  await page.getByRole('button', { name: 'Gộp lại' }).click();
  await expect(rowsOf(page)).toHaveCount(closed);
});

test('the chain check reports a clean log', async ({ page }) => {
  await page.goto('/admin/cai-dat/nhat-ky');
  await page.getByRole('button', { name: 'Kiểm tra nhật ký không bị sửa' }).click();
  await expect(page.getByRole('button', { name: 'Nhật ký nguyên vẹn · đã kiểm tra 45 dòng' })).toBeVisible();
});

test('the chain check reports a forged row', async ({ page }) => {
  await page.addInitScript(() => {
    (globalThis as any).__mockAuditBadId = 42;
  });
  await page.goto('/admin/cai-dat/nhat-ky');
  await page.getByRole('button', { name: 'Kiểm tra nhật ký không bị sửa' }).click();
  await expect(page.getByRole('alert')).toContainText('Dòng 42 đã bị sửa nội dung');
});

test('the chain check forgets a clean result after a failed one', async ({ page }) => {
  await page.goto('/admin/cai-dat/nhat-ky');
  await page.getByRole('button', { name: 'Kiểm tra nhật ký không bị sửa' }).click();
  await expect(page.getByRole('button', { name: 'Nhật ký nguyên vẹn · đã kiểm tra 45 dòng' })).toBeVisible();
  await page.evaluate(() => {
    (globalThis as any).__mockAuditBadId = 42;
  });
  await page.getByRole('button', { name: 'Nhật ký nguyên vẹn · đã kiểm tra 45 dòng' }).click();
  await expect(page.getByRole('alert')).toContainText('Dòng 42 đã bị sửa nội dung');
  await expect(page.getByRole('button', { name: 'Kiểm tra nhật ký không bị sửa' })).toBeVisible();
  await expect(page.getByText('Nhật ký nguyên vẹn')).toHaveCount(0);
});
