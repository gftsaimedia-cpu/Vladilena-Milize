// Ngăn kéo phải của trang nhân viên máy tính, mở theo URL (spec staff-desktop-one-page 3.3, 5–7). Mock, không gọi /api.
import { expect, test } from '@playwright/test';
import { openDesktop } from './fixtures/staff-desktop';

test('drawers make no /api request and log no error', async ({ page }) => {
  const calls = await openDesktop(page, '/nv/cham-cong?ngay=2026-10-27');
  await expect(page.getByRole('dialog', { name: 'Thứ Ba 27/10/2026' })).toBeVisible();
  expect(calls).toEqual([]);
});

test('/nv/cham-cong?ngay= opens the day drawer and Esc drops the param', async ({ page }) => {
  await openDesktop(page, '/nv/cham-cong?ngay=2026-10-27');
  const d = page.getByRole('dialog', { name: 'Thứ Ba 27/10/2026' });
  for (const t of [
    'Ca HC 08:00–17:00',
    'Cần xử lý',
    '08:12',
    'Chưa có',
    '12 phút',
    'Đã gửi giải trình lúc 20:14',
    'Giờ ra khai 17:30 · chờ Admin duyệt'
  ])
    await expect(d).toContainText(t);
  await expect(page.locator('.sd-drawer')).toHaveCount(1);
  await expect(page.locator('.ph-sheet')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(d).toBeHidden();
  await expect(page).toHaveURL(/\/nv\/cham-cong$/);
});

test('the same URL opens the phone sheet below 1136px', async ({ page }) => {
  await openDesktop(page, '/nv/cham-cong?ngay=2026-10-27', { width: 390, height: 844 });
  await expect(page.locator('.ph-sheet')).toBeVisible();
  await expect(page.locator('.sd-drawer')).toHaveCount(0);
});

test('×, Đóng and the scrim close the drawer', async ({ page }) => {
  for (const how of ['x', 'close', 'scrim'] as const) {
    await openDesktop(page, '/nv/cham-cong?ngay=2026-10-26');
    const d = page.getByRole('dialog', { name: 'Thứ Hai 26/10/2026' });
    if (how === 'x') await d.getByRole('button', { name: 'Đóng' }).first().click();
    if (how === 'close') await d.getByRole('button', { name: 'Đóng' }).last().click();
    if (how === 'scrim') await page.locator('.sd-scrim').click({ position: { x: 10, y: 10 } });
    await expect(d).toBeHidden();
    await expect(page).toHaveURL(/\/nv\/cham-cong$/);
  }
});

test('/nv/yeu-cau?yc=gio-vao-0909 shows the rejection note (K3b)', async ({ page }) => {
  await openDesktop(page, '/nv/yeu-cau?yc=gio-vao-0909');
  const d = page.getByRole('dialog', { name: 'Khai giờ vào 09/09' });
  for (const t of [
    'Giải trình',
    'Từ chối',
    'Thứ Tư 09/09/2026',
    '08:00',
    '“Máy chấm công không nhận.”',
    '09/09 17:45',
    'Admin đã từ chối',
    '10/09 10:15',
    'Lý do từ chối',
    '“Máy chấm công vẫn ghi nhận ngày 09/09, giờ vào 08:47.”'
  ])
    await expect(d).toContainText(t);
  await expect(d.getByRole('button', { name: 'Đóng' })).toHaveCount(2);
});

test('/nv/toi?hop=doi-mat-khau opens the password drawer; Huỷ brings the menu back', async ({ page }) => {
  await openDesktop(page, '/nv/toi?hop=doi-mat-khau');
  const d = page.getByRole('dialog', { name: 'Đổi mật khẩu' });
  await expect(d).toContainText('Tài khoản nhanvien');
  await d.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(d.getByRole('alert')).toContainText('Nhập mật khẩu hiện tại.');
  await d.getByRole('button', { name: 'Huỷ' }).click();
  await expect(page).toHaveURL(/\/nv\/toi$/);
  await expect(page.getByRole('region', { name: 'Tài khoản của tôi' })).toBeVisible();
});

test('unknown params are dropped and nothing opens', async ({ page }) => {
  for (const [from, to] of [
    ['/nv/cham-cong?ngay=2026-10-04', /\/nv\/cham-cong$/],
    ['/nv/yeu-cau?yc=khong-co', /\/nv\/yeu-cau$/],
    ['/nv/toi?hop=la', /\/nv\/toi$/]
  ] as const) {
    await openDesktop(page, from);
    await expect(page).toHaveURL(to);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});

test('params on another path are ignored', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay?ngay=2026-10-27');
  await expect(page.getByRole('button', { name: 'Lê Hoàng Nam' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/nv\/hom-nay\?ngay=2026-10-27$/);
});

test('closing a drawer opened from the URL focuses the account button', async ({ page }) => {
  await openDesktop(page, '/nv/yeu-cau?yc=phep-1210');
  await expect(page.getByRole('dialog', { name: 'Phép năm 12/10' })).toBeVisible(); // đọc chi tiết bất đồng bộ: chờ mở xong rồi mới Esc
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Lê Hoàng Nam' })).toBeFocused();
});

test('resizing with a drawer open hands over to the phone sheet', async ({ page }) => {
  await openDesktop(page, '/nv/cham-cong?ngay=2026-10-27');
  await expect(page.locator('.sd-drawer')).toBeVisible();
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(page.locator('.ph-sheet')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.getByRole('dialog').getByRole('button', { name: 'Đóng' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
  await page.goto('/nv/cham-cong?ngay=2026-10-27');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.sd-drawer')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
});

// F1: mở ngăn kéo là router.replace sang đường dẫn khác của cùng trang một trang, không được cuộn trang về đầu.
const scrollToBottom = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    return scrollY;
  });

test('opening a drawer from Gần đây keeps the page scroll position', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  const row = page.locator('.sd-app button.ro', { hasText: 'Thứ Hai 26/10' });
  await expect(row).toBeVisible();
  const before = await scrollToBottom(page);
  expect(before).toBeGreaterThan(100);
  await row.click({ delay: 80 });
  await expect(page.getByRole('dialog', { name: 'Thứ Hai 26/10/2026' })).toBeVisible();
  expect(Math.abs((await page.evaluate(() => scrollY)) - before)).toBeLessThanOrEqual(2); // bỏ thanh cuộn khi khoá cuộn làm lệch ~1px; trước khi sửa là nhảy về 0
});

test('with the menu open, a click on a row below the fold still opens its drawer', async ({ page }) => {
  await openDesktop(page, '/nv/toi');
  const row = page.locator('.sd-app button.ro', { hasText: 'Thứ Hai 26/10' });
  await expect(row).toBeVisible();
  const before = await scrollToBottom(page);
  expect(before).toBeGreaterThan(100);
  await row.click({ delay: 80 });
  await expect(page).toHaveURL(/\?ngay=2026-10-26$/);
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Tài khoản của tôi' })).toBeHidden();
  expect(Math.abs((await page.evaluate(() => scrollY)) - before)).toBeLessThanOrEqual(2); // bỏ thanh cuộn khi khoá cuộn làm lệch ~1px; trước khi sửa là nhảy về 0
});

// F4: ngăn kéo đổi mật khẩu đưa focus vào ô đầu của biểu mẫu như hộp trượt điện thoại, không vào nút ×.
test('the password drawer focuses the first field', async ({ page }) => {
  await openDesktop(page, '/nv/toi?hop=doi-mat-khau');
  await expect(page.getByRole('dialog', { name: 'Đổi mật khẩu' })).toBeVisible();
  await expect(page.getByLabel('Mật khẩu hiện tại')).toBeFocused();
});
