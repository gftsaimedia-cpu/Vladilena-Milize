// App nhân viên trên BE thật (playwright.api.config.ts): Hôm nay, Check-in / Check-out, đổi tháng, báo lỗi tải, đơn từ, thu nhập
// chính thức. Tài khoản admin lấy từ PW_ADMIN_USER / PW_ADMIN_PASS. Mỗi lần chạy tạo một nhân viên thử mới qua API Admin, vào làm
// ngày 01 của hai tháng trước, nên chỉ chạy trên DB thử. Lỗi máy chủ được giả bằng page.route cho đúng một lần gọi.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const ADMIN_USER = process.env.PW_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.PW_ADMIN_PASS || '';
const STAFF_USER = `pw-app-${Date.now().toString(36)}`;
const STAFF_PASS = 'PwApp@12345';
const PHONE = { width: 390, height: 844 };
const json = { 'Content-Type': 'application/json' };

// Tháng theo giờ Việt Nam và nhãn "Tháng 9/2026" như app.
const vnMonth = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
const addMonth = (ym: string, n: number) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 7);
const label = (ym: string) => `Tháng ${Number(ym.slice(5, 7))}/${ym.slice(0, 4)}`;
const THIS = vnMonth();
const START = addMonth(THIS, -2);

async function asAdmin<T>(request: APIRequestContext, fn: () => Promise<T>): Promise<T> {
  const login = await request.post('/api/v2/auth/login', { headers: json, data: { username: ADMIN_USER, password: ADMIN_PASS } });
  expect(login.ok(), 'đăng nhập admin cho fixture').toBeTruthy();
  try {
    return await fn();
  } finally {
    await request.post('/api/v2/auth/logout', { headers: json, data: {} });
  }
}

async function signIn(page: Page) {
  await page.goto('/dang-nhap');
  await page.locator('#lg-user').fill(STAFF_USER);
  await page.locator('#lg-pass').fill(STAFF_PASS);
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await expect(page).toHaveURL(/\/nv\/hom-nay/);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  test.skip(!ADMIN_PASS, 'Đặt PW_ADMIN_PASS để chạy test với BE thật');
  await asAdmin(request, async () => {
    const created = await request.post('/api/v2/employees', {
      headers: json,
      data: {
        username: STAFF_USER,
        password: STAFF_PASS,
        profile: { familyName: 'Nhân viên', givenName: 'App' },
        account: { username: STAFF_USER, roles: ['staff'] },
        contract: { status: 'nv', effectiveFrom: `${START}-01`, position: { type: 'nv', level: 1 } }
      }
    });
    expect(created.ok(), await created.text()).toBeTruthy();
  });
});

test('Hôm nay shows my own name on the phone and on the desktop', async ({ page }) => {
  await signIn(page);
  const { name } = await (await page.request.get('/api/v2/me/profile')).json();
  expect(name).toBeTruthy();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible(); // máy tính: h1 của cột Hôm nay
  await page.setViewportSize(PHONE);
  await page.goto('/nv/hom-nay');
  await expect(page.locator('.home .name')).toHaveText(name);
});

test('a refused check-out shows the server message, then check-out works', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signIn(page);
  const card = page.getByRole('region', { name: 'Ca hôm nay' });
  await card.getByRole('button', { name: /Check-in/ }).click();
  await expect(card).toContainText('Đang trong ca');
  await expect(card.locator('.loc')).toHaveCount(0); // máy chủ chưa gửi kết quả vị trí

  await page.route('**/api/v2/me/punches', route =>
    route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Bảng công ngày đã bị khóa cho kỳ lương', code: 'BAD_PUNCH_INPUT' }) })
  );
  await card.getByRole('button', { name: /Check-out/ }).click();
  await expect(page.getByText('Bảng công ngày đã bị khóa cho kỳ lương')).toBeVisible();
  await expect(card).toContainText('Đang trong ca');
  await expect(card.getByRole('button', { name: /Check-out/ })).toBeEnabled();

  await page.unroute('**/api/v2/me/punches');
  await card.getByRole('button', { name: /Check-out/ }).click();
  await expect(card).toContainText('Đã check-out');
});

