// Nhóm 3 — Luồng SSE (/api/v2/realtime/stream) trên trình duyệt thật: sự kiện tới ngay (ô nháy, thông báo), luồng bị cắt thì chuyển
// sang hỏi lại mỗi 30 giây (đồng hồ giả của Playwright) rồi nối lại và tải lại, nhân viên không mở luồng, admin bị khoá thì luồng đóng.
import { DESKTOP, OFFICE, PHONE, adminApi, apiAs, createStaff, expect, json, setLocked, signIn, signInAdmin, skipWithoutAdmin, test, vnToday, type Staff } from './helpers';
import { REST_DAY_REASON, REST_DAY_TODAY } from '../rest-day';
import type { APIRequestContext, Page } from '@playwright/test';

test.use({ permissions: ['geolocation'], geolocation: OFFICE });

let admin: APIRequestContext;
test.beforeAll(async ({ baseURL }) => {
  skipWithoutAdmin();
  admin = await adminApi(baseURL!);
});
test.afterAll(async () => {
  await admin?.dispose();
});

const dot = (page: Page) => page.locator('header.topbar .rt');
const punch = (api: APIRequestContext, kind: 'IN' | 'OUT') =>
  api.post('/api/v2/me/punches', { headers: json, data: { kind, lat: OFFICE.latitude, lng: OFFICE.longitude, accuracyM: 5 } });

/** Đếm lời gọi lưới chấm công của admin. */
function countWeek(page: Page) {
  const c = { n: 0 };
  page.on('request', r => {
    if (new URL(r.url()).pathname === '/api/v2/attendance/week') c.n++;
  });
  return c;
}

test('check-in rồi check-out của nhân viên: admin thấy thông báo và ô nháy ngay, không tải lại trang', async ({ page, baseURL }) => {
  test.skip(REST_DAY_TODAY, REST_DAY_REASON);
  const s = await createStaff(admin, baseURL!, 'sse1');
  const own = await apiAs(baseURL!, s.username, s.password);
  await page.setViewportSize(DESKTOP);
  await signInAdmin(page);
  await page.goto('/admin/cham-cong');
  await expect(page.getByRole('region', { name: 'Lưới chấm công' })).toBeVisible();
  await expect(dot(page)).toHaveAttribute('aria-label', /đang bật/);
  await page.evaluate(() => ((window as any).__noReload = true));

  expect((await punch(own, 'IN')).ok()).toBeTruthy();
  await expect(page.getByText(`${s.name} vừa check-in`)).toBeVisible({ timeout: 3000 });
  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: s.name }) });
  await expect(row).toBeVisible({ timeout: 3000 });
  // Ô của hôm nay nháy (lớp flash) rồi tắt sau ~1,5 giây.
  await expect(row.locator('.flash')).toHaveCount(1, { timeout: 3000 });
  await expect(row.locator('.flash')).toHaveCount(0, { timeout: 4000 });

  await page.waitForTimeout(1100); // nhân viên chỉ được ra ca sau một khoảng
  const out = await punch(own, 'OUT');
  if (out.ok()) await expect(page.getByText(`${s.name} vừa check-out`)).toBeVisible({ timeout: 3000 });
  expect(await page.evaluate(() => (window as any).__noReload)).toBe(true);
  await own.dispose();
});

test('admin chấm công hộ: sự kiện cũng tới (nguồn admin)', async ({ page, baseURL }) => {
  test.skip(REST_DAY_TODAY, REST_DAY_REASON);
  const s = await createStaff(admin, baseURL!, 'sse2');
  await page.setViewportSize(DESKTOP);
  await signInAdmin(page);
  await page.goto('/admin/cham-cong');
  await expect(dot(page)).toHaveAttribute('aria-label', /đang bật/);
  const res = await admin.post('/api/v2/attendance/punches', { headers: json, data: { employeeId: s.id, type: 'IN', punchedAt: `${vnToday()}T08:05:00+07:00` } });
  expect(res.ok(), await res.text()).toBeTruthy();
  await expect(page.getByRole('link', { name: s.name })).toBeVisible({ timeout: 3000 });
});

