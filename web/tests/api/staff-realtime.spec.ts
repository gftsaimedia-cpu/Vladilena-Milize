// Realtime của nhân viên trên BE thật: nhân viên mở /nv/yeu-cau, Admin duyệt đơn qua API → trong 3 giây nhân viên thấy thông báo
// và trạng thái đơn tự đổi mà KHÔNG tải lại trang; đơn của người khác không làm gì cả. Tạo nhân viên mới mỗi lần chạy.
import { expect, request as pwRequest, test, type APIRequestContext } from '@playwright/test';

const ADMIN_USER = process.env.PW_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.PW_ADMIN_PASS || '';
const SUFFIX = Date.now().toString(36);
const PASS = 'PwStaffRt@12345';
const json = { 'Content-Type': 'application/json' };
const vnMonth = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
const addMonth = (ym: string, n: number) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 7);

test.use({ permissions: ['geolocation'], geolocation: { latitude: 10.7769, longitude: 106.7009 } });
test.describe.configure({ mode: 'serial' });

let admin: APIRequestContext;
const users = { a: `pw-srt-a-${SUFFIX}`, b: `pw-srt-b-${SUFFIX}` };
const apis: Record<string, APIRequestContext> = {};

async function makeStaff(username: string, given: string) {
  const created = await admin.post('/api/v2/employees', {
    headers: json,
    data: {
      username,
      password: PASS,
      profile: { familyName: 'Nhân viên', givenName: given },
      account: { username, roles: ['staff'] },
      contract: { status: 'nv', effectiveFrom: `${addMonth(vnMonth(), -2)}-01`, position: { type: 'nv', level: 1 } }
    }
  });
  expect(created.ok(), await created.text()).toBeTruthy();
}

test.beforeAll(async ({ baseURL }) => {
  test.skip(!ADMIN_PASS, 'Đặt PW_ADMIN_PASS để chạy test với BE thật');
  admin = await pwRequest.newContext({ baseURL });
  const login = await admin.post('/api/v2/auth/login', { headers: json, data: { username: ADMIN_USER, password: ADMIN_PASS } });
  expect(login.ok()).toBeTruthy();
  await makeStaff(users.a, `StaffA${SUFFIX}`);
  await makeStaff(users.b, `StaffB${SUFFIX}`);
  for (const u of Object.values(users)) {
    apis[u] = await pwRequest.newContext({ baseURL });
    expect((await apis[u].post('/api/v2/auth/login', { headers: json, data: { username: u, password: PASS } })).ok()).toBeTruthy();
  }
});
test.afterAll(async () => {
  await admin?.dispose();
  for (const a of Object.values(apis)) await a.dispose();
});

async function fileLeave(username: string, offset: number) {
  const ctx = await (await apis[username].get('/api/v2/me/request-context')).json();
  const days = ctx.days.filter((d: any) => d.leaveCounted && d.date > ctx.today);
  const day = days[offset]?.date;
  expect(day, 'không có ngày nghỉ chọn được').toBeTruthy();
  const res = await apis[username].post('/api/v2/me/requests/leave', {
    headers: json,
    data: { leaveType: 'UNPAID', reason: 'Việc riêng', startDate: day, endDate: day }
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()).request.id as string;
}

test('admin approves my request: staff sees a toast and the list changes without reloading; others are not told', async ({ page }) => {
  const own = await fileLeave(users.a, 0);
  const other = await fileLeave(users.b, 0);
  await page.goto('/dang-nhap');
  await page.locator('#lg-user').fill(users.a);
  await page.locator('#lg-pass').fill(PASS);
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/dang-nhap'));
  await page.goto('/nv/yeu-cau');
  await expect(page.getByRole('tab', { name: /^Chờ duyệt/ })).toContainText('1');
  await page.evaluate(() => ((window as any).__noReload = true));
  await page.waitForTimeout(500); // luồng đã nối xong

  // Đơn của người khác được duyệt: không có thông báo nào cho mình.
  expect((await admin.patch(`/api/v2/requests/${other}/review`, { headers: json, data: { action: 'APPROVE' } })).ok()).toBeTruthy();
  await page.waitForTimeout(1200);
  await expect(page.getByText('Đơn của bạn đã được duyệt')).toHaveCount(0);

  // Đơn của mình được duyệt: thông báo và trạng thái đổi trong 3 giây.
  expect((await admin.patch(`/api/v2/requests/${own}/review`, { headers: json, data: { action: 'APPROVE' } })).ok()).toBeTruthy();
  await expect(page.getByText('Đơn của bạn đã được duyệt')).toBeVisible({ timeout: 3000 });
  // Thẻ lọc "Chờ duyệt" đếm lại từ danh sách mới: từ 1 xuống 0, và đơn nằm ở "Đã duyệt".
  await expect(page.getByRole('tab', { name: /^Chờ duyệt/ })).toContainText('0', { timeout: 3000 });
  await expect(page.getByRole('tab', { name: /^Đã duyệt/ })).toContainText('1');
  expect(await page.evaluate(() => (window as any).__noReload)).toBe(true);
});

test('staff stream refuses anonymous callers (401)', async ({ baseURL }) => {
  const anon = await pwRequest.newContext({ baseURL });
  expect((await anon.get('/api/v2/realtime/me')).status()).toBe(401);
  await anon.dispose();
});
