// Mảng staff, phần đăng nhập và quyền: /dang-nhap, tài khoản khoá, giới hạn sai mật khẩu, đăng xuất, đổi mật khẩu
// (PUT /api/v2/auth/password) ở /nv/toi, người chưa đăng nhập và nhân viên mở URL hay gọi route Admin.
// Luật (a) lấy từ spec docs/superpowers/specs/2026-11-05-fe-be-auth-foundation-design.md mục 5–6.
// Chạy qua `npm run demo -- test staff`. Bảng tình huống, lỗi và câu hỏi: docs/demo-db/staff.md.
import { expect, test } from '@playwright/test';
import { ADMIN, demoReadyFor, passwordOf, signIn } from './fixtures/demo';
import { anonymous, fillLogin, json, sessionOf, tryLogin, watchPage } from './demo-staff-support';

test.skip(!demoReadyFor('staff'), 'Chạy qua npm run demo -- test staff');

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };
const WRONG = 'Sai tên đăng nhập hoặc mật khẩu';
const LOCKED = 'Tài khoản đã bị tạm khóa';

/** Các URL Admin của mảng staff. */
const ADMIN_URLS = [
  '/admin/nhan-su',
  '/admin/cai-dat/che-do',
  '/admin/cai-dat/che-do/nhan-vien',
  '/admin/cai-dat/chuc-vu-bac',
  '/admin/cai-dat/phan-quyen',
  '/admin/cai-dat/phan-quyen/tai-khoan',
  '/admin/cai-dat/phan-quyen/xu-ly-yeu-cau',
  '/admin/cai-dat/tat-ca',
  '/admin/cai-dat/nhat-ky'
];

/** Các route Admin của mảng staff: [phương thức, đường dẫn, thân]. */
const ADMIN_ROUTES: Array<[string, string, unknown?]> = [
  ['GET', '/api/v2/employees'],
  ['GET', '/api/v2/employees/ns-an'],
  ['POST', '/api/v2/employees', { username: 'ns-chen', password: 'Chen@12345' }],
  ['PUT', '/api/v2/employees/ns-an', { profile: { dependants: 3 } }],
  ['DELETE', '/api/v2/employees/ns-an'],
  ['GET', '/api/v2/employees/meta/positions'],
  ['GET', '/api/v2/employees/meta/shifts'],
  ['GET', '/api/v2/roles'],
  ['GET', '/api/roles'],
  ['PUT', '/api/v2/positions', { effectiveMonth: '2099-01', items: [] }],
  ['PUT', '/api/v2/positions/nv/levels/1', { effectiveMonth: '2099-01', expectedRev: 0, changes: {} }],
  ['POST', '/api/v2/positions/nv/levels', { effectiveMonth: '2099-01', level: 9, values: {} }],
  ['GET', '/api/v2/system/settings'],
  ['PUT', '/api/v2/system/settings/demo_staff_probe', { value: '"x"' }],
  ['GET', '/api/v2/system/periods'],
  ['GET', '/api/v2/system/audit'],
  ['GET', '/api/v2/system/audit/verify']
];

// ---------- Đăng nhập ----------

test('a wrong password and an unknown username give the same message and stay on the login page', async ({ page }) => {
  const w = watchPage(page);
  w.allow(/\/api\/v2\/auth\/login$/, 401);
  await fillLogin(page, 'ns-an', 'sai-mat-khau-1');
  await expect(page.getByRole('alert')).toHaveText(WRONG);
  await expect(page).toHaveURL(/\/dang-nhap/);
  await fillLogin(page, 'ns-khong-co-ai', 'bat-ky-123');
  await expect(page.getByRole('alert')).toHaveText(WRONG);
  await expect(page).toHaveURL(/\/dang-nhap/);
  w.check();
});

test('a locked or resigned account: right password says locked, wrong password says the usual message', async ({ page }) => {
  const w = watchPage(page);
  w.allow(/\/api\/v2\/auth\/login$/, 403);
  await fillLogin(page, 'ns-khoa', passwordOf('ns-khoa'));
  await expect(page.getByRole('alert')).toHaveText(LOCKED);
  await expect(page).toHaveURL(/\/dang-nhap/);
  w.check();

  const anon = await anonymous();
  expect(await tryLogin(anon, 'ns-khoa', 'sai-mat-khau-2')).toMatchObject({ status: 401, body: { code: 'INVALID_CREDENTIALS' } });
  expect(await tryLogin(anon, 'ns-giang', passwordOf('ns-giang'))).toMatchObject({ status: 403, body: { code: 'ACCOUNT_LOCKED' } });
  await anon.dispose();
});

