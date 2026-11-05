// Cài đặt › Phân quyền › Tài khoản trên BE thật (playwright.api.config.ts): đổi vai trò Nhân viên ↔ Admin có tác dụng thật
// (BUG-staff-8), ô vai trò của chính mình bị khoá, Khoá / Mở khoá và Đặt lại mật khẩu chạy đúng, "Tạo tài khoản" khoá cho
// tới khi FE có màn tạo tài khoản (BUG-staff-5 chờ FE). Tài khoản admin lấy từ PW_ADMIN_USER / PW_ADMIN_PASS. Mỗi lần
// chạy tạo một nhân sự mới qua API Admin (tên có mã lần chạy), nên chỉ chạy trên DB thử.
import { expect, request as playwrightRequest, test, type APIRequestContext, type Page } from '@playwright/test';

const ADMIN_USER = process.env.PW_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.PW_ADMIN_PASS || '';
const RUN = `R${Date.now().toString().slice(-6)}`; // một từ, viết hoa sẵn: BE giữ nguyên khi chuẩn hoá họ tên
const json = { 'Content-Type': 'application/json' };

const HAI = { name: `Phan Thị Hai ${RUN}`, username: `hai-${RUN.toLowerCase()}`, password: 'Hai@2026' };
const HAI_NEW_PASS = 'HaiMoi@2026';
const ADMIN_LABEL = 'Quản trị viên (Admin)';
const STAFF_LABEL = 'Nhân viên (Staff)';
const firstOfThisMonth = () => `${new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7)}-01`; // giờ Việt Nam

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  test.skip(!ADMIN_PASS, 'Đặt PW_ADMIN_PASS để chạy test với BE thật');
  const login = await request.post('/api/v2/auth/login', { headers: json, data: { username: ADMIN_USER, password: ADMIN_PASS } });
  expect(login.ok(), 'đăng nhập admin cho fixture').toBeTruthy();
  try {
    const created = await request.post('/api/v2/employees', {
      headers: json,
      data: {
        account: { username: HAI.username, password: HAI.password, roles: ['staff'] },
        profile: { name: { familyName: 'Phan Thị Hai', givenName: RUN } },
        contract: { status: 'thuviec', effectiveFrom: firstOfThisMonth(), position: { type: 'nv', level: 2 } }
      }
    });
    expect(created.ok(), await created.text()).toBeTruthy();
  } finally {
    await request.post('/api/v2/auth/logout', { headers: json, data: {} });
  }
});

async function signIn(page: Page, username: string, password: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dang-nhap');
  await page.locator('#lg-user').fill(username);
  await page.locator('#lg-pass').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).not.toHaveURL(/\/dang-nhap/);
}

// Phiên API riêng của một người (không dùng chung cookie với trang Admin).
async function sessionOf(baseURL: string, username: string, password: string): Promise<APIRequestContext> {
  const ctx = await playwrightRequest.newContext({ baseURL });
  const res = await ctx.post('/api/v2/auth/login', { headers: json, data: { username, password } });
  expect(res.ok(), `đăng nhập ${username}: ${await res.text()}`).toBeTruthy();
  return ctx;
}

// Thử đăng nhập bằng một phiên mới, trả mã HTTP.
async function loginStatus(baseURL: string, username: string, password: string): Promise<number> {
  const ctx = await playwrightRequest.newContext({ baseURL });
  try {
    return (await ctx.post('/api/v2/auth/login', { headers: json, data: { username, password } })).status();
  } finally {
    await ctx.dispose();
  }
}

// Người của phiên: /auth/me công khai, phiên hết hiệu lực thì trả 200 với user null.
async function userOf(ctx: APIRequestContext) {
  return (await (await ctx.get('/api/v2/auth/me')).json()).user;
}

async function openAccounts(page: Page, q: string) {
  await page.goto('/admin/cai-dat/phan-quyen/tai-khoan');
  await page.getByRole('textbox', { name: 'Tìm tên' }).fill(q);
}

const rowOf = (page: Page, username: string) =>
  page.getByRole('row').filter({ has: page.getByRole('cell', { name: username, exact: true }) });

