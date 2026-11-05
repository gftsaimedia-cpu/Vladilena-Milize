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

test('the day axis of a night shift puts the middle after midnight', async ({ page }) => {
  await open(page, 'part=day&start=22:00&end=06:00');
  await expect(page.locator('.ds-axis span')).toHaveText(['22:00', '02:00', '06:00']);
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
  await expect(alert).toContainText('Không kết nối được máy chủ.');
  await alert.getByRole('button', { name: 'Thử lại' }).click();
  await expect(page.locator('#retries')).toHaveText('1');
  expect(calls).toEqual([]);
});

test('a load error from a bug shows the plain message, not the code error', async ({ page }) => {
  await open(page, 'part=error&kind=bug');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Máy chủ không trả lời, thử lại sau ít phút.');
  await expect(alert).not.toContainText('Cannot read');
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

// left / width (phần trăm) của một đoạn trên thanh giờ.
const segment = (page: Page, sel: string) =>
  page.locator(sel).evaluate(el => ({ left: parseFloat((el as HTMLElement).style.left), width: parseFloat((el as HTMLElement).style.width) }));

test('the bar of a night shift puts late and worked time on the shift axis', async ({ page }) => {
  await open(page, 'part=day&start=22:00&end=06:00&in=23:00&out=05:00');
  const late = await segment(page, '.ds-late');
  const worked = await segment(page, '.ds-worked');
  expect(late.left).toBeCloseTo(0, 3);
  expect(late.width).toBeCloseTo(12.5, 3);
  expect(worked.left).toBeCloseTo(12.5, 3);
  expect(worked.width).toBeCloseTo(75, 3);
});

test('the bar of a day shift keeps its late and worked parts', async ({ page }) => {
  await open(page, 'part=day&start=08:00&end=17:00&in=08:54&out=17:00');
  const late = await segment(page, '.ds-late');
  const worked = await segment(page, '.ds-worked');
  expect(late.width).toBeCloseTo(10, 3);
  expect(worked.left).toBeCloseTo(10, 3);
  expect(worked.width).toBeCloseTo(90, 3);
});

test('Thử lại that loads puts focus on the heading of the block', async ({ page }) => {
  await open(page, 'part=load&fail=1');
  const again = page.getByRole('alert').getByRole('button', { name: 'Thử lại' });
  await again.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#loads')).toHaveText('2');
  await expect(page.getByRole('heading', { name: 'Tháng 10/2026' })).toBeFocused();
});

test('Thử lại that fails again puts focus on the new Thử lại', async ({ page }) => {
  await open(page, 'part=load&fail=2');
  await page.getByRole('alert').getByRole('button', { name: 'Thử lại' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#loads')).toHaveText('2');
  await expect(page.getByRole('alert').getByRole('button', { name: 'Thử lại' })).toBeFocused();
});

test('a month that fails offers a way back to the month that loaded', async ({ page }) => {
  const calls = await open(page, 'part=load&bad=2026-09');
  await page.getByRole('button', { name: 'Tháng trước' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Không tải được dữ liệu');
  await alert.getByRole('button', { name: 'Quay về tháng 10/2026' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Tháng 10/2026' })).toBeFocused();
  expect(calls).toEqual([]);
});

test('a first load that fails offers only Thử lại', async ({ page }) => {
  await open(page, 'part=load&fail=1');
  const alert = page.getByRole('alert');
  await expect(alert.getByRole('button', { name: 'Thử lại' })).toBeVisible();
  await expect(alert.getByRole('button', { name: /Quay về/ })).toHaveCount(0);
});
