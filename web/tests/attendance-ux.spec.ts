import { expect, test, type Page } from '@playwright/test';
import { inApp } from './fixtures/in-app';

// Chấm công theo tuần chạy trên dữ liệu giả (mock/attendance.ts): không page.route, không gọi /api.
// Mỗi test mở một trang mới nên module giả luôn bắt đầu từ trạng thái ban đầu (13 việc chờ, 11 việc có ngày).
let calls: string[] = [];

const gridOf = (page: Page) => page.getByRole('region', { name: 'Lưới chấm công' });
const tileOf = (page: Page, name: string) =>
  page.getByRole('region', { name: 'Chỉ số chấm công' }).getByRole('article', { name });
const cellOf = (page: Page, name: string | RegExp) => page.getByRole('button', { name });
const dialogOf = (page: Page) => page.getByRole('dialog');
const rowsOf = (page: Page) => page.locator('tbody tr');
const pendingTab = (page: Page) => page.getByRole('tab', { name: /^Cần xử lý/ });
const bellOf = (page: Page) => page.locator('.topbar .bell');

test.beforeEach(async ({ page }) => {
  calls = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api')) calls.push(`${req.method()} ${url.pathname}`);
  });
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('attendance week shows tiles, the current week and today without calling /api', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  await expect(page.getByRole('heading', { name: 'Chấm công', level: 1 })).toBeVisible();
  await expect(page.getByText('Kỳ công 01–31/10/2026 · hôm nay Thứ Tư 28/10')).toBeVisible();

  await expect(page.getByRole('region', { name: 'Chỉ số chấm công' }).getByRole('article')).toHaveCount(6);
  await expect(tileOf(page, 'Cần xử lý').locator('.tile-v')).toHaveText('11');
  await expect(tileOf(page, 'Cần xử lý').locator('.tile-n')).toHaveText('2 quên chấm · 9 yêu cầu chờ duyệt');
  await expect(tileOf(page, 'Nghỉ có phép').locator('.tile-n')).toHaveText('3 đơn chờ duyệt');

  await expect(page.getByRole('tab', { name: 'Tuần', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(pendingTab(page)).toContainText('11');
  await expect(page.getByRole('tab', { name: 'Tháng' })).toHaveCount(0);

  await expect(page.locator('.wk-label')).toHaveText('26/10 – 01/11/2026');
  await expect.poll(() => gridOf(page).evaluate(el => el.scrollLeft)).toBe(1344);
  await expect(rowsOf(page)).toHaveCount(11);
  const count = (group: string) => page.locator(`[data-group="${group}"] .ct`);
  await expect(count('work')).toHaveText('25');
  await expect(count('late')).toHaveText('2');
  await expect(count('leave')).toHaveText('0');
  await expect(count('absent')).toHaveText('0');
  await expect(count('todo')).toHaveText('8');
  await expect(page.getByText('Hiển thị 11 trong 128 nhân viên')).toBeVisible();
  expect(calls).toEqual([]);
});

test('cells read their state and off days are not buttons', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  await expect(rowsOf(page)).toHaveCount(11);

  const todo = cellOf(page, 'Lê Hoàng Nam, Thứ Ba 27/10: Cần xử lý, Thiếu giờ ra');
  await expect(todo).toHaveClass(/\btodo\b/);
  const late = cellOf(page, 'Phạm Ngọc Anh, Thứ Tư 28/10: Đi muộn, 08:21–…, đang làm');
  await expect(late).toHaveClass(/\blate\b/);
  await expect(late.locator('.dot')).toHaveCount(1);

  const off = 'Nguyễn Thu Hà, Chủ nhật 01/11: không có ca';
  await expect(page.getByRole('img', { name: off })).toBeVisible();
  await expect(cellOf(page, off)).toHaveCount(0);
  await expect(cellOf(page, 'Nguyễn Thu Hà, Thứ Bảy 31/10: ca dự kiến 08:00–17:00')).toBeVisible();
  await expect(cellOf(page, 'Ngô Gia Bảo, Chủ nhật 01/11: Cần xử lý, Làm bù')).toHaveClass(/\btodo\b/);

  await expect(page.locator('th[data-date="2026-11-01"]')).toHaveCSS('color', 'rgb(158, 158, 158)');
  await expect(page.locator('th[data-date="2026-10-31"]')).not.toHaveCSS('color', 'rgb(158, 158, 158)');

  const link = page.getByRole('link', { name: 'Lê Hoàng Nam' });
  await expect(link).toHaveAttribute('href', '/admin/cham-cong/nhan-vien/le-hoang-nam');
  await expect(link).toHaveAttribute('draggable', 'false');
});

test('name and department filters live in the URL and survive dialog, reload, back and forward', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  await page.getByRole('navigation', { name: 'Điều hướng' }).getByRole('link', { name: 'Chấm công', exact: true }).click();
  const name = page.getByRole('textbox', { name: 'Lọc theo tên' });
  const dept = page.getByRole('combobox', { name: 'Phòng ban' });

  await name.fill('nam');
  await expect(page).toHaveURL(/q=nam/);
  await expect(rowsOf(page)).toHaveCount(1);
  await expect(rowsOf(page)).toContainText('Lê Hoàng Nam');

  await name.fill('');
  await dept.selectOption('Sản xuất');
  await expect(page).toHaveURL(/pb=S%E1%BA%A3n/);
  await expect(rowsOf(page)).toHaveCount(4);

  await cellOf(page, /^Bùi Quốc Huy, Thứ Hai 26\/10:/).click();
  await expect(dialogOf(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialogOf(page)).toHaveCount(0);
  await expect(page).toHaveURL(/pb=S%E1%BA%A3n/);
  await expect(rowsOf(page)).toHaveCount(4);

  await page.reload();
  await expect(rowsOf(page)).toHaveCount(4);
  await expect(dept).toHaveValue('Sản xuất');

  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/tong-quan/);
  await page.goForward();
  await expect(page).toHaveURL(/pb=S%E1%BA%A3n/);
  await expect(rowsOf(page)).toHaveCount(4);

  await page.getByRole('textbox', { name: 'Lọc theo tên' }).fill('xyz');
  await expect(page.getByText('Không có nhân viên nào khớp.')).toBeVisible();
  await expect(page.getByText('Hiển thị 0 trong 128 nhân viên')).toBeVisible();
});

