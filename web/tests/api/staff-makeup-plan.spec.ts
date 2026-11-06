// Form Nghỉ có làm bù trên BE thật: số giờ đã xếp, giờ chọn được và chỉnh dòng đều do BE tính
// (POST /me/requests/leave-with-makeup/plan); form chỉ hiện. Tạo một nhân viên mới mỗi lần chạy.
import { expect, request as pwRequest, test, type APIRequestContext } from '@playwright/test';

const ADMIN_USER = process.env.PW_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.PW_ADMIN_PASS || '';
const SUFFIX = Date.now().toString(36);
const USER = `pw-mk-${SUFFIX}`;
const PASS = 'PwMakeup@12345';
const json = { 'Content-Type': 'application/json' };
const vnMonth = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
const addMonth = (ym: string, n: number) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 7);

let admin: APIRequestContext;
test.beforeAll(async ({ baseURL }) => {
  test.skip(!ADMIN_PASS, 'Đặt PW_ADMIN_PASS để chạy test với BE thật');
  admin = await pwRequest.newContext({ baseURL });
  expect((await admin.post('/api/v2/auth/login', { headers: json, data: { username: ADMIN_USER, password: ADMIN_PASS } })).ok()).toBeTruthy();
  const created = await admin.post('/api/v2/employees', {
    headers: json,
    data: {
      username: USER,
      password: PASS,
      profile: { familyName: 'Nhân viên', givenName: `Makeup${SUFFIX}` },
      account: { username: USER, roles: ['staff'] },
      contract: { status: 'nv', effectiveFrom: `${addMonth(vnMonth(), -2)}-01`, position: { type: 'nv', level: 1 } }
    }
  });
  expect(created.ok(), await created.text()).toBeTruthy();
});
test.afterAll(async () => admin?.dispose());

test('makeup form: the counter, row choices and the Thêm khung bù button follow what the BE plan says', async ({ page }) => {
  const plans: unknown[] = [];
  page.on('response', async r => {
    if (r.url().endsWith('/me/requests/leave-with-makeup/plan')) plans.push(await r.json());
  });
  await page.goto('/dang-nhap');
  await page.locator('#lg-user').fill(USER);
  await page.locator('#lg-pass').fill(PASS);
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/dang-nhap'));
  await page.goto('/nv/yeu-cau?tao=menu');
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Nghỉ có làm bù', { exact: true }).click();
  await dialog.getByLabel('Từ ngày').selectOption({ index: 1 });
  await expect(dialog.getByText(/Đã xếp 0 \/ 8 giờ/)).toBeVisible();
  const add = dialog.getByRole('button', { name: 'Thêm khung bù' });
  await expect(add).toBeEnabled();
  await dialog.getByLabel('Ngày bù, khung 1').selectOption({ index: 1 });
  const from = dialog.getByLabel('Từ giờ, khung 1');
  await from.selectOption({ index: 1 });
  // BE chọn sẵn giờ kết thúc xa nhất (tối đa 8 giờ còn thiếu): đã xếp tăng và đủ 8 giờ thì hết thêm dòng.
  await expect(dialog.getByLabel('Đến giờ, khung 1')).not.toHaveValue('');
  await expect(dialog.getByText(/Đã xếp [1-8] \/ 8 giờ/)).toBeVisible();
  expect(plans.length).toBeGreaterThanOrEqual(3);
  const last = plans[plans.length - 1] as any;
  expect(last.requiredMinutes).toBe(480);
  expect(last.plannedMinutes).toBeGreaterThan(0);
  if (last.plannedMinutes >= last.requiredMinutes) await expect(add).toBeDisabled();
  else await expect(add).toBeEnabled();
});
