import { expect, test, type Page } from '@playwright/test';

// Hồ sơ chấm công chạy trên dữ liệu giả (mock/attendance-employee.ts): không page.route, không gọi /api.
// Mỗi test mở một trang mới nên module giả luôn bắt đầu từ trạng thái ban đầu (13 việc chờ).
const NAM = '/admin/cham-cong/nhan-vien/le-hoang-nam';
let calls: string[] = [];

const mainOf = (page: Page) => page.getByRole('main');
const timelineOf = (page: Page) => page.getByRole('list', { name: 'Dòng thời gian' });
const foldOf = (page: Page, label: string) => page.getByRole('button', { name: label });
const dialogOf = (page: Page) => page.getByRole('dialog');
const bellOf = (page: Page) => page.locator('.topbar .bell');

test.beforeEach(async ({ page }) => {
  calls = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api')) calls.push(`${req.method()} ${url.pathname}`);
  });
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('profile shows the employee, the month and the pending day', async ({ page }) => {
  await page.goto(NAM);
  await expect(page.getByRole('heading', { name: 'Hồ sơ chấm công', level: 1 })).toBeVisible();
  await expect(mainOf(page).getByRole('link', { name: 'Chấm công', exact: true })).toHaveAttribute(
    'href',
    '/admin/cham-cong'
  );
  await expect(page.getByRole('heading', { name: 'Lê Hoàng Nam' })).toBeVisible();
  await expect(page.getByText('Mã GFT-0142 · vào làm 03/2024')).toBeVisible();
  await expect(page.getByText('3 / 11', { exact: true })).toBeVisible();
  await expect(page.getByText('1 ngày cần xử lý · 27/10 thiếu giờ ra, chờ duyệt giải trình')).toBeVisible();

  const stats = page.getByRole('region', { name: 'Chỉ số tháng 10' });
  await expect(stats).toContainText('25 / 26');
  await expect(stats.getByRole('article')).toHaveCount(4);
  await expect(page.locator('nav[aria-label="Điều hướng"] a[aria-current="page"]')).toContainText('Chấm công');
  expect(calls).toEqual([]);
});

