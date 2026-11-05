// Cột 1 của trang nhân viên máy tính: Hôm nay + Yêu cầu (spec staff-desktop-one-page 4.1). Mock, không gọi /api.
import { expect, test } from '@playwright/test';
import { openDesktop } from './fixtures/staff-desktop';

const col1 = (page: import('@playwright/test').Page) => page.locator('.sd-col').nth(0);

test('column 1 makes no /api request and logs no error', async ({ page }) => {
  const calls = await openDesktop(page, '/nv/hom-nay');
  await expect(page.getByRole('heading', { level: 1, name: 'Lê Hoàng Nam' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Ca hôm nay' })).toBeVisible();
  expect(calls).toEqual([]);
});

test('column 1 shows the greeting, the shift card and the week', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  await expect(page.getByRole('heading', { level: 1, name: 'Lê Hoàng Nam' })).toBeVisible();
  for (const t of ['Chào buổi sáng', 'Thứ Tư', '28/10/2026']) await expect(col1(page)).toContainText(t);
  const hero = page.getByRole('region', { name: 'Ca hôm nay' });
  for (const t of ['Ca HC · 08:00–17:00', 'Đang trong ca', '1g 41p', 'đã làm · vào 07:59']) await expect(hero).toContainText(t);
  await expect(page.getByRole('region', { name: 'Tuần này' })).toContainText('26/10 – 01/11');
});

test('a week day opens the day drawer and Esc returns focus to it', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  const cell = page.getByRole('link', { name: 'Thứ Ba 27/10: cần xử lý' });
  await cell.click();
  await expect(page).toHaveURL(/\/nv\/cham-cong\?ngay=2026-10-27$/);
  await expect(page.getByRole('dialog', { name: 'Thứ Ba 27/10/2026' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/nv\/cham-cong$/);
  await expect(cell).toBeFocused();
});

test('the reminder link opens 27/10', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  await page.getByRole('link', { name: '27/10 thiếu giờ ra · chờ duyệt giải trình' }).click();
  await expect(page).toHaveURL(/\/nv\/cham-cong\?ngay=2026-10-27$/);
  await expect(page.getByRole('dialog', { name: 'Thứ Ba 27/10/2026' })).toBeVisible();
});

test('Check-out on the desktop', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  await page.getByRole('button', { name: 'Check-out lúc 09:40' }).click();
  const hero = page.getByRole('region', { name: 'Ca hôm nay' });
  await expect(hero).toContainText('Đã check-out');
  await expect(hero).toContainText('ra 09:40');
  await expect(page.getByRole('button', { name: 'Check-out lúc 09:40' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Hôm nay, thứ Tư 28/10: đi làm' }).click();
  await expect(page.getByRole('dialog', { name: 'Thứ Tư 28/10/2026' })).toContainText('09:40');
});

test('requests: tabs, groups and the scroll box', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  const tabs = page.getByRole('tablist', { name: 'Lọc yêu cầu theo trạng thái' });
  await expect(tabs.getByRole('tab')).toHaveText(['Tất cả 4', 'Chờ duyệt 1', 'Đã duyệt 2', 'Từ chối 1']);
  const panel = page.getByRole('tabpanel', { name: 'Danh sách yêu cầu, cuộn để xem thêm' });
  await tabs.getByRole('tab', { name: 'Từ chối 1' }).click();
  await expect(panel.getByRole('link')).toHaveCount(1);
  await expect(panel).toContainText('Tháng 9');
  await expect(panel).not.toContainText('Tháng 10');
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Tất cả 4' })).toHaveAttribute('aria-selected', 'true');
  const box = await panel.evaluate(el => ({
    oy: getComputedStyle(el).overflowY,
    h: el.getBoundingClientRect().height,
    bottom: el.getBoundingClientRect().bottom,
    col: el.closest('.sd-col')!.getBoundingClientRect().bottom
  }));
  expect(box.oy).toBe('auto');
  expect(box.h).toBeGreaterThanOrEqual(288);
  expect(Math.abs(box.bottom - box.col)).toBeLessThanOrEqual(1);
});

test('a request row opens the request drawer and Esc returns focus', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  const row = page.getByRole('link', { name: 'Khai giờ vào 09/09, Từ chối' });
  await row.click();
  await expect(page).toHaveURL(/\/nv\/yeu-cau\?yc=gio-vao-0909$/);
  await expect(page.getByRole('dialog', { name: 'Khai giờ vào 09/09' })).toContainText('Lý do từ chối');
  await page.keyboard.press('Escape');
  await expect(row).toBeFocused();
});

test('Tạo yêu cầu shows the mockup notice', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Chưa có luồng tạo yêu cầu trong bản mockup.' })).toBeVisible();
});

test('a day click closes the menu and opens only the drawer', async ({ page }) => {
  await openDesktop(page, '/nv/toi');
  await page.getByRole('link', { name: 'Thứ Ba 27/10: cần xử lý' }).click();
  await expect(page).toHaveURL(/\/nv\/cham-cong\?ngay=2026-10-27$/);
  await expect(page.getByRole('region', { name: 'Tài khoản của tôi' })).toBeHidden();
  await expect(page.getByRole('dialog')).toHaveCount(1);
});
