// Admin tự cập nhật khi có việc mới (BE thật): nhân viên gửi đơn → toast, số chuông và danh sách Yêu cầu đổi không cần tải lại;
// Admin khác thêm nhân sự → màn Nhân sự tự có người mới. Tạo nhân viên thử mới mỗi lần chạy.
import { expect, request as pwRequest, test, type APIRequestContext } from '@playwright/test';
import { freshMonth } from './scenarios/helpers';

const ADMIN_USER = process.env.PW_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.PW_ADMIN_PASS || '';
const SUFFIX = Date.now().toString(36);
const STAFF = `pw-ar-${SUFFIX}`;
const PASS = 'PwAdminRt@12345';
const json = { 'Content-Type': 'application/json' };
const vnMonth = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
const addMonth = (ym: string, n: number) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 7);
// Hộp Thêm nhân sự gửi `profile.name = { familyName, givenName }`; họ là từ đầu, tên là phần còn lại.
const body = (username: string, fullName: string) => ({
  account: { username, password: PASS, roles: ['staff'] },
  profile: { name: { familyName: fullName.split(' ')[0], givenName: fullName.split(' ').slice(1).join(' ') } },
  contract: { status: 'nv', effectiveFrom: `${addMonth(vnMonth(), -2)}-01`, position: { type: 'nv', level: 1 } }
});

let admin: APIRequestContext;
let staff: APIRequestContext;

test.beforeAll(async ({ baseURL }) => {
  test.skip(!ADMIN_PASS, 'Đặt PW_ADMIN_PASS để chạy test với BE thật');
  admin = await pwRequest.newContext({ baseURL });
  expect((await admin.post('/api/v2/auth/login', { headers: json, data: { username: ADMIN_USER, password: ADMIN_PASS } })).ok()).toBeTruthy();
  const created = await admin.post('/api/v2/employees', { headers: json, data: body(STAFF, `Admin Realtime ${SUFFIX}`) });
  expect(created.ok(), await created.text()).toBeTruthy();
  staff = await pwRequest.newContext({ baseURL });
  expect((await staff.post('/api/v2/auth/login', { headers: json, data: { username: STAFF, password: PASS } })).ok()).toBeTruthy();
});
test.afterAll(async () => {
  await admin?.dispose();
  await staff?.dispose();
});

async function signInAdmin(page: import('@playwright/test').Page) {
  await page.goto('/dang-nhap');
  await page.locator('#lg-user').fill(ADMIN_USER);
  await page.locator('#lg-pass').fill(ADMIN_PASS);
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/dang-nhap'));
}
const bellCount = async (page: import('@playwright/test').Page) => {
  const label = (await page.locator('.topbar .bell').getAttribute('aria-label')) ?? '';
  return Number(/(\d+) việc/.exec(label)?.[1] ?? 0);
};

test('a staff request shows up on the admin side within 3 seconds: toast, bell count and the Yêu cầu list', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInAdmin(page);
  const bellLoaded = page.waitForResponse(r => r.url().includes('/overview/pending-count'));
  await page.goto('/admin/yeu-cau');
  await expect(page.getByRole('heading', { level: 1, name: /Yêu cầu/ })).toBeVisible();
  await expect(page.locator('header.topbar .rt')).toHaveAttribute('aria-label', /đang bật/);
  // Đợi chuông tải xong số hiện tại (trên DB đã dùng nhiều thì khác 0) rồi mới lấy mốc.
  await bellLoaded;
  await page.waitForTimeout(300);
  const before = await bellCount(page);
  await page.evaluate(() => ((window as any).__noReload = true));

  const ctx = await (await staff.get('/api/v2/me/request-context')).json();
  const day = ctx.days.find((d: any) => d.leaveCounted && d.date > ctx.today)?.date;
  expect(day, 'cần một ngày nghỉ chọn được').toBeTruthy();
  const filed = await staff.post('/api/v2/me/requests/leave', { headers: json, data: { leaveType: 'UNPAID', reason: 'Việc riêng', startDate: day, endDate: day } });
  expect(filed.ok(), await filed.text()).toBeTruthy();
  const title = (await filed.json()).request.title as string;

  await expect(page.getByText(`Admin Realtime ${SUFFIX} gửi yêu cầu: ${title}`)).toBeVisible({ timeout: 3000 });
  await expect.poll(() => bellCount(page), { timeout: 3000 }).toBe(before + 1);
  await expect(page.getByText(`Admin Realtime ${SUFFIX}`).first()).toBeVisible({ timeout: 3000 });
  expect(await page.evaluate(() => (window as any).__noReload)).toBe(true);
});

test('another admin adds a person: the Nhân sự list gains the row without reloading', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInAdmin(page);
  await page.goto('/admin/nhan-su');
  await expect(page.getByRole('heading', { level: 1, name: /Nhân sự/ })).toBeVisible();
  await expect(page.locator('header.topbar .rt')).toHaveAttribute('aria-label', /đang bật/);
  await page.evaluate(() => ((window as any).__noReload = true));
  const name = `Người Mới ${SUFFIX}`;
  await expect(page.getByText(name)).toHaveCount(0);
  const created = await admin.post('/api/v2/employees', { headers: json, data: body(`pw-new-${SUFFIX}`, name) });
  expect(created.ok(), await created.text()).toBeTruthy();
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 3000 });
  expect(await page.evaluate(() => (window as any).__noReload)).toBe(true);
});

test('another admin locks the month: the period strip on Bảng lương switches without reloading', async ({ page }) => {
  const month = await freshMonth(admin);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInAdmin(page);
  await page.goto(`/admin/bang-luong?thang=${month}`);
  const strip = page.locator('.period');
  await expect(strip.getByRole('button', { name: 'Chốt công' })).toBeVisible();
  await expect(page.locator('header.topbar .rt')).toHaveAttribute('aria-label', /đang bật/);
  await page.evaluate(() => ((window as any).__noReload = true));
  try {
    const lock = await admin.post(`/api/v2/system/periods/${month}/lock`, { headers: json, data: {} });
    expect(lock.ok(), await lock.text()).toBeTruthy();
    await expect(strip.getByRole('button', { name: 'Mở lại công' })).toBeVisible({ timeout: 3000 });
    await expect(strip.getByRole('button', { name: 'Chốt công' })).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__noReload)).toBe(true);
  } finally {
    await admin.post(`/api/v2/system/periods/${month}/unlock`, { headers: json, data: { reason: 'pw-realtime' } });
  }
});