test('Tạo tài khoản stays locked until FE has a create-account form', async ({ page }) => {
  await signIn(page, ADMIN_USER, ADMIN_PASS);
  await openAccounts(page, HAI.name);
  await expect(rowOf(page, HAI.username)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tạo tài khoản' })).toBeDisabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('changing a role from Tài khoản moves the person between staff and Admin rights', async ({ page, baseURL }) => {
  await signIn(page, ADMIN_USER, ADMIN_PASS);
  await openAccounts(page, HAI.name);
  const role = page.getByRole('combobox', { name: `Vai trò của ${HAI.name}` });
  await expect(role).toHaveValue(STAFF_LABEL);
  const hai = await sessionOf(baseURL!, HAI.username, HAI.password);
  try {
    await role.selectOption({ label: ADMIN_LABEL });
    await expect(page.getByText(`Đã đổi vai trò của ${HAI.name} thành ${ADMIN_LABEL}`)).toBeVisible();
    let me = await (await hai.get('/api/v2/auth/me')).json();
    expect(me.user.role).toBe('admin');
    expect(me.caps).toContain('staff.manage');
    expect((await hai.get('/api/v2/employees')).status()).toBe(200);

    await page.reload();
    await page.getByRole('textbox', { name: 'Tìm tên' }).fill(HAI.name);
    await expect(role).toHaveValue(ADMIN_LABEL);

    await role.selectOption({ label: STAFF_LABEL });
    await expect(page.getByText(`Đã đổi vai trò của ${HAI.name} thành ${STAFF_LABEL}`)).toBeVisible();
    me = await (await hai.get('/api/v2/auth/me')).json();
    expect(me.user.role).toBe('staff');
    expect(me.caps).toEqual([]);
    expect((await hai.get('/api/v2/employees')).status()).toBe(403);
    await page.reload();
    await page.getByRole('textbox', { name: 'Tìm tên' }).fill(HAI.name);
    await expect(role).toHaveValue(STAFF_LABEL);
  } finally {
    await hai.dispose();
  }
});

test('the signed-in Admin can neither change the role of nor lock their own row', async ({ page }) => {
  await signIn(page, ADMIN_USER, ADMIN_PASS);
  const { user } = await (await page.request.get('/api/v2/auth/me')).json();
  await openAccounts(page, user.name);
  await expect(page.getByRole('combobox', { name: `Vai trò của ${user.name}` })).toBeDisabled();
  const own = rowOf(page, user.username);
  await expect(own.getByRole('button', { name: 'Đặt lại mật khẩu' })).toBeVisible();
  await expect(own.getByRole('button', { name: /^(Khoá|Mở khoá)$/ })).toHaveCount(0);
});

test('the role picker offers only Admin and Nhân viên', async ({ page }) => {
  await signIn(page, ADMIN_USER, ADMIN_PASS);
  await openAccounts(page, HAI.name);
  await expect(page.getByRole('combobox', { name: `Vai trò của ${HAI.name}` }).locator('option')).toHaveText([ADMIN_LABEL, STAFF_LABEL]);
});

test('Khoá ends the person’s sessions and blocks sign-in; Mở khoá lets them back in', async ({ page, baseURL }) => {
  await signIn(page, ADMIN_USER, ADMIN_PASS);
  await openAccounts(page, HAI.name);
  const row = rowOf(page, HAI.username);
  const hai = await sessionOf(baseURL!, HAI.username, HAI.password);
  try {
    await row.getByRole('button', { name: 'Khoá', exact: true }).click();
    await expect(page.getByText(`Đã khoá tài khoản ${HAI.username}`)).toBeVisible();
    await expect(row).toContainText('Đã khoá');
    expect(await userOf(hai)).toBeNull();
    expect(await loginStatus(baseURL!, HAI.username, HAI.password)).toBe(403);

    await row.getByRole('button', { name: 'Mở khoá', exact: true }).click();
    await expect(page.getByText(`Đã mở khoá tài khoản ${HAI.username}`)).toBeVisible();
    await expect(row).toContainText('Đang dùng');
    expect(await loginStatus(baseURL!, HAI.username, HAI.password)).toBe(201); // đăng nhập được: POST trả 201
  } finally {
    await hai.dispose();
  }
});

test('Đặt lại mật khẩu sets the new password and ends the old sessions', async ({ page, baseURL }) => {
  await signIn(page, ADMIN_USER, ADMIN_PASS);
  await openAccounts(page, HAI.name);
  const hai = await sessionOf(baseURL!, HAI.username, HAI.password);
  try {
    await rowOf(page, HAI.username).getByRole('button', { name: 'Đặt lại mật khẩu' }).click();
    const dlg = page.getByRole('dialog', { name: 'Đặt lại mật khẩu' });
    const submit = dlg.getByRole('button', { name: 'Đặt lại mật khẩu' });
    await expect(submit).toBeDisabled();
    await dlg.getByLabel('Mật khẩu mới', { exact: true }).fill(HAI_NEW_PASS);
    await submit.click();
    await expect(dlg).toHaveCount(0);
    await expect(page.getByText(`Đã đặt lại mật khẩu cho ${HAI.username}`)).toBeVisible();

    expect(await userOf(hai)).toBeNull();
    expect(await loginStatus(baseURL!, HAI.username, HAI.password)).toBe(401);
    expect(await loginStatus(baseURL!, HAI.username, HAI_NEW_PASS)).toBe(201);
  } finally {
    await hai.dispose();
  }
});