test('five wrong passwords block that name for a while, other names still sign in', async () => {
  const anon = await anonymous();
  for (let i = 1; i <= 5; i++) expect((await tryLogin(anon, 'ns-sai', `sai-${i}`)).status, `lần sai ${i}`).toBe(401);
  const blocked = await tryLogin(anon, 'ns-sai', passwordOf('ns-sai'));
  expect(blocked.status).toBe(429);
  expect(blocked.body).toMatchObject({ code: 'TOO_MANY_ATTEMPTS' });
  expect(Number(blocked.retryAfter)).toBeGreaterThan(0);
  expect(Number(blocked.retryAfter)).toBeLessThanOrEqual(15 * 60);
  expect((await tryLogin(anon, 'ns-an', passwordOf('ns-an'))).ok).toBe(true);
  await anon.dispose();
});

test('the username is trimmed and lower-cased before sign-in', async ({ page }) => {
  await fillLogin(page, '  NS-AN  ', passwordOf('ns-an'));
  await expect(page).toHaveURL(/\/nv\/hom-nay/);
});

test('the login button is not offered while a field is empty', async ({ page }) => {
  test.fail(true, 'BUG-staff-3: nút Đăng nhập luôn bật; ô trống thì bấm xong mới báo "Nhập tên đăng nhập và mật khẩu."');
  await page.goto('/dang-nhap');
  const go = page.getByRole('button', { name: /đăng nhập/i });
  await expect(go).toBeDisabled({ timeout: 3000 });
  await page.locator('#lg-user').fill('ns-an');
  await expect(go).toBeDisabled({ timeout: 3000 });
});

test('signing out on the phone and on the desktop ends the session', async ({ page }) => {
  for (const size of [PHONE, DESKTOP]) {
    await page.setViewportSize(size);
    await signIn(page, 'ns-an');
    await page.goto('/nv/toi');
    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await expect(page).toHaveURL(/\/dang-nhap/);
    await page.goto('/nv/hom-nay');
    await expect(page).toHaveURL(/\/dang-nhap/);
    expect((await page.request.get('/api/v2/me/profile')).status()).toBe(401);
  }
});

// ---------- Đổi mật khẩu ----------

test('changing my password on the phone keeps this device, signs out the others and swaps which password works', async ({ page }) => {
  const old = passwordOf('ns-doimk');
  const next = 'DoiMoi@2026';
  const other = await sessionOf('ns-doimk');
  const w = watchPage(page);
  w.allow(/\/api\/v2\/auth\/password$/, 400);

  await page.setViewportSize(PHONE);
  await signIn(page, 'ns-doimk');
  await page.goto('/nv/toi');
  await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(page).toHaveURL(/\?hop=doi-mat-khau/);
  const submit = page.locator('form').getByRole('button', { name: 'Đổi mật khẩu' });

  // Sai mật khẩu hiện tại: máy chủ mới biết, nên báo sau khi bấm là được.
  await page.locator('#pw-current').fill('khong-phai-mat-khau');
  await page.locator('#pw-next').fill(next);
  await page.locator('#pw-again').fill(next);
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('Mật khẩu cũ không chính xác');

  await page.locator('#pw-current').fill(old);
  await submit.click();
  await expect(page.locator('#pw-current')).toHaveCount(0);

  // (a) spec 5.4: thiết bị đang đổi vẫn đăng nhập, thiết bị khác bị đăng xuất.
  await page.reload();
  await expect(page).toHaveURL(/\/nv\/toi/);
  await expect(page.getByRole('heading', { level: 1, name: 'Tôi' })).toBeVisible();
  expect((await other.get('/api/v2/me/profile')).status()).toBe(401);
  await other.dispose();

  const anon = await anonymous();
  expect((await tryLogin(anon, 'ns-doimk', old)).status).toBe(401);
  expect((await tryLogin(anon, 'ns-doimk', next)).ok).toBe(true);
  // Trả lại mật khẩu cũ cho các lần chạy sau trên cùng DB.
  const back = await anon.put('/api/v2/auth/password', { headers: json, data: { oldPassword: next, newPassword: old } });
  expect(back.status()).toBe(200);
  await anon.dispose();
  w.check();
});

