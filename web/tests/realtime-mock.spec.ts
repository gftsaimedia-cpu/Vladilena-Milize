import { expect, test, type Page } from '@playwright/test';
import { inApp } from './fixtures/in-app';

// Realtime trên dữ liệu giả: mockRealtime (src/mock/realtime.ts) thay cho SSE, không dùng mạng.
// Số lần tải đếm bằng window.__mockCalls (mock/respond.ts).
const R = `const { mockRealtime: R } = await import('/src/mock/realtime.ts');`;
const PUNCH = {
  type: 'attendance.punched',
  username: 'hoang-minh-duc',
  name: 'Hoàng Minh Đức',
  workDate: '2026-10-28',
  direction: 'IN',
  at: '2026-10-28T01:02:00.000Z',
  time: '08:02',
  source: 'self'
};
const emit = (page: Page, ev: object) => inApp(page, `${R} R.emit(${JSON.stringify(ev)});`);
const calls = (page: Page) => page.evaluate(() => (window).__mockCalls as number);
const settle = (page: Page) => page.waitForTimeout(600);

async function open(page: Page, path = '/admin/cham-cong', ready: string | RegExp = 'Lưới chấm công') {
  await page.goto(path);
  await expect(page.getByRole('region', { name: ready })).toBeVisible();
  await settle(page);
  await page.evaluate(() => ((window).__mockCalls = 0));
}

test('punched event: toast, grid reloads, cell flashes then stops', async ({ page }) => {
  await open(page);
  await emit(page, PUNCH);
  await expect(page.getByText('Hoàng Minh Đức vừa check-in 08:02')).toBeVisible();
  await expect.poll(() => calls(page)).toBeGreaterThan(0);
  const cell = page.locator('button.pill.flash[aria-label^="Hoàng Minh Đức, "]');
  await expect(cell).toHaveCount(1);
  await expect(cell).toHaveCount(0, { timeout: 4000 });
  await emit(page, { ...PUNCH, direction: 'OUT', time: '17:30' });
  await expect(page.getByText('Hoàng Minh Đức vừa check-out 17:30')).toBeVisible();
});

test('burst of events collapses into one reload', async ({ page }) => {
  await open(page);
  await emit(page, PUNCH);
  await expect.poll(() => calls(page)).toBeGreaterThan(0);
  const one = await calls(page);
  await page.evaluate(() => ((window).__mockCalls = 0));
  for (let i = 0; i < 4; i++) await emit(page, { type: 'attendance.changed', username: 'hoang-minh-duc', workDate: '2026-10-28' });
  await settle(page);
  expect(await calls(page)).toBe(one);
});

test('first ready does not reload; ready after reconnect does', async ({ page }) => {
  await open(page);
  expect(await calls(page)).toBe(0);
  await inApp(page, `${R} R.fail(); R.ready();`);
  await expect.poll(() => calls(page)).toBeGreaterThan(0);
});

test('status dot follows the connection', async ({ page }) => {
  await open(page);
  const dot = page.locator('header.topbar .rt');
  await expect(dot).toHaveAttribute('aria-label', 'Cập nhật trực tiếp: đang bật');
  await inApp(page, `${R} R.fail();`);
  await expect(dot).toHaveAttribute('aria-label', 'Cập nhật trực tiếp: mất kết nối');
  await inApp(page, `${R} R.ready();`);
  await expect(dot).toHaveAttribute('aria-label', 'Cập nhật trực tiếp: đang bật');
});

test('refused stream falls back to polling every 30 seconds and retries in background', async ({ page }) => {
  await page.clock.install();
  await open(page);
  await inApp(page, `${R} R.refuse(true); R.fail(true);`);
  await expect(page.locator('header.topbar .rt')).toHaveAttribute('aria-label', /mất kết nối/);
  await page.clock.runFor(29_000);
  expect(await calls(page)).toBe(0);
  await page.clock.runFor(2_000);
  await expect.poll(() => calls(page)).toBeGreaterThan(0);
  expect(await inApp<number>(page, `${R} return R.opened;`)).toBeGreaterThanOrEqual(2);
  // BE nối lại được: ngừng hỏi định kỳ, tải lại một lần vì `ready` sau khi nối lại
  await inApp(page, `${R} R.refuse(false);`);
  await page.clock.runFor(31_000);
  await expect(page.locator('header.topbar .rt')).toHaveAttribute('aria-label', /đang bật/);
});

test('overview reloads on events too', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  await expect(page.getByRole('heading', { name: 'Tổng quan' })).toBeVisible();
  await settle(page);
  await page.evaluate(() => ((window).__mockCalls = 0));
  await emit(page, PUNCH);
  await expect.poll(() => calls(page)).toBeGreaterThan(0);
});

test('employee profile reloads only for the person being viewed', async ({ page }) => {
  await open(page, '/admin/cham-cong/nhan-vien/hoang-minh-duc', /^Các ngày tháng/);
  await emit(page, { ...PUNCH, username: 'nguoi-khac' });
  await settle(page);
  expect(await calls(page)).toBe(0);
  await emit(page, PUNCH);
  await expect.poll(() => calls(page)).toBeGreaterThan(0);
});

test('staff session never opens the stream', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('aicb.mock.session', 'nhanvien'));
  await page.goto('/nv/hom-nay');
  await expect(page).toHaveURL(/\/nv\//);
  await settle(page);
  expect(await inApp<number>(page, `${R} return R.opened;`)).toBe(0);
});

test('admin opens exactly one stream and closes it on sign-out', async ({ page }) => {
  await open(page);
  expect(await inApp<number>(page, `${R} return R.opened;`)).toBe(1);
  await page.locator('#admin-navigation button.me').click();
  await page.getByRole('menuitem', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/dang-nhap/);
  expect(await inApp<number>(page, `${R} return R.sources.length;`)).toBe(0);
});
