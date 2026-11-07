// Realtime trên BE thật (playwright.api.config.ts): admin mở Chấm công, nhân viên chấm công qua API → trong 3 giây admin thấy
// thông báo và lưới tự tải lại (dòng của nhân viên mới xuất hiện) mà KHÔNG tải lại trang. Nhân viên không mở được luồng (403).
// Tạo một nhân viên thử mới mỗi lần chạy, nên chỉ chạy trên DB thử.
import { expect, request as pwRequest, test, type APIRequestContext } from '@playwright/test';
import { REST_DAY_REASON, REST_DAY_TODAY } from './rest-day';

const ADMIN_USER = process.env.PW_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.PW_ADMIN_PASS || '';
const SUFFIX = Date.now().toString(36);
const STAFF_USER = `pw-rt-${SUFFIX}`;
const STAFF_PASS = 'PwRealtime@12345';
const GIVEN = `Realtime${SUFFIX}`;
const json = { 'Content-Type': 'application/json' };
const vnMonth = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
const addMonth = (ym: string, n: number) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 7);

test.use({ permissions: ['geolocation'], geolocation: { latitude: 10.7769, longitude: 106.7009 } });
test.describe.configure({ mode: 'serial' });

let staffApi: APIRequestContext;

test.beforeAll(async ({ baseURL }) => {
  test.skip(!ADMIN_PASS, 'Đặt PW_ADMIN_PASS để chạy test với BE thật');
  const admin = await pwRequest.newContext({ baseURL });
  const login = await admin.post('/api/v2/auth/login', { headers: json, data: { username: ADMIN_USER, password: ADMIN_PASS } });
  expect(login.ok(), 'đăng nhập admin cho fixture').toBeTruthy();
  const created = await admin.post('/api/v2/employees', {
    headers: json,
    data: {
      username: STAFF_USER,
      password: STAFF_PASS,
      profile: { familyName: 'Nhân viên', givenName: GIVEN },
      account: { username: STAFF_USER, roles: ['staff'] },
      contract: { status: 'nv', effectiveFrom: `${addMonth(vnMonth(), -2)}-01`, position: { type: 'nv', level: 1 } }
    }
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  await admin.dispose();
  staffApi = await pwRequest.newContext({ baseURL });
  const staff = await staffApi.post('/api/v2/auth/login', { headers: json, data: { username: STAFF_USER, password: STAFF_PASS } });
  expect(staff.ok(), 'đăng nhập nhân viên').toBeTruthy();
});

test.afterAll(async () => {
  await staffApi?.dispose();
});

test('staff cannot open the stream; anonymous gets 401', async ({ baseURL }) => {
  expect((await staffApi.get('/api/v2/realtime/stream')).status()).toBe(403);
  const anon = await pwRequest.newContext({ baseURL });
  expect((await anon.get('/api/v2/realtime/stream')).status()).toBe(401);
  await anon.dispose();
});

test('a punch by staff shows up on the admin attendance grid within 3 seconds without reloading', async ({ page }) => {
  test.skip(REST_DAY_TODAY, REST_DAY_REASON);
  await page.goto('/dang-nhap');
  await page.locator('#lg-user').fill(ADMIN_USER);
  await page.locator('#lg-pass').fill(ADMIN_PASS);
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/dang-nhap')); // đợi đăng nhập xong rồi mới đi tiếp, goto ngay sẽ huỷ lời gọi đăng nhập
  await page.goto('/admin/cham-cong');
  await expect(page.getByRole('region', { name: 'Lưới chấm công' })).toBeVisible();
  await expect(page.locator('header.topbar .rt')).toHaveAttribute('aria-label', /đang bật/);
  // Mốc: trang không được tải lại sau đây.
  await page.evaluate(() => ((window as any).__noReload = true));

  const me = await (await staffApi.get('/api/v2/me/profile')).json();
  const punch = await staffApi.post('/api/v2/me/punches', {
    headers: json,
    data: { kind: 'IN', lat: 10.7769, lng: 106.7009, accuracyM: 5 }
  });
  expect(punch.ok(), await punch.text()).toBeTruthy();

  await expect(page.getByText(`${me.name} vừa check-in`)).toBeVisible({ timeout: 3000 });
  // Nhân viên tạo sau khi mở trang: dòng của họ chỉ xuất hiện nếu lưới tự tải lại.
  await expect(page.getByRole('link', { name: me.name })).toBeVisible({ timeout: 3000 });
  expect(await page.evaluate(() => (window as any).__noReload)).toBe(true);
});