test('a failed load says so and Thử lại loads again', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signIn(page);
  let fail = true;
  await page.route('**/api/v2/me/income**', route => (fail ? ((fail = false), route.abort()) : route.continue()));
  await page.goto('/nv/thu-nhap');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Không tải được dữ liệu');
  await alert.getByRole('button', { name: 'Thử lại' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Thu nhập' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('the attendance month goes back to my start month and never past this month', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signIn(page);
  await page.goto('/nv/cham-cong');
  const prev = page.getByRole('button', { name: 'Tháng trước' });
  const next = page.getByRole('button', { name: 'Tháng sau' });
  await expect(page.getByText(label(THIS), { exact: true })).toBeVisible();
  await expect(page.getByText('Kỳ công đang mở')).toBeVisible();
  await expect(next).toBeDisabled();
  await prev.click();
  await expect(page.getByText(label(addMonth(THIS, -1)), { exact: true })).toBeVisible();
  await expect(next).toBeEnabled();
  await prev.click();
  await expect(page.getByText(label(START), { exact: true })).toBeVisible();
  await expect(prev).toBeDisabled();
  await next.click();
  await expect(page.getByText(label(addMonth(THIS, -1)), { exact: true })).toBeVisible();
});

test('income switches month on the phone; the desktop attendance column too', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signIn(page);
  await page.goto('/nv/thu-nhap');
  await expect(page.getByText(label(THIS), { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tháng sau' })).toBeDisabled();
  await page.getByRole('button', { name: 'Tháng trước' }).click();
  await expect(page.getByText(label(addMonth(THIS, -1)), { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/nv/hom-nay');
  const prev = page.getByRole('button', { name: 'Tháng trước' });
  await expect(prev).toHaveCount(1); // chỉ cột Chấm công có nút đổi tháng
  await prev.click();
  await expect(page.getByText(label(addMonth(THIS, -1)), { exact: true })).toBeVisible();
});

test('a request I file shows as waiting, then as cancelled', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signIn(page);
  // Một ngày làm việc tuần sau (bỏ Chủ nhật); giao diện tạo đơn thuộc phiên khác nên nộp qua API của chính mình.
  const day = new Date(Date.now() + 7 * 3600000 + 7 * 86400000);
  if (day.getUTCDay() === 0) day.setUTCDate(day.getUTCDate() + 1);
  const date = day.toISOString().slice(0, 10);
  const filed = await page.request.post('/api/v2/me/requests/leave', {
    headers: json,
    // Nhân viên mới chưa có phép năm: nghỉ việc riêng không lương.
    data: { leaveType: 'PERSONAL_UNPAID', startDate: date, endDate: date, title: 'Nghỉ việc riêng', reason: 'Việc gia đình' }
  });
  expect(filed.ok(), await filed.text()).toBeTruthy();
  const { id } = (await filed.json()).request;
  expect(id).toBeTruthy();

  await page.goto('/nv/yeu-cau');
  const row = page.locator('a, button').filter({ hasText: `Việc riêng không lương ${date.slice(8, 10)}/${date.slice(5, 7)}` });
  await expect(row).toContainText('Chờ duyệt');

  const cancelled = await page.request.patch(`/api/v2/me/requests/${id}/cancel`, { headers: json, data: {} });
  expect(cancelled.ok(), await cancelled.text()).toBeTruthy();
  await page.reload();
  await expect(row).toContainText('Đã huỷ');
});

test('income is official once Admin approves my payslip', async ({ page, request }) => {
  const month = addMonth(THIS, -1);
  await asAdmin(request, async () => {
    const calc = await request.post(`/api/v2/payroll/${month}/calculate`, { headers: json, data: { employeeIds: [STAFF_USER] } });
    expect(calc.ok(), await calc.text()).toBeTruthy();
    const ok = await request.post(`/api/v2/payroll/${month}/${STAFF_USER}/decision`, { headers: json, data: { decision: 'approve' } });
    expect(ok.ok(), await ok.text()).toBeTruthy();
  });
  await page.setViewportSize(PHONE);
  await signIn(page);
  await page.goto('/nv/thu-nhap');
  await expect(page.getByText(label(THIS), { exact: true })).toBeVisible();
  await expect(page.locator('.mon')).toContainText('Tạm tính');
  await page.getByRole('button', { name: 'Tháng trước' }).click();
  await expect(page.getByText(label(month), { exact: true })).toBeVisible();
  await expect(page.locator('.mon')).toContainText('Chính thức');
});
