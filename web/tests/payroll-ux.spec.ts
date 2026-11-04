import { expect, test, type Page } from '@playwright/test';

// Bảng lương và phiếu lương chạy trên dữ liệu giả (mock/payroll.ts): không page.route, không gọi /api.
// Trạng thái giả nằm trong bộ nhớ trang: sau lần goto đầu, đi tiếp bằng liên kết trong app.
const URL10 = '/admin/bang-luong?thang=2026-10';
const table = (page: Page) => page.getByRole('region', { name: 'Bảng lương tháng 10, cuộn ngang để xem các khoản' });
const rows = (page: Page) => table(page).locator('tbody tr');
const row = (page: Page, name: string) => rows(page).filter({ hasText: name });
const filters = (page: Page) => page.getByRole('group', { name: 'Lọc theo trạng thái' });
const tiles = (page: Page) => page.getByRole('region', { name: 'Chỉ số kỳ lương' });
const tile = (page: Page, name: string) => tiles(page).getByRole('article', { name, exact: true });

function trackApi(page: Page) {
  const calls: string[] = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api')) calls.push(`${req.method()} ${url.pathname}`);
  });
  return calls;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('October payroll shows the board figures', async ({ page }) => {
  const calls = trackApi(page);
  await page.goto(URL10);
  await expect(page.getByRole('heading', { name: 'Bảng lương', exact: true })).toBeVisible();
  await expect(page.getByText('Kỳ lương tháng 10/2026 · công 01–31/10 · công chuẩn 26 ngày · trả lương 05/11/2026')).toBeVisible();
  await expect(page.locator('.period .steps .step')).toHaveCount(6);
  await expect(tile(page, 'Tổng thu nhập tháng 10')).toContainText('2,48');
  await expect(tile(page, 'Tổng thu nhập tháng 10')).toContainText('▲ 3,2% so với tháng 9');
  await expect(tile(page, 'Thực nhận')).toContainText('2,11');
  await expect(tile(page, 'Thực nhận')).toContainText('85% tổng thu nhập');
  await expect(tile(page, 'Khấu trừ')).toContainText('0,37');
  await expect(tile(page, 'Khấu trừ')).toContainText('Bảo hiểm 0,26 · Thuế 0,09 · Tạm ứng 0,02');
  await expect(tile(page, 'Phiếu đã duyệt')).toContainText('86 / 128');
  for (const name of ['Tất cả 128', 'Nháp 12', 'Chờ duyệt 29', 'Đã duyệt 86', 'Từ chối 1'])
    await expect(filters(page).getByRole('button', { name, exact: true })).toBeVisible();
  await expect(rows(page)).toHaveCount(10);
  // Mật độ mặc định là Gọn: dòng 42px, cả ô tên (th) lẫn ô số (td).
  expect((await rows(page).first().boundingBox())?.height).toBe(42);
  await expect(row(page, 'Lê Hoàng Nam')).toContainText('24 / 26');
  await expect(row(page, 'Lê Hoàng Nam')).toContainText('14.278.183');
  await expect(row(page, 'Đỗ Mai Linh')).toContainText('−125.000');
  await expect(row(page, 'Bùi Quốc Huy').locator('[title="Thiếu điểm Tự đánh giá, tính 0"]')).toContainText('1.481.200');
  await expect(table(page).locator('tfoot')).toContainText('Tổng 10 phiếu đang hiện');
  await expect(table(page).locator('tfoot')).toContainText('171.959.432');
  await expect(page.getByText('Thiếu điểm KPI, cột thiếu tính 0 điểm')).toBeVisible();
  await expect(page.getByText('Hiển thị 10 trong 128 phiếu')).toBeVisible();
  expect(calls).toEqual([]);
});

test('status filter, department and accent-free search', async ({ page }) => {
  await page.goto(URL10);
  await filters(page).getByRole('button', { name: /^Chờ duyệt/ }).click();
  await expect(filters(page).getByRole('button', { name: /^Chờ duyệt/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(rows(page)).toHaveCount(4);
  for (const [i, name] of ['Lê Hoàng Nam', 'Phạm Ngọc Anh', 'Trịnh Văn Long', 'Ngô Gia Bảo'].entries())
    await expect(rows(page).nth(i)).toContainText(name);
  await expect(page.getByText('Hiển thị 4 trong 29 phiếu')).toBeVisible();
  await filters(page).getByRole('button', { name: /^Tất cả/ }).click();
  await page.getByLabel('Phòng ban').selectOption({ label: 'Phòng ban: Sản xuất' });
  await expect(rows(page)).toHaveCount(4);
  await page.getByLabel('Phòng ban').selectOption({ label: 'Phòng ban: Tất cả' });
  const search = page.getByLabel('Tìm theo tên', { exact: true });
  await search.fill('hoang nam');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Lê Hoàng Nam');
  await search.fill('xyz');
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByText('Không có phiếu nào khớp.')).toBeVisible();
  await expect(table(page).locator('tfoot')).toHaveCount(0);
});

test('filters stack and search folds đ and spaces', async ({ page }) => {
  await page.goto(URL10);
  await filters(page).getByRole('button', { name: /^Chờ duyệt/ }).click();
  await page.getByLabel('Phòng ban').selectOption({ label: 'Phòng ban: Sản xuất' });
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(0)).toContainText('Trịnh Văn Long');
  await expect(rows(page).nth(1)).toContainText('Ngô Gia Bảo');
  await expect(page.getByText('Hiển thị 2 trong 29 phiếu')).toBeVisible();
  await filters(page).getByRole('button', { name: /^Tất cả/ }).click();
  await page.getByLabel('Phòng ban').selectOption({ label: 'Phòng ban: Tất cả' });
  await page.getByLabel('Tìm theo tên', { exact: true }).fill('  do mai ');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Đỗ Mai Linh');
});

test('one gold tile, and kem ground with the light sidebar', async ({ page }) => {
  await page.goto(URL10);
  await expect(rows(page)).toHaveCount(10);
  const golds = await page.locator('main').evaluate(root =>
    [...root.querySelectorAll('*')].filter(el => getComputedStyle(el).backgroundColor === 'rgb(232, 195, 114)').length
  );
  expect(golds).toBe(1);
  await page.getByRole('button', { name: /Quản trị viên/ }).click();
  await page.locator('.pop .mr', { hasText: 'Màu nền' }).getByRole('button', { name: 'Kem' }).click();
  await page.locator('.pop .mr', { hasText: 'Thanh bên' }).getByRole('button', { name: 'Sáng' }).click();
  await page.keyboard.press('Escape');
  await expect(rows(page)).toHaveCount(10);
  await expect(table(page).locator('td.ded').first()).toHaveCSS('background-color', 'rgb(251, 248, 241)');
});

test('other months show the mockup notice', async ({ page }) => {
  await page.goto('/admin/bang-luong?thang=2026-09');
  await expect(page.getByRole('heading', { name: 'Bảng lương', exact: true })).toBeVisible();
  await expect(page.locator('.period .state')).toContainText('Đã trả lương');
  await expect(page.getByText('Bản mockup chỉ có bảng lương tháng 10/2026.')).toBeVisible();
  await expect(tiles(page)).toHaveCount(0);
  await expect(table(page)).toHaveCount(0);
});