test('unknown department in the URL falls back to all', async ({ page }) => {
  await page.goto('/admin/cham-cong?pb=Kho');
  await expect(rowsOf(page)).toHaveCount(11);
  await expect(page).not.toHaveURL(/pb=/);
  await expect(page.getByRole('combobox', { name: 'Phòng ban' }).locator('option:checked')).toHaveText(
    'Phòng ban: Tất cả'
  );
});

test('phone keeps the labelled filters inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/admin/cham-cong');
  for (const control of [
    page.getByRole('textbox', { name: 'Lọc theo tên' }),
    page.getByRole('combobox', { name: 'Phòng ban' })
  ]) {
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  }
  await page.getByRole('textbox', { name: 'Lọc theo tên' }).fill('linh');
  await expect(rowsOf(page)).toHaveCount(1);
  await expect(rowsOf(page)).toContainText('Đỗ Mai Linh');
});

test('pending tab lists every day to handle in date order', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  await pendingTab(page).click();
  await expect(page).toHaveURL(/xem=can-xu-ly/);

  const list = page.getByRole('list', { name: 'Việc cần xử lý chấm công' });
  const items = list.getByRole('listitem');
  await expect(items).toHaveCount(11);
  await expect(items.nth(0)).toContainText('Trần Minh Quân');
  await expect(items.nth(0)).toContainText('15/10');
  await expect(items.nth(3)).toContainText('Lý Thanh Tâm');
  await expect(items.nth(4)).toContainText('Đỗ Mai Linh');
  await expect(items.nth(10)).toContainText('Phạm Ngọc Anh');
  await expect(items.nth(10)).toContainText('03/11');

  await page.reload();
  await expect(pendingTab(page)).toHaveAttribute('aria-selected', 'true');
  await list.getByRole('button', { name: /Lê Hoàng Nam/ }).click();
  await expect(dialogOf(page)).toHaveAccessibleName('Lê Hoàng Nam · Thứ Ba 27/10/2026');
});

