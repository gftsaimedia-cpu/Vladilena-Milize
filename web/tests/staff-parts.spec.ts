import { expect, test, type Page } from '@playwright/test';

// Các phần dùng chung của app nhân viên gắn riêng (fixtures/staff-parts.html) với dữ liệu tự dựng: không page.route, không gọi /api.
const PARTS = '/tests/fixtures/staff-parts.html';

async function open(page: Page, query: string): Promise<string[]> {
  const calls: string[] = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api')) calls.push(`${req.method()} ${url.pathname}`);
  });
  page.on('pageerror', err => calls.push(`pageerror: ${err.message}`));
  await page.goto(`${PARTS}?${query}`);
  return calls;
}

test('the day axis follows the shift of that day', async ({ page }) => {
  const calls = await open(page, 'part=day&start=06:00&end=14:00');
  await expect(page.locator('.ds-axis span')).toHaveText(['06:00', '10:00', '14:00']);
  expect(calls).toEqual([]);
});

test('the day axis keeps 12:30 in the middle of an 08:00–17:00 shift', async ({ page }) => {
  await open(page, 'part=day&start=08:00&end=17:00');
  await expect(page.locator('.ds-axis span')).toHaveText(['08:00', '12:30', '17:00']);
});

test('the month switch only offers months inside the range', async ({ page }) => {
  const calls = await open(page, 'part=month&prev=2026-09&next=');
  const prev = page.getByRole('button', { name: 'Tháng trước' });
  const next = page.getByRole('button', { name: 'Tháng sau' });
  await expect(prev).toBeEnabled();
  await expect(next).toBeDisabled();
  await prev.click();
  await expect(page.locator('#went')).toHaveText('2026-09');
  expect(calls).toEqual([]);
});

test('the month switch with no neighbours keeps both buttons off', async ({ page }) => {
  await open(page, 'part=month');
  await expect(page.getByRole('button', { name: 'Tháng trước' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Tháng sau' })).toBeDisabled();
});

test('a load error says what failed and offers a retry', async ({ page }) => {
  const calls = await open(page, 'part=error');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Không tải được dữ liệu');
  await expect(alert).toContainText('Mất kết nối tới máy chủ');
  await alert.getByRole('button', { name: 'Thử lại' }).click();
  await expect(page.locator('#retries')).toHaveText('1');
  expect(calls).toEqual([]);
});

test('the shift card has no location line while the server sends none', async ({ page }) => {
  const calls = await open(page, 'part=shift');
  await expect(page.getByRole('button', { name: /Check-out/ })).toBeVisible();
  await expect(page.locator('.loc')).toHaveCount(0);
  expect(calls).toEqual([]);
});

test('the shift card shows the location line when there is one', async ({ page }) => {
  await open(page, `part=shift&location=${encodeURIComponent('Đúng vị trí văn phòng GFT')}`);
  await expect(page.locator('.loc')).toHaveText('Đúng vị trí văn phòng GFT');
});
