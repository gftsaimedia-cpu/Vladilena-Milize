// Giải trình theo tháng đang xem, trên BE thật: nhân viên vào làm từ hai tháng trước, nên có ngày vắng ở tháng trước và tháng này
// (trong cửa sổ giải trình) và tháng trước nữa (ngoài cửa sổ). Ở máy tính, tháng đang hiện ở cột Chấm công quyết ngày nào hiện
// trong form Giải trình. Tạo một nhân viên thử mới mỗi lần chạy.
import { expect, request as pwRequest, test } from '@playwright/test';

const ADMIN_USER = process.env.PW_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.PW_ADMIN_PASS || '';
const SUFFIX = Date.now().toString(36);
const USER = `pw-xm-${SUFFIX}`;
const PASS = 'PwExplainMonth@12345';
const json = { 'Content-Type': 'application/json' };
const vnMonth = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
const addMonth = (ym: string, n: number) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 7);
const THIS = vnMonth();
const LAST = addMonth(THIS, -1);

test.beforeAll(async ({ baseURL }) => {
  test.skip(!ADMIN_PASS, 'Đặt PW_ADMIN_PASS để chạy test với BE thật');
  const admin = await pwRequest.newContext({ baseURL });
  expect((await admin.post('/api/v2/auth/login', { headers: json, data: { username: ADMIN_USER, password: ADMIN_PASS } })).ok()).toBeTruthy();
  const created = await admin.post('/api/v2/employees', {
    headers: json,
    data: {
      account: { username: USER, password: PASS, roles: ['staff'] },
      profile: { fullName: `Giải Trình ${SUFFIX}` },
      contract: { status: 'nv', effectiveFrom: `${addMonth(THIS, -2)}-01`, position: { type: 'nv', level: 1 } }
    }
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  await admin.dispose();
});

test('máy tính: tháng đang xem ở cột Chấm công quyết ngày hiện trong form Giải trình', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dang-nhap');
  await page.locator('#lg-user').fill(USER);
  await page.locator('#lg-pass').fill(PASS);
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/dang-nhap'));
  await page.goto('/nv/hom-nay');
  // Chờ cột Chấm công hiện tháng này (từ đó trang mới biết tháng đang xem).
  await expect(page.getByText(`Tháng ${Number(THIS.slice(5, 7))}/${THIS.slice(0, 4)}`).first()).toBeVisible();

  const optionDates = async () => {
    const dialog = page.getByRole('dialog', { name: 'Giải trình' });
    const select = dialog.getByLabel('Ngày');
    await expect(select).toBeVisible();
    return select.locator('option:not([value=""])').evaluateAll(os => os.map(o => (o as HTMLOptionElement).value));
  };
  const open = async () => {
    await page.getByRole('button', { name: /Tạo yêu cầu/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Giải trình/ }).click();
  };
  const close = () => page.keyboard.press('Escape');

  // Tháng này (mặc định): chỉ ngày của tháng này.
  await open();
  await expect.poll(async () => (await optionDates()).length).toBeGreaterThan(0);
  expect((await optionDates()).every(d => d.startsWith(THIS))).toBe(true);
  await close();

  // Chuyển sang tháng trước ở cột Chấm công rồi mở lại: chỉ ngày của tháng trước.
  await page.getByRole('button', { name: 'Tháng trước' }).first().click();
  await open();
  await expect.poll(async () => (await optionDates()).length).toBeGreaterThan(0);
  const dates = await optionDates();
  expect(dates.every(d => d.startsWith(LAST)), dates.join(',')).toBe(true);
  await close();

  // Lùi tiếp tới tháng trước nữa (ngoài cửa sổ giải trình): không có ngày nào và ô chọn bị khoá.
  await page.getByRole('button', { name: 'Tháng trước' }).first().click();
  await open();
  const dialog = page.getByRole('dialog', { name: 'Giải trình' });
  await expect(dialog.getByLabel('Ngày')).toBeDisabled();
  await expect(dialog.getByRole('status').filter({ hasText: /không có ngày nào cần giải trình/ })).toBeVisible();
});