test('previous and next follow the roster and stop at the ends', async ({ page }) => {
  await page.goto(NAM);
  await page.getByRole('button', { name: 'Nhân viên sau' }).click();
  await expect(page).toHaveURL(/\/admin\/cham-cong\/nhan-vien\/pham-ngoc-anh$/);
  await expect(page.getByText('4 / 11', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Phạm Ngọc Anh' })).toBeVisible();

  await page.goto('/admin/cham-cong/nhan-vien/nguyen-thu-ha');
  await expect(page.getByRole('button', { name: 'Nhân viên trước' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Nhân viên sau' })).toBeEnabled();

  await page.goto('/admin/cham-cong/nhan-vien/hoang-minh-duc');
  await expect(page.getByRole('button', { name: 'Nhân viên sau' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Nhân viên trước' })).toBeEnabled();
});

test('stepping onto the last person hands focus to the other button', async ({ page }) => {
  await page.goto('/admin/cham-cong/nhan-vien/ngo-gia-bao');
  const next = page.getByRole('button', { name: 'Nhân viên sau' });
  await expect(next).toBeEnabled();
  await next.click();
  await expect(page.getByRole('heading', { name: 'Hoàng Minh Đức' })).toBeVisible();
  await expect(next).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Nhân viên trước' })).toBeFocused();
});

test('history folds plain work days and opens them', async ({ page }) => {
  await page.goto(NAM);
  const list = timelineOf(page);
  await expect(list.getByRole('listitem')).toHaveCount(8);

  const fold = foldOf(page, '9 ngày đi làm · 13/10 – 22/10');
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await fold.click();
  await expect(fold).toHaveAttribute('aria-expanded', 'true');
  await expect(list.getByRole('listitem')).toHaveCount(17);
  await expect(list.getByText('Thứ Bảy 17/10')).toBeVisible();

  await expect(list.getByText('Thứ Ba 27/10')).toBeVisible();
  await expect(list.getByText('Trễ 12 phút · chưa có giờ ra')).toBeVisible();
  await expect(list.getByText('Chờ duyệt giải trình')).toBeVisible();

  await fold.click();
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await expect(list.getByRole('listitem')).toHaveCount(8);
});

test('exceptions filter and the hours table', async ({ page }) => {
  await page.goto(NAM);
  await page.getByRole('tab', { name: 'Bảng giờ' }).click();
  await expect(page.getByRole('table', { name: 'Bảng giờ' }).locator('tbody tr')).toHaveCount(24);
  await page.getByRole('tab', { name: 'Dòng thời gian' }).click();
  const only = page.getByRole('button', { name: 'Chỉ ngày có ngoại lệ' });
  await expect(only).toHaveAttribute('aria-pressed', 'false');
  await only.click();
  await expect(only).toHaveAttribute('aria-pressed', 'true');
  const list = timelineOf(page);
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list).toContainText('Thứ Ba 27/10');
  await expect(list).toContainText('Thứ Hai 12/10');
  await expect(page.getByRole('button', { name: /ngày đi làm/ })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Bảng giờ' }).click();
  const table = page.getByRole('table', { name: 'Bảng giờ' });
  await expect(table.getByRole('columnheader')).toHaveText(['Ngày', 'Vào', 'Ra', 'Trạng thái']);
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table.locator('tbody tr').first()).toContainText('08:12');
  await expect(table.locator('tbody tr').first()).toContainText('Chờ duyệt giải trình');
});

test('week names, the bell and the day dialog open the profile', async ({ page }) => {
  await page.goto('/admin/cham-cong?thang=2026-10');
  await page.getByRole('link', { name: 'Lê Hoàng Nam' }).click();
  await expect(page).toHaveURL(`${NAM}?thang=2026-10`);
  await expect(page.getByRole('heading', { name: 'Hồ sơ chấm công', level: 1 })).toBeVisible();
  await expect(mainOf(page).getByRole('link', { name: 'Chấm công', exact: true })).toHaveAttribute(
    'href',
    '/admin/cham-cong?thang=2026-10'
  );

  await page.goto('/admin/tong-quan');
  await bellOf(page).click();
  const drawer = page.getByRole('dialog', { name: 'Thông báo' });
  await drawer.getByRole('button', { name: /^Lê Hoàng Nam, / }).click();
  await page.getByRole('region', { name: 'Chi tiết yêu cầu' }).getByRole('link', { name: 'Mở hồ sơ chấm công' }).click();
  await expect(page).toHaveURL(new RegExp(`${NAM}$`));
  await expect(page.getByRole('dialog', { name: 'Thông báo' })).toHaveCount(0);

  await page.goto('/admin/cham-cong');
  await page.getByRole('button', { name: /^Lê Hoàng Nam, Thứ Ba 27\/10:/ }).click();
  await dialogOf(page).getByRole('link', { name: 'Mở hồ sơ chấm công' }).click();
  await expect(page).toHaveURL(new RegExp(`${NAM}$`));
  await expect(dialogOf(page)).toHaveCount(0);
});

test('strip day opens the day dialog without a profile link and deciding clears the callout', async ({ page }) => {
  await page.goto(NAM);
  const strip = page.getByRole('region', { name: 'Các ngày tháng 10' });
  await strip.getByRole('button', { name: 'Thứ Ba 27/10: Cần xử lý, Thiếu giờ ra' }).click();
  const dialog = dialogOf(page);
  await expect(dialog).toHaveAccessibleName('Lê Hoàng Nam · Thứ Ba 27/10/2026');
  await expect(dialog.getByRole('link', { name: 'Mở hồ sơ chấm công' })).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Từ chối yêu cầu của Lê Hoàng Nam' }).click();
  await expect(page.getByText('Đã từ chối yêu cầu của Lê Hoàng Nam.')).toBeVisible();
  await expect(dialogOf(page)).toHaveCount(0);
  await expect(page.getByText('ngày cần xử lý')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Xem ngày' })).toHaveCount(0);
  await expect(strip.getByRole('button', { name: /^Thứ Ba 27\/10: Đi muộn/ })).toBeVisible();
});

test('clearing the last pending day leaves focus on the strip day just handled', async ({ page }) => {
  await page.goto(NAM);
  const strip = page.getByRole('region', { name: 'Các ngày tháng 10' });
  await page.getByRole('button', { name: 'Xem ngày' }).click();
  await dialogOf(page).getByRole('button', { name: 'Từ chối yêu cầu của Lê Hoàng Nam' }).click();
  await expect(dialogOf(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Xem ngày' })).toHaveCount(0);
  await expect(strip.getByRole('button', { name: /^Thứ Ba 27\/10:/ })).toBeFocused();
});

test('with no strip day left to return to, focus falls back to the history tab', async ({ page }) => {
  await page.goto(NAM);
  const call = page.getByRole('button', { name: 'Xem ngày' });
  await expect(call).toBeVisible();
  await call.click();
  // Dữ liệu giả không có ngày tháng 10 nào về ô không ca sau khi xử lý, nên gỡ nút ngày khỏi dải để thử nhánh dự phòng.
  await page.evaluate(() => document.querySelector('.ms-i[data-date="2026-10-27"]')?.remove());
  await dialogOf(page).getByRole('button', { name: 'Từ chối yêu cầu của Lê Hoàng Nam' }).click();
  await expect(dialogOf(page)).toHaveCount(0);
  await expect(call).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Dòng thời gian' })).toBeFocused();
});

test('the callout opens the first pending day', async ({ page }) => {
  await page.goto('/admin/cham-cong/nhan-vien/nguyen-thu-ha');
  await expect(page.getByText('2 ngày cần xử lý · 29/10 phép năm, chờ duyệt đơn nghỉ')).toBeVisible();
  await page.getByRole('button', { name: 'Xem ngày' }).click();
  await expect(dialogOf(page)).toHaveAccessibleName('Nguyễn Thu Hà · Thứ Năm 29/10/2026');
});

test('unknown employee and other months', async ({ page }) => {
  await page.goto('/admin/cham-cong/nhan-vien/khong-co');
  await expect(page.getByText('Không tìm thấy nhân viên này.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Về Chấm công' })).toHaveAttribute('href', '/admin/cham-cong');

  await page.goto(`${NAM}?thang=2026-09`);
  await expect(page.getByRole('heading', { name: 'Lê Hoàng Nam' })).toBeVisible();
  await expect(page.getByText('Chưa có dữ liệu chấm công giả cho tháng 9/2026.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Chỉ số tháng 9' })).toHaveCount(0);
  expect(calls).toEqual([]);
});

test('profile fits 375px and the month strip scrolls in its own region', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(NAM);
  const strip = page.getByRole('region', { name: 'Các ngày tháng 10' });
  await expect(strip).toBeVisible();
  await expect(strip).toHaveAttribute('tabindex', '0');
  const sizes = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(sizes.doc).toBeLessThanOrEqual(sizes.inner);
  expect(await strip.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
});
