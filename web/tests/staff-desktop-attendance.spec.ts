// Cột 2 của trang nhân viên máy tính: Chấm công (spec staff-desktop-one-page 4.2). Mock, không gọi /api.
import { expect, test } from '@playwright/test';
import { openDesktop } from './fixtures/staff-desktop';

const col2 = (page: import('@playwright/test').Page) => page.locator('.sd-col').nth(1);

test('column 2 makes no /api request and logs no error', async ({ page }) => {
  const calls = await openDesktop(page, '/nv/cham-cong');
  await expect(col2(page).getByRole('heading', { level: 2, name: 'Chấm công' })).toBeVisible();
  await expect(col2(page).locator('.ls button.ro')).toHaveCount(7);
  expect(calls).toEqual([]);
});

test('column 2 shows the month, tiles and calendar', async ({ page }) => {
  await openDesktop(page, '/nv/cham-cong');
  const c = col2(page);
  await expect(c.getByRole('heading', { level: 2, name: 'Chấm công' })).toBeVisible();
  for (const t of ['Ca HC 08:00–17:00 · thứ Hai – thứ Bảy', 'Tháng 10/2026', 'Kỳ công đang mở']) await expect(c).toContainText(t);
  await expect(c.getByRole('button', { name: 'Tháng trước' })).toBeDisabled();
  await expect(c.getByRole('button', { name: 'Tháng sau' })).toBeDisabled();
  const tiles = c.getByRole('group', { name: 'Chỉ số tháng 10' });
  for (const t of ['21 / 26', 'Ngày công', 'Lần đi muộn', 'Ngày nghỉ có lương']) await expect(tiles).toContainText(t);
  await expect(c.getByRole('region', { name: 'Lịch tháng 10' }).locator('.dn')).toHaveCount(31);
});

test('Gần đây lists seven days', async ({ page }) => {
  await openDesktop(page, '/nv/cham-cong');
  const rows = col2(page).locator('.ls button.ro');
  await expect(rows).toHaveCount(7);
  await expect(rows.nth(0)).toContainText('Thứ Tư 28/10');
  await expect(rows.nth(0)).toContainText('07:59 – …');
  await expect(rows.nth(5)).toContainText('Thứ Năm 22/10');
  await expect(rows.nth(5)).toContainText('07:59 – 17:08');
  await expect(rows.nth(6)).toContainText('Thứ Tư 21/10');
  await expect(rows.nth(6)).toContainText('07:57 – 17:03');
});

test('Gần đây card stretches to the bottom of the column', async ({ page }) => {
  await openDesktop(page, '/nv/cham-cong');
  const box = await col2(page).locator('.sd-grow > .card').evaluate(el => ({
    bottom: el.getBoundingClientRect().bottom,
    col: el.closest('.sd-col')!.getBoundingClientRect().bottom
  }));
  expect(Math.abs(box.bottom - box.col)).toBeLessThanOrEqual(1);
});

test('a calendar day opens the drawer and Esc returns focus', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  const day = col2(page).getByRole('button', { name: 'Thứ Hai 26/10: đi làm' });
  await day.click();
  await expect(page).toHaveURL(/\/nv\/cham-cong\?ngay=2026-10-26$/);
  const d = page.getByRole('dialog', { name: 'Thứ Hai 26/10/2026' });
  for (const t of ['Đi làm', '07:56', '17:10']) await expect(d).toContainText(t);
  await page.keyboard.press('Escape');
  await expect(day).toBeFocused();
});

test('a recent row opens its day', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  const row = col2(page).getByRole('button', { name: 'Thứ Ba 27/10 08:12 – ?, Cần xử lý' });
  await row.click();
  await expect(page).toHaveURL(/\/nv\/cham-cong\?ngay=2026-10-27$/);
  await expect(page.getByRole('dialog', { name: 'Thứ Ba 27/10/2026' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(row).toBeFocused();
});

test('Check-out in column 1 updates Gần đây', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  await page.getByRole('button', { name: 'Check-out lúc 09:40' }).click();
  await expect(col2(page).locator('.ls button.ro').nth(0)).toContainText('07:59 – 09:40');
});