test('the password form does not offer Đổi mật khẩu while it is incomplete', async ({ page }) => {
  test.fail(true, 'BUG-staff-4: nút Đổi mật khẩu luôn bật; mật khẩu mới ngắn hay nhập lại lệch thì bấm xong mới báo');
  await page.setViewportSize(PHONE);
  await signIn(page, 'ns-an');
  await page.goto('/nv/toi?hop=doi-mat-khau');
  const submit = page.locator('form').getByRole('button', { name: 'Đổi mật khẩu' });
  await expect(submit).toBeDisabled({ timeout: 3000 });
  await page.locator('#pw-current').fill(passwordOf('ns-an'));
  await page.locator('#pw-next').fill('12345');
  await page.locator('#pw-again').fill('12345');
  await expect(submit).toBeDisabled({ timeout: 3000 });
});

test('the desktop account menu opens the same password form', async ({ page }) => {
  const w = watchPage(page);
  await page.setViewportSize(DESKTOP);
  await signIn(page, 'ns-an');
  await page.goto('/nv/toi');
  await page.getByRole('region', { name: 'Tài khoản của tôi' }).getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(page).toHaveURL(/\/nv\/toi\?hop=doi-mat-khau$/);
  for (const id of ['#pw-current', '#pw-next', '#pw-again']) await expect(page.locator(id)).toBeVisible();
  w.check();
});

test('PUT /auth/password: no session is 401, short or wrong passwords are 400, never 500', async () => {
  const anon = await anonymous();
  expect((await anon.put('/api/v2/auth/password', { headers: json, data: { oldPassword: 'a', newPassword: 'bbbbbbbb' } })).status()).toBe(401);
  await anon.dispose();
  const me = await sessionOf('ns-an');
  const short = await me.put('/api/v2/auth/password', { headers: json, data: { oldPassword: passwordOf('ns-an'), newPassword: '12345' } });
  expect(short.status()).toBe(400);
  const wrong = await me.put('/api/v2/auth/password', { headers: json, data: { oldPassword: 'sai', newPassword: '1234567' } });
  expect(wrong.status()).toBe(400);
  const empty = await me.put('/api/v2/auth/password', { headers: json, data: {} });
  expect(empty.status()).toBe(400);
  // Thử hỏng không đổi gì: phiên vẫn còn.
  expect((await me.get('/api/v2/me/profile')).status()).toBe(200);
  await me.dispose();
});

// ---------- Quyền ----------

test('without a session, Admin and staff URLs go to the login page and API calls are 401', async ({ page }) => {
  await page.goto('/admin/nhan-su');
  await expect(page).toHaveURL(/\/dang-nhap\?tiep=(%2F|\/)admin(%2F|\/)nhan-su/);
  await page.goto('/nv/toi');
  await expect(page).toHaveURL(/\/dang-nhap/);

  const anon = await anonymous();
  expect(await (await anon.get('/api/v2/auth/me')).json()).toEqual({ user: null });
  for (const [method, path, data] of ADMIN_ROUTES) {
    const r = await anon.fetch(path, { method, headers: json, data: data ?? (method === 'GET' ? undefined : {}) });
    expect(r.status(), `${method} ${path}`).toBe(401);
  }
  await anon.dispose();
});

test('a staff member who opens an Admin URL lands back in the staff app', async ({ page }) => {
  await signIn(page, 'ns-an');
  for (const url of ADMIN_URLS) {
    await page.goto(url);
    await expect(page, url).toHaveURL(/\/nv\/hom-nay/);
  }
  await page.context().clearCookies();
  await page.goto('/dang-nhap?tiep=%2Fadmin%2Fnhan-su');
  await page.locator('#lg-user').fill('ns-an');
  await page.locator('#lg-pass').fill(passwordOf('ns-an'));
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await expect(page).toHaveURL(/\/nv\/hom-nay/);
});

test('a staff session gets 403 on every Admin route of this area and changes nothing', async () => {
  const staff = await sessionOf('ns-an');
  const me = await (await staff.get('/api/v2/auth/me')).json();
  expect(me.caps).toEqual([]);
  for (const [method, path, data] of ADMIN_ROUTES) {
    const r = await staff.fetch(path, { method, headers: json, data: data ?? (method === 'GET' ? undefined : {}) });
    expect(r.status(), `${method} ${path}`).toBe(403);
  }
  expect((await staff.get('/api/v2/me/profile')).status()).toBe(200);
  await staff.dispose();
  const admin = await sessionOf(ADMIN);
  const an = (await (await admin.get('/api/v2/employees/ns-an')).json()).employee;
  expect(an.account.isLocked).toBe(false);
  expect(an.profile.dependants).toBe(0);
  expect((await admin.get('/api/v2/employees/ns-chen')).status()).toBe(404);
  await admin.dispose();
});