test('luồng bị cắt: chuyển sang hỏi lại 30 giây (đồng hồ giả), nối lại thì tải lại và đèn xanh trở lại', async ({ page, baseURL }) => {
  test.skip(REST_DAY_TODAY, REST_DAY_REASON);
  await page.setViewportSize(DESKTOP);
  // Luồng giả: lần nối đầu báo `ready` rồi đóng ngay (mô phỏng bị cắt); mọi lần nối sau trả 500 cho tới khi `heal`.
  let healed = false;
  let streamCalls = 0;
  await page.route('**/api/v2/realtime/stream', route => {
    streamCalls++;
    if (healed) return route.continue();
    if (streamCalls === 1) {
      return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }, body: 'retry: 100\nevent: ready\ndata: {}\n\n' });
    }
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' });
  });
  await page.clock.install();
  await signInAdmin(page);
  const week = countWeek(page);
  await page.goto('/admin/cham-cong');
  await expect(page.getByRole('region', { name: 'Lưới chấm công' })).toBeVisible();
  await expect(dot(page)).toHaveAttribute('aria-label', /mất kết nối/);
  const before = week.n;

  // Chưa đủ 30 giây: không hỏi lại.
  await page.clock.runFor(20_000);
  expect(week.n).toBe(before);
  await page.clock.runFor(11_000);
  await expect.poll(() => week.n, { timeout: 5000 }).toBeGreaterThan(before);
  const afterFirst = week.n;
  await page.clock.runFor(30_000);
  await expect.poll(() => week.n, { timeout: 5000 }).toBeGreaterThan(afterFirst);

  // Luồng hồi lại: lần nối kế tiếp thành công → đèn xanh, tải lại một lần.
  healed = true;
  const atHeal = week.n;
  await page.clock.runFor(30_000);
  await expect(dot(page)).toHaveAttribute('aria-label', /đang bật/, { timeout: 5000 });
  await expect.poll(() => week.n, { timeout: 5000 }).toBeGreaterThan(atHeal);
  // Sau khi nối lại, sự kiện mới tới thẳng, không cần hỏi lại.
  const s = await createStaff(admin, baseURL!, 'sse3');
  const own = await apiAs(baseURL!, s.username, s.password);
  await punch(own, 'IN');
  await page.clock.runFor(1000);
  await expect(page.getByText(`${s.name} vừa check-in`)).toBeVisible({ timeout: 5000 });
  await own.dispose();
});

test('hỏi lại định kỳ cho thấy dữ liệu mới dù luồng chết (không cần sự kiện)', async ({ page, baseURL }) => {
  await page.setViewportSize(DESKTOP);
  await page.route('**/api/v2/realtime/stream', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' }));
  await page.clock.install();
  await signInAdmin(page);
  await page.goto('/admin/cham-cong');
  await expect(page.getByRole('region', { name: 'Lưới chấm công' })).toBeVisible();
  const s = await createStaff(admin, baseURL!, 'sse4');
  await expect(page.getByRole('link', { name: s.name })).toHaveCount(0);
  await page.clock.runFor(31_000);
  await expect(page.getByRole('link', { name: s.name })).toBeVisible({ timeout: 5000 });
});

test('nhân viên không mở luồng realtime (điện thoại và máy tính)', async ({ page, baseURL }) => {
  const s = await createStaff(admin, baseURL!, 'sse5');
  const streams: string[] = [];
  page.on('request', r => r.url().includes('/realtime/stream') && streams.push(r.url()));
  await page.setViewportSize(PHONE);
  await signIn(page, s.username, s.password);
  for (const p of ['/nv/hom-nay', '/nv/cham-cong', '/nv/yeu-cau', '/nv/thu-nhap']) await page.goto(p);
  await page.setViewportSize(DESKTOP);
  await page.goto('/nv/hom-nay');
  await page.waitForTimeout(1200);
  expect(streams).toEqual([]);
});

test('admin bị khoá khi đang mở Chấm công: luồng đóng, lần hỏi kế tiếp đưa về đăng nhập', async ({ page, baseURL }) => {
  // Một admin thứ hai (nâng vai trò) để có thể khoá mà không khoá chính tài khoản fixture.
  const a2 = await createStaff(admin, baseURL!, 'sse6');
  const up = await admin.put(`/api/v2/employees/${a2.username}`, { headers: json, data: { account: { roles: ['admin'] } } });
  expect(up.ok(), await up.text()).toBeTruthy();
  await page.setViewportSize(DESKTOP);
  await page.clock.install();
  await signIn(page, a2.username, a2.password);
  await page.goto('/admin/cham-cong');
  await expect(dot(page)).toHaveAttribute('aria-label', /đang bật/);
  await setLocked(admin, a2.username, true);
  // Sự kiện kế tiếp làm BE kiểm lại phiên và đóng luồng.
  const s = await createStaff(admin, baseURL!, 'sse7');
  const own = await apiAs(baseURL!, s.username, s.password);
  await punch(own, 'IN');
  await expect(dot(page)).toHaveAttribute('aria-label', /mất kết nối|đang kết nối/, { timeout: 8000 });
  // Trình duyệt tự nối lại sau ~3 giây (retry: 3000) và nhận 401 → bỏ cuộc, chuyển sang hỏi lại 30 giây.
  await page.waitForTimeout(4500);
  await page.clock.runFor(31_000);
  await expect(page).toHaveURL(/dang-nhap/, { timeout: 8000 });
  await expect(page.getByText(/Phiên đăng nhập đã hết hạn/)).toBeVisible();
  await own.dispose();
});
void ({} as Staff);