test('day dialog deep-links, shows the request and closes back to the grid', async ({ page }) => {
  await page.goto('/admin/cham-cong?thang=2026-10&q=nam');
  const cell = cellOf(page, /^Lê Hoàng Nam, Thứ Ba 27\/10:/);
  await cell.click();
  await expect(page).toHaveURL(/hop=chi-tiet-ngay/);
  await expect(page).toHaveURL(/nv=le-hoang-nam/);
  await expect(page).toHaveURL(/ngay=2026-10-27/);

  const dialog = dialogOf(page);
  const row = (label: RegExp) => dialog.locator('.dd-r', { hasText: label });
  await expect(dialog.getByText('Kinh doanh · Nhân viên kinh doanh · Ca HC 08:00–17:00')).toBeVisible();
  await expect(row(/^Giờ vào/)).toContainText('08:12');
  await expect(row(/^Giờ ra/)).toContainText('Chưa có');
  await expect(dialog.getByRole('button', { name: 'Duyệt yêu cầu của Lê Hoàng Nam' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Mở hồ sơ chấm công' })).toBeVisible();

  await page.reload();
  await expect(dialogOf(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialogOf(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin\/cham-cong\?thang=2026-10&q=nam$/);

  await cell.click();
  await expect(dialogOf(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(cell).toBeFocused();
});

test('approving in the day dialog updates the cell, the tile and the bell', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  await cellOf(page, /^Lê Hoàng Nam, Thứ Ba 27\/10:/).click();
  await dialogOf(page).getByRole('button', { name: 'Duyệt yêu cầu của Lê Hoàng Nam' }).click();

  await expect(page.getByText('Đã duyệt yêu cầu của Lê Hoàng Nam.')).toBeVisible();
  await expect(dialogOf(page)).toHaveCount(0);
  await expect(cellOf(page, 'Lê Hoàng Nam, Thứ Ba 27/10: Đi muộn, 08:12–?')).toHaveClass(/\blate\b/);
  await expect(tileOf(page, 'Cần xử lý').locator('.tile-v')).toHaveText('10');
  await expect(page.locator('[data-group="todo"] .ct')).toHaveText('7');
  await expect(bellOf(page)).toHaveAccessibleName('Thông báo, 12 việc cần xử lý');
});

test('deciding an item already handled elsewhere warns instead of confirming', async ({ page }) => {
  await page.goto('/admin/cham-cong?hop=chi-tiet-ngay&nv=le-hoang-nam&ngay=2026-10-27');
  await expect(dialogOf(page)).toBeVisible();
  await inApp(page, `const I = await import('/src/mock/inbox.ts'); return I.resolveInboxItem('ib-e1') !== null;`);
  await dialogOf(page).getByRole('button', { name: 'Duyệt yêu cầu của Lê Hoàng Nam' }).click();

  await expect(page.getByText('Yêu cầu này đã được xử lý.')).toBeVisible();
  await expect(page.getByText('Đã duyệt yêu cầu của Lê Hoàng Nam.')).toHaveCount(0);
});

test('bad day links close quietly', async ({ page }) => {
  for (const query of [
    'nv=khong-co&ngay=2026-10-27',
    'nv=le-hoang-nam&ngay=2026-13-01',
    'nv=le-hoang-nam&ngay=hom-qua'
  ]) {
    await page.goto(`/admin/cham-cong?hop=chi-tiet-ngay&${query}`);
    await expect(page).toHaveURL(/\/admin\/cham-cong$/);
    await expect(dialogOf(page)).toHaveCount(0);
    await expect(gridOf(page)).toBeVisible();
  }
});

test('other months show the empty line', async ({ page }) => {
  await page.goto('/admin/cham-cong?thang=2026-09');
  await expect(page.getByText('Chưa có dữ liệu chấm công giả cho tháng 9/2026.')).toBeVisible();
  await expect(gridOf(page)).toHaveCount(0);
});

test('old attendance links land on the week view', async ({ page }) => {
  await page.goto('/admin/cham-cong/bang-cong?thang=2026-10');
  await expect(page).toHaveURL(/\/admin\/cham-cong\?thang=2026-10$/);

  for (const path of ['sua-gio', 'gio-ot']) {
    await page.goto(`/admin/cham-cong/${path}`);
    await expect(page).toHaveURL(/xem=can-xu-ly/);
    await expect(pendingTab(page)).toHaveAttribute('aria-selected', 'true');
  }

  await page.goto('/admin/cham-cong/hom-nay');
  await expect(page).toHaveURL(/\/admin\/cham-cong$/);
  await expect(dialogOf(page)).toHaveCount(0);
});

test('attendance css stays inside the attendance screens after navigating away', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  await expect(rowsOf(page)).toHaveCount(11);
  await page.getByRole('navigation', { name: 'Điều hướng' }).getByRole('link', { name: 'Tổng quan', exact: true }).click();
  await expect(page).toHaveURL(/tong-quan/);
  // Phần tử mang class chung (.b của ô chữ ở Nhân sự, .legend ở Tổng quan) không được nhận kiểu của chú giải chấm công.
  const styles = await page.evaluate(() => {
    const probe = (cls: string) => {
      const el = document.createElement('div');
      el.className = cls;
      el.textContent = 'Thử nghiệm kiểu dáng';
      document.body.append(el);
      const cs = getComputedStyle(el);
      const out = { width: el.getBoundingClientRect().width, display: cs.display, radius: cs.borderTopLeftRadius };
      el.remove();
      return out;
    };
    return { b: probe('b'), legend: probe('legend') };
  });
  expect(styles.b.display).toBe('block');
  expect(styles.b.width).toBeGreaterThan(12);
  expect(styles.b.radius).toBe('0px');
  expect(styles.legend.display).toBe('block');
});

test('legend items are flat: no capsule, no border', async ({ page }) => {
  await page.goto('/admin/cham-cong');
  const item = page.locator('[data-group="work"]');
  await expect(item).toBeVisible();
  await expect(item).toHaveCSS('border-top-width', '0px');
  await expect(item).toHaveCSS('border-top-left-radius', '0px');
  await expect(item).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});
